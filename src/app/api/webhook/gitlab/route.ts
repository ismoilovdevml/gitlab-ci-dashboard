import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import prisma from '@/lib/db/prisma';
import { createLogger, logSecurityEvent } from '@/lib/logger';
import { gitlabWebhookQuerySchema } from '@/lib/validation';
import { deriveOrgWebhookSecret } from '@/lib/gitlab/webhook-secret';
import { sendDiscordAlert, sendSlackAlert, sendTelegramAlert } from '@/lib/notifications/senders';

const log = createLogger('GitLabWebhook');

// GitLab webhook payload types
interface BaseWebhookPayload {
  object_kind: string;
  event_type?: string;
  project?: {
    id: number;
    name: string;
    web_url: string;
    namespace: string;
    path_with_namespace: string;
  };
  user?: {
    name: string;
    username: string;
    email?: string;
    avatar_url?: string;
  };
}

interface PipelinePayload extends BaseWebhookPayload {
  object_kind: 'pipeline';
  object_attributes: {
    id: number;
    iid: number;
    ref: string;
    tag: boolean;
    sha: string;
    status: string;
    created_at: string;
    finished_at: string;
    duration: number;
    web_url: string;
  };
}

interface PushPayload extends BaseWebhookPayload {
  object_kind: 'push';
  ref: string;
  checkout_sha: string;
  commits: Array<{
    id: string;
    message: string;
    title: string;
    timestamp: string;
    url: string;
    author: {
      name: string;
      email: string;
    };
  }>;
  total_commits_count: number;
}

interface MergeRequestPayload extends BaseWebhookPayload {
  object_kind: 'merge_request';
  object_attributes: {
    id: number;
    iid: number;
    title: string;
    description: string;
    state: string;
    action: string;
    source_branch: string;
    target_branch: string;
    url: string;
    created_at: string;
    updated_at: string;
  };
}

interface IssuePayload extends BaseWebhookPayload {
  object_kind: 'issue';
  object_attributes: {
    id: number;
    iid: number;
    title: string;
    description: string;
    state: string;
    action: string;
    url: string;
    created_at: string;
    updated_at: string;
    confidential?: boolean;
  };
}

interface JobPayload extends BaseWebhookPayload {
  object_kind: 'build';
  build_id: number;
  build_name: string;
  build_stage: string;
  build_status: string;
  build_started_at: string;
  build_finished_at: string;
  build_duration: number;
  build_allow_failure: boolean;
  pipeline_id: number;
  ref: string;
  tag: boolean;
  sha: string;
  commit: {
    id: number;
    sha: string;
    message: string;
    author_name: string;
    status: string;
  };
}

interface TagPayload extends BaseWebhookPayload {
  object_kind: 'tag_push';
  ref: string;
  checkout_sha: string;
  message: string;
  commits: Array<{
    id: string;
    message: string;
    title: string;
    url: string;
  }>;
}

interface WikiPayload extends BaseWebhookPayload {
  object_kind: 'wiki_page';
  object_attributes: {
    title: string;
    content: string;
    format: string;
    message: string;
    slug: string;
    url: string;
    action: string;
  };
}

interface DeploymentPayload extends BaseWebhookPayload {
  object_kind: 'deployment';
  status: string;
  deployment_id: number;
  deployable_id: number;
  deployable_url: string;
  environment: string;
  short_sha: string;
  ref: string;
}

interface ReleasePayload extends BaseWebhookPayload {
  object_kind: 'release';
  action: string;
  tag: string;
  name: string;
  description: string;
  created_at: string;
  released_at: string;
  url: string;
}

type WebhookPayload =
  | PipelinePayload
  | PushPayload
  | MergeRequestPayload
  | IssuePayload
  | JobPayload
  | TagPayload
  | WikiPayload
  | DeploymentPayload
  | ReleasePayload;

function tokensMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf-8');
  const b = Buffer.from(received, 'utf-8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Organizations whose channels may be notified. `null` stands for channels
 * created without an organization (single-tenant installs).
 */
type ScopeResult =
  | { ok: true; organizationIds: Array<string | null> }
  | { ok: false; status: number; error: string };

const UNAUTHORIZED: ScopeResult = {
  ok: false,
  status: 401,
  error: 'Unauthorized - Invalid webhook token',
};

/**
 * Authenticate the request and decide which organization it belongs to.
 *
 * - `?org=<id>`: must carry that org's derived secret; only that org is notified.
 *   The global secret is not accepted here because in a multi-org install it
 *   may be known to members of every org.
 * - No `org` (legacy URL): checked against GITLAB_WEBHOOK_SECRET. With at most
 *   one organization the install is single-tenant, so that org and unowned
 *   channels are notified. With several orgs the owner cannot be determined, so
 *   only unowned channels are notified.
 */
async function resolveWebhookScope(request: NextRequest): Promise<ScopeResult> {
  const globalSecret = process.env.GITLAB_WEBHOOK_SECRET;
  const received = request.headers.get('X-Gitlab-Token');

  const query = gitlabWebhookQuerySchema.safeParse({
    org: request.nextUrl.searchParams.get('org') ?? undefined,
  });
  if (!query.success) {
    return { ok: false, status: 400, error: 'Invalid org parameter' };
  }
  const orgId = query.data.org;

  if (orgId) {
    if (!globalSecret) {
      log.warn('Per-organization webhook received but GITLAB_WEBHOOK_SECRET is not configured');
      return { ok: false, status: 503, error: 'Webhook secret not configured' };
    }
    if (!received) {
      logSecurityEvent('GitLab webhook rejected: missing X-Gitlab-Token header', { orgId });
      return UNAUTHORIZED;
    }
    if (!tokensMatch(deriveOrgWebhookSecret(globalSecret, orgId), received)) {
      logSecurityEvent('GitLab webhook rejected: invalid X-Gitlab-Token header', { orgId });
      return UNAUTHORIZED;
    }
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    });
    if (!org) {
      return { ok: false, status: 404, error: 'Organization not found' };
    }
    return { ok: true, organizationIds: [org.id] };
  }

  if (!globalSecret) {
    log.warn('GITLAB_WEBHOOK_SECRET not configured - webhook validation disabled');
  } else if (!received) {
    logSecurityEvent('GitLab webhook rejected: missing X-Gitlab-Token header');
    return UNAUTHORIZED;
  } else if (!tokensMatch(globalSecret, received)) {
    logSecurityEvent('GitLab webhook rejected: invalid X-Gitlab-Token header');
    return UNAUTHORIZED;
  }

  const orgs = await prisma.organization.findMany({ select: { id: true }, take: 2 });
  if (orgs.length <= 1) {
    return { ok: true, organizationIds: [null, ...orgs.map((o) => o.id)] };
  }

  log.warn(
    'Webhook without org parameter in a multi-organization install; only channels without an organization are notified'
  );
  return { ok: true, organizationIds: [null] };
}

// POST /api/webhook/gitlab[?org=<organizationId>] - Receive GitLab webhook
export async function POST(request: NextRequest) {
  try {
    const scope = await resolveWebhookScope(request);
    if (!scope.ok) {
      return NextResponse.json({ error: scope.error }, { status: scope.status });
    }

    const payload: WebhookPayload = await request.json();

    log.info('Webhook received', {
      event: payload.object_kind,
      projectId: payload.project?.id,
      organizationIds: scope.organizationIds,
    });

    const channels = await prisma.alertChannel.findMany({
      where: {
        enabled: true,
        OR: scope.organizationIds.map((organizationId) => ({ organizationId })),
      },
    });

    if (channels.length === 0) {
      log.debug('No alert channels enabled; webhook ignored');
      return NextResponse.json({ message: 'No channels configured' });
    }

    // Format message based on event type
    const alert = formatEventMessage(payload);

    // Send alerts through all enabled channels
    for (const channel of channels) {
      try {
        if (channel.type === 'telegram') {
          await sendTelegramAlert(channel.config as { botToken: string; chatId: string }, alert);
        } else if (channel.type === 'slack') {
          await sendSlackAlert(channel.config as { webhookUrl: string }, alert);
        } else if (channel.type === 'discord') {
          await sendDiscordAlert(channel.config as { webhookUrl: string }, alert);
        }

        await prisma.alertHistory.create({
          data: {
            organizationId: channel.organizationId,
            projectName: payload.project?.name || 'Unknown',
            pipelineId: getPipelineId(payload),
            status: payload.object_kind,
            channel: channel.type,
            message: `${payload.object_kind} event sent via ${channel.type}`,
            sent: true,
          },
        });

        log.debug('Alert sent', { channel: channel.type });
      } catch (error) {
        log.error('Failed to send alert', { channel: channel.type, error });

        await prisma.alertHistory.create({
          data: {
            organizationId: channel.organizationId,
            projectName: payload.project?.name || 'Unknown',
            pipelineId: getPipelineId(payload),
            status: payload.object_kind,
            channel: channel.type,
            message: `Failed to send ${payload.object_kind} event`,
            sent: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    }

    return NextResponse.json({ message: 'Webhook processed successfully' });
  } catch (error) {
    log.error('Webhook processing failed', { error });
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    );
  }
}

// Helper function to format event message
function formatEventMessage(payload: WebhookPayload): {
  title: string;
  message: string;
  url: string;
  status: string;
} {
  const projectName = payload.project?.name || 'Unknown';
  const userName = payload.user?.name || 'Unknown';

  switch (payload.object_kind) {
    case 'pipeline': {
      const p = payload as PipelinePayload;
      const duration = p.object_attributes.duration
        ? `\n⏱️ Duration: ${Math.floor(p.object_attributes.duration / 60)}m ${p.object_attributes.duration % 60}s`
        : '';
      return {
        title: `Pipeline ${p.object_attributes.status.toUpperCase()}`,
        message: `📦 *Project:* ${projectName}\n🔢 *Pipeline:* #${p.object_attributes.id}\n🌿 *Branch:* \`${p.object_attributes.ref}\`\n📊 *Status:* ${p.object_attributes.status.toUpperCase()}${duration}\n👤 *By:* ${userName}`,
        url: p.object_attributes.web_url,
        status: p.object_attributes.status,
      };
    }

    case 'push': {
      const p = payload as PushPayload;
      const branch = p.ref.replace('refs/heads/', '');
      const commits = p.commits?.slice(0, 3) || [];
      const commitList = commits.map(c => `  • ${c.title}`).join('\n');
      const moreCommits = p.total_commits_count > 3 ? `\n  ... and ${p.total_commits_count - 3} more` : '';
      return {
        title: `📤 Push to ${branch}`,
        message: `📦 *Project:* ${projectName}\n🌿 *Branch:* \`${branch}\`\n📝 *Commits:* ${p.total_commits_count}\n${commitList}${moreCommits}\n👤 *By:* ${userName}`,
        url: payload.project?.web_url || '',
        status: 'push',
      };
    }

    case 'merge_request': {
      const mr = payload as MergeRequestPayload;
      const actionEmoji = {
        open: '📂',
        close: '🔒',
        reopen: '🔓',
        update: '🔄',
        merge: '🔀',
        approved: '✅',
        unapproved: '❌',
      }[mr.object_attributes.action] || '📝';
      return {
        title: `${actionEmoji} MR ${mr.object_attributes.action.toUpperCase()}`,
        message: `📦 *Project:* ${projectName}\n📝 *MR:* !${mr.object_attributes.iid} - ${mr.object_attributes.title}\n🌿 *Branch:* \`${mr.object_attributes.source_branch}\` → \`${mr.object_attributes.target_branch}\`\n📊 *State:* ${mr.object_attributes.state}\n👤 *By:* ${userName}`,
        url: mr.object_attributes.url,
        status: mr.object_attributes.state,
      };
    }

    case 'issue': {
      const issue = payload as IssuePayload;
      const confidential = issue.object_attributes.confidential ? '🔒 ' : '';
      return {
        title: `${confidential}Issue ${issue.object_attributes.action}`,
        message: `📦 Project: ${projectName}\n📋 Issue: #${issue.object_attributes.iid} - ${issue.object_attributes.title}\n📊 State: ${issue.object_attributes.state}\n👤 By: ${userName}`,
        url: issue.object_attributes.url,
        status: issue.object_attributes.state,
      };
    }

    case 'build': {
      const job = payload as JobPayload;
      const jobUrl = payload.project?.web_url
        ? `${payload.project.web_url}/-/jobs/${job.build_id}`
        : '';
      const duration = job.build_duration
        ? `\n⏱️ *Duration:* ${Math.floor(job.build_duration / 60)}m ${job.build_duration % 60}s`
        : '';
      return {
        title: `🔨 Job ${job.build_status.toUpperCase()}`,
        message: `📦 *Project:* ${projectName}\n🔨 *Job:* ${job.build_name}\n📊 *Stage:* ${job.build_stage}\n📊 *Status:* ${job.build_status.toUpperCase()}\n🌿 *Branch:* \`${job.ref}\`${duration}\n👤 *By:* ${userName}`,
        url: jobUrl,
        status: job.build_status,
      };
    }

    case 'tag_push': {
      const tag = payload as TagPayload;
      const tagName = tag.ref.replace('refs/tags/', '');
      return {
        title: `Tag Created: ${tagName}`,
        message: `📦 Project: ${projectName}\n🏷️ Tag: ${tagName}\n👤 Created by: ${userName}`,
        url: payload.project?.web_url || '',
        status: 'created',
      };
    }

    case 'wiki_page': {
      const wiki = payload as WikiPayload;
      return {
        title: `Wiki Page ${wiki.object_attributes.action}`,
        message: `📦 Project: ${projectName}\n📄 Page: ${wiki.object_attributes.title}\n📊 Action: ${wiki.object_attributes.action}\n👤 By: ${userName}`,
        url: wiki.object_attributes.url,
        status: wiki.object_attributes.action,
      };
    }

    case 'deployment': {
      const deploy = payload as DeploymentPayload;
      return {
        title: `Deployment ${deploy.status.toUpperCase()}`,
        message: `📦 Project: ${projectName}\n🚀 Environment: ${deploy.environment}\n📊 Status: ${deploy.status}\n🌿 Ref: ${deploy.ref}\n👤 By: ${userName}`,
        url: deploy.deployable_url,
        status: deploy.status,
      };
    }

    case 'release': {
      const release = payload as ReleasePayload;
      return {
        title: `Release ${release.action}: ${release.tag}`,
        message: `📦 Project: ${projectName}\n🎉 Release: ${release.name}\n🏷️ Tag: ${release.tag}\n📊 Action: ${release.action}\n👤 By: ${userName}`,
        url: release.url,
        status: release.action,
      };
    }

    default: {
      const p = payload as BaseWebhookPayload;
      return {
        title: `GitLab Event: ${p.object_kind}`,
        message: `📦 Project: ${projectName}\n📊 Event: ${p.object_kind}\n👤 By: ${userName}`,
        url: p.project?.web_url || '',
        status: 'unknown',
      };
    }
  }
}

// Helper to get pipeline ID from any payload
function getPipelineId(payload: WebhookPayload): number {
  if ('object_attributes' in payload && 'id' in payload.object_attributes) {
    return payload.object_attributes.id;
  }
  if ('pipeline_id' in payload) {
    return payload.pipeline_id;
  }
  if ('deployment_id' in payload) {
    return payload.deployment_id;
  }
  return 0;
}

// GET endpoint to verify webhook is working
export async function GET() {
  return NextResponse.json({
    message: 'GitLab webhook endpoint is ready',
    endpoint: '/api/webhook/gitlab',
    supported_events: [
      'pipeline',
      'push',
      'tag_push',
      'merge_request',
      'issue',
      'confidential_issue',
      'build (job)',
      'wiki_page',
      'deployment',
      'release',
    ],
  });
}
