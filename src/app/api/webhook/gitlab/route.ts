import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { cacheHelpers } from '@/lib/db/redis';

interface GitLabWebhookPayload {
  object_kind: string;
  object_attributes: {
    id: number;
    status: string;
    ref: string;
    sha: string;
    web_url: string;
    created_at: string;
    finished_at: string;
  };
  project: {
    id: number;
    name: string;
    web_url: string;
  };
  user: {
    name: string;
    username: string;
  };
}

// POST /api/webhook/gitlab - Receive GitLab webhook
export async function POST(request: NextRequest) {
  try {
    const payload: GitLabWebhookPayload = await request.json();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎣 GITLAB WEBHOOK RECEIVED');
    console.log('📦 Project:', payload.project?.name);
    console.log('🔢 Pipeline ID:', payload.object_attributes?.id);
    console.log('📊 Status:', payload.object_attributes?.status);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Only process pipeline events
    if (payload.object_kind !== 'pipeline') {
      console.log('⏭️ Not a pipeline event, ignoring');
      return NextResponse.json({ message: 'Not a pipeline event' });
    }

    const pipelineId = payload.object_attributes.id;
    const projectId = payload.project.id;
    const status = payload.object_attributes.status;
    const projectName = payload.project.name;
    const webUrl = payload.object_attributes.web_url;

    // Check if this is a status change (not initial webhook)
    const existingStatus = await prisma.pipelineStatus.findUnique({
      where: {
        projectId_pipelineId: {
          projectId,
          pipelineId,
        },
      },
    });

    console.log('🔍 Previous status:', existingStatus?.status || 'none');
    console.log('🔍 Current status:', status);

    // Update or create pipeline status
    await prisma.pipelineStatus.upsert({
      where: {
        projectId_pipelineId: {
          projectId,
          pipelineId,
        },
      },
      update: {
        status,
        updatedAt: new Date(),
      },
      create: {
        projectId,
        pipelineId,
        status,
      },
    });

    // Get alert rules and channels (cached for 60 seconds to prevent N+1 query problem)
    const [rules, channels] = await Promise.all([
      cacheHelpers.getOrSet(
        'alert:active-rules',
        async () => await prisma.alertRule.findMany({ where: { enabled: true } }),
        60 // Cache for 60 seconds
      ),
      cacheHelpers.getOrSet(
        'alert:active-channels',
        async () => await prisma.alertChannel.findMany({ where: { enabled: true } }),
        60 // Cache for 60 seconds
      ),
    ]);

    console.log('📋 Alert rules:', rules.length);
    console.log('📋 Enabled channels:', channels.length);

    if (rules.length === 0 || channels.length === 0) {
      console.log('⚠️ No rules or channels configured');
      return NextResponse.json({ message: 'No alerts configured' });
    }

    // Check if we should send alert
    for (const rule of rules) {
      // Check if rule applies to this project
      if (rule.projectId !== 'all' && Number(rule.projectId) !== projectId) {
        console.log(`⏭️ Rule "${rule.name}" - project mismatch`);
        continue;
      }

      // Check if status matches rule events
      const events = rule.events as {
        success: boolean;
        failed: boolean;
        running: boolean;
        canceled: boolean;
      };

      const shouldAlert =
        (events.success && status === 'success') ||
        (events.failed && status === 'failed') ||
        (events.running && status === 'running') ||
        (events.canceled && status === 'canceled');

      console.log(`🎯 Rule "${rule.name}": shouldAlert=${shouldAlert} (status=${status})`);

      if (!shouldAlert) {
        continue;
      }

      // Send alerts through configured channels
      for (const channelType of rule.channels) {
        const channel = channels.find((c) => c.type === channelType);
        if (!channel) {
          console.log(`⚠️ Channel ${channelType} not found or not enabled`);
          continue;
        }

        console.log(`📤 Sending alert via ${channelType}...`);

        try {
          if (channelType === 'telegram') {
            await sendTelegramAlert(
              channel.config as { botToken: string; chatId: string },
              projectName,
              pipelineId,
              status,
              webUrl,
              payload.user?.name || 'Unknown'
            );
          } else if (channelType === 'slack') {
            await sendSlackAlert(
              channel.config as { webhookUrl: string },
              projectName,
              pipelineId,
              status,
              webUrl,
              payload.user?.name || 'Unknown'
            );
          } else if (channelType === 'discord') {
            await sendDiscordAlert(
              channel.config as { webhookUrl: string },
              projectName,
              pipelineId,
              status,
              webUrl,
              payload.user?.name || 'Unknown'
            );
          }

          // Save to history
          await prisma.alertHistory.create({
            data: {
              projectName,
              pipelineId,
              status,
              channel: channelType,
              message: `${status} alert sent via ${channelType}`,
              sent: true,
            },
          });

          console.log(`✅ Alert sent via ${channelType}`);
        } catch (error) {
          console.error(`❌ Failed to send alert via ${channelType}:`, error);

          // Save failed attempt
          await prisma.alertHistory.create({
            data: {
              projectName,
              pipelineId,
              status,
              channel: channelType,
              message: `Failed to send ${status} alert`,
              sent: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          });
        }
      }
    }

    console.log('✅ Webhook processed successfully');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return NextResponse.json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('❌ Webhook processing failed:', error);
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    );
  }
}

// Helper function to send Telegram alert
async function sendTelegramAlert(
  config: { botToken: string; chatId: string },
  projectName: string,
  pipelineId: number,
  status: string,
  webUrl: string,
  triggeredBy: string
) {
  const statusEmoji = {
    success: '✅',
    failed: '❌',
    running: '🏃',
    canceled: '🚫',
  }[status] || '•';

  const statusText = {
    success: 'SUCCESS',
    failed: 'FAILED',
    running: 'RUNNING',
    canceled: 'CANCELED',
  }[status] || status.toUpperCase();

  const message =
    `${statusEmoji} *Pipeline ${statusText}*\n\n` +
    `📦 *Project:* ${projectName}\n` +
    `🔢 *Pipeline ID:* #${pipelineId}\n` +
    `📊 *Status:* ${statusText}\n` +
    `👤 *Triggered by:* ${triggeredBy}\n\n` +
    `🔗 [View Pipeline](${webUrl})`;

  const response = await fetch(
    `https://api.telegram.org/bot${config.botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.description || 'Telegram API error');
  }

  console.log('✅ Telegram alert sent successfully');
}

// Helper function to send Slack alert
async function sendSlackAlert(
  config: { webhookUrl: string },
  projectName: string,
  pipelineId: number,
  status: string,
  webUrl: string,
  triggeredBy: string
) {
  const statusEmoji = {
    success: '✅',
    failed: '❌',
    running: '🏃',
    canceled: '🚫',
  }[status] || '•';

  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `${statusEmoji} Pipeline ${status.toUpperCase()}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Pipeline ${status.toUpperCase()}*\n\n📦 Project: ${projectName}\n🔢 Pipeline: #${pipelineId}\n👤 Triggered by: ${triggeredBy}`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View Pipeline' },
              url: webUrl,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error('Slack webhook failed');
  }

  console.log('✅ Slack alert sent successfully');
}

// Helper function to send Discord alert
async function sendDiscordAlert(
  config: { webhookUrl: string },
  projectName: string,
  pipelineId: number,
  status: string,
  webUrl: string,
  triggeredBy: string
) {
  const statusEmoji = {
    success: '✅',
    failed: '❌',
    running: '🏃',
    canceled: '🚫',
  }[status] || '•';

  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `${statusEmoji} **Pipeline ${status.toUpperCase()}**\n\n📦 Project: ${projectName}\n🔢 Pipeline: #${pipelineId}\n👤 Triggered by: ${triggeredBy}\n🔗 ${webUrl}`,
    }),
  });

  if (!response.ok) {
    throw new Error('Discord webhook failed');
  }

  console.log('✅ Discord alert sent successfully');
}

// GET endpoint to verify webhook is working
export async function GET() {
  return NextResponse.json({
    message: 'GitLab webhook endpoint is ready',
    endpoint: '/api/webhook/gitlab',
  });
}
