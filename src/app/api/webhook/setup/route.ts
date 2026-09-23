import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/auth/adapter';
import { checkOrgAccess } from '@/lib/org/scope';
import { deriveOrgWebhookSecret } from '@/lib/gitlab/webhook-secret';
import { createLogger, logSecurityEvent } from '@/lib/logger';

const log = createLogger('WebhookSetup');

const WEBHOOK_PATH = '/api/webhook/gitlab';
const ORG_ADMIN_ROLES = ['owner', 'admin'];
const NO_STORE = { 'Cache-Control': 'no-store' };

// Host header values we are willing to echo back into a URL.
const HOST_PATTERN = /^[A-Za-z0-9.-]+(:\d{1,5})?$|^\[[0-9A-Fa-f:.]+\](:\d{1,5})?$/;

interface WebhookSetupResponse {
  url: string;
  secret: string;
  scope: 'organization' | 'global';
  organizationId: string | null;
  note?: string;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function firstHeaderValue(request: NextRequest, name: string): string | null {
  const value = request.headers.get(name);
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first || null;
}

/**
 * Public origin of this dashboard as seen by the browser, honouring a reverse
 * proxy's X-Forwarded-Proto/Host so the URL is one GitLab can actually reach.
 */
function publicOrigin(request: NextRequest): string {
  const forwardedProto = firstHeaderValue(request, 'x-forwarded-proto');
  const proto =
    forwardedProto === 'https' || forwardedProto === 'http'
      ? forwardedProto
      : request.nextUrl.protocol.replace(/:$/, '');

  const forwardedHost =
    firstHeaderValue(request, 'x-forwarded-host') ?? firstHeaderValue(request, 'host');
  const host =
    forwardedHost && HOST_PATTERN.test(forwardedHost) ? forwardedHost : request.nextUrl.host;

  return `${proto}://${host}`;
}

// GET /api/webhook/setup - GitLab webhook URL and secret for the caller's organization
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuth();
    if (!auth) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { user, organizationId } = auth;

    const isAdmin = organizationId
      ? await checkOrgAccess(user.id, organizationId, ORG_ADMIN_ROLES)
      : user.role === 'admin';

    if (!isAdmin) {
      logSecurityEvent('Webhook secret requested by non-admin', {
        userId: user.id,
        organizationId,
      });
      return json({ error: 'Forbidden - organization admin role required' }, 403);
    }

    const globalSecret = process.env.GITLAB_WEBHOOK_SECRET;
    if (!globalSecret) {
      return json(
        {
          error:
            'GITLAB_WEBHOOK_SECRET is not configured. Set it in the server environment and restart the dashboard to enable GitLab webhooks.',
          code: 'WEBHOOK_SECRET_NOT_CONFIGURED',
        },
        503
      );
    }

    const origin = publicOrigin(request);

    if (organizationId) {
      const url = new URL(WEBHOOK_PATH, origin);
      url.searchParams.set('org', organizationId);
      const body: WebhookSetupResponse = {
        url: url.toString(),
        secret: deriveOrgWebhookSecret(globalSecret, organizationId),
        scope: 'organization',
        organizationId,
      };
      return json(body);
    }

    // No organization: single-tenant install. The caller is the install admin
    // who configured GITLAB_WEBHOOK_SECRET, so returning it discloses nothing new.
    const body: WebhookSetupResponse = {
      url: new URL(WEBHOOK_PATH, origin).toString(),
      secret: globalSecret,
      scope: 'global',
      organizationId: null,
      note: 'You are not a member of any organization, so this is the install-wide webhook URL secured by GITLAB_WEBHOOK_SECRET.',
    };
    return json(body);
  } catch (error) {
    log.error('Failed to build webhook setup', { error });
    return json({ error: 'Failed to load webhook setup' }, 500);
  }
}
