'use client';

import { useEffect, useRef } from 'react';
import { useDashboardStore } from '@/store/dashboard-store';
import { getGitLabAPI } from '@/lib/gitlab-api';

interface AlertChannelDB {
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

interface AlertRuleEvents {
  success: boolean;
  failed: boolean;
  running: boolean;
  canceled: boolean;
}

interface AlertRule {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  channels: string[];
  events: AlertRuleEvents;
  enabled: boolean;
}

export function usePipelineAlerts() {
  const { projects } = useDashboardStore();
  const previousStatusRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!projects || projects.length === 0) {
      console.log('⚠️ No projects loaded yet');
      return;
    }

    const checkPipelines = async () => {
      try {
        // Load alert configuration from API
        const [channelsRes, rulesRes] = await Promise.all([
          fetch('/api/channels'),
          fetch('/api/rules'),
        ]);

        if (!channelsRes.ok || !rulesRes.ok) {
          console.log('⚠️ Failed to load alert configuration from API');
          return;
        }

        const channels: AlertChannelDB[] = await channelsRes.json();
        const alertRules: AlertRule[] = await rulesRes.json();

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔍 CHECKING ALERTS (Database)...');
        console.log('📋 Projects loaded:', projects.length);
        console.log('📋 Channels configured:', channels.length);
        console.log('📋 Alert rules:', alertRules.length);

        if (alertRules.length === 0) {
          console.log('⚠️ No alert rules found - Please configure alerts in Alerting tab');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          return;
        }

        const enabledRules = alertRules.filter(rule => rule.enabled);
        console.log('✅ Enabled rules:', enabledRules.length);
        console.log('📊 Rules:', enabledRules.map(r => `${r.name} (${r.projectName})`));

        if (enabledRules.length === 0) {
          console.log('⚠️ No enabled rules - Please enable at least one rule');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          return;
        }

        // Check enabled channels
        const enabledChannels = channels.filter(c => c.enabled).map(c => c.type);
        console.log('📢 Enabled channels:', enabledChannels.join(', ') || 'none');

        // Build channel config map
        const channelConfigMap = new Map<string, Record<string, unknown>>();
        channels.forEach(ch => {
          if (ch.enabled) {
            channelConfigMap.set(ch.type, ch.config);
          }
        });

        const api = getGitLabAPI();

        for (const project of projects) {
          try {
            console.log(`🔍 Checking project: ${project.name}`);
            const pipelines = await api.getPipelines(project.id, 1, 5);

            if (pipelines.length === 0) {
              console.log(`⚠️ No pipelines found for ${project.name}`);
              continue;
            }

            const latestPipeline = pipelines[0];

            console.log(`  📊 Pipeline #${latestPipeline.id}: ${latestPipeline.status}`);

            // Check if status changed
            const pipelineKey = `${project.id}-${latestPipeline.id}`;
            const previousStatus = previousStatusRef.current.get(pipelineKey);
            const statusChanged = previousStatus && previousStatus !== latestPipeline.status;

            console.log(`  🔄 Previous: ${previousStatus || 'none'} → Current: ${latestPipeline.status} (changed: ${statusChanged})`);

            // Alert ONLY if status changed (not on first load)
            if (statusChanged) {
              // Check if any rule matches this pipeline
              let alertSent = false;
              for (const rule of enabledRules) {
                if (rule.projectId !== 'all' && Number(rule.projectId) !== project.id) {
                  console.log(`  ⏭️ Rule "${rule.name}" - project mismatch`);
                  continue;
                }

                const shouldAlert =
                  (rule.events.success && latestPipeline.status === 'success') ||
                  (rule.events.failed && latestPipeline.status === 'failed') ||
                  (rule.events.running && latestPipeline.status === 'running') ||
                  (rule.events.canceled && latestPipeline.status === 'canceled');

                console.log(`  🎯 Rule "${rule.name}": shouldAlert=${shouldAlert}`);

                if (shouldAlert) {
                  console.log(`  🚨 SENDING ALERT!`);
                  await sendAlerts(
                    rule,
                    channelConfigMap,
                    project.name,
                    latestPipeline.id,
                    latestPipeline.status,
                    latestPipeline.web_url
                  );
                  alertSent = true;
                }
              }

              if (!alertSent) {
                console.log(`  ℹ️ No matching rule for ${latestPipeline.status}`);
              }
            } else {
              console.log(`  ⏭️ Status unchanged, skipping`);
            }

            // Update previous status
            previousStatusRef.current.set(pipelineKey, latestPipeline.status);
          } catch (error) {
            console.error(`❌ Failed to check pipelines for project ${project.id}:`, error);
          }
        }

        console.log('✅ Alert check completed');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      } catch (error) {
        console.error('Failed to check pipeline alerts:', error);
      }
    };

    // Check immediately and then every 30 seconds
    checkPipelines();
    const interval = setInterval(checkPipelines, 30000);

    return () => clearInterval(interval);
  }, [projects]);
}

async function sendAlerts(
  rule: AlertRule,
  channelConfigMap: Map<string, Record<string, unknown>>,
  projectName: string,
  pipelineId: number,
  status: string,
  webUrl: string
) {
  const statusEmoji = {
    success: '✅',
    failed: '❌',
    running: '🏃',
    canceled: '🚫'
  }[status] || '•';

  const statusText = {
    success: 'SUCCESS',
    failed: 'FAILED',
    running: 'RUNNING',
    canceled: 'CANCELED'
  }[status] || status.toUpperCase();

  const message = `${statusEmoji} *Pipeline ${statusText}*\n\n` +
    `📦 *Project:* ${projectName}\n` +
    `🔢 *Pipeline ID:* #${pipelineId}\n` +
    `📊 *Status:* ${statusText}\n\n` +
    `🔗 [View Pipeline](${webUrl})`;

  console.log(`📤 Preparing to send alerts. Channels: ${rule.channels.join(', ')}`);

  // Send to Telegram
  if (rule.channels.includes('telegram') && channelConfigMap.has('telegram')) {
    try {
      console.log(`📱 Sending to Telegram...`);
      const telegramConfig = channelConfigMap.get('telegram') as { botToken: string; chatId: string } | undefined;
      if (!telegramConfig) {
        console.log(`⚠️ Telegram config not found`);
        return;
      }
      const { botToken, chatId } = telegramConfig;
      console.log(`📱 Bot token: ${botToken?.substring(0, 10)}...`);
      console.log(`📱 Chat ID: ${chatId}`);

      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
          disable_web_page_preview: false,
        }),
      });

      const responseData = await response.json();
      console.log(`📱 Telegram API response:`, responseData);

      if (response.ok) {
        console.log(`✅ Telegram alert sent successfully!`);
      } else {
        console.error(`❌ Telegram API error:`, responseData);
      }

      // Save to history via API
      await saveAlertHistory({
        projectName,
        pipelineId,
        status,
        channel: 'telegram',
        message: `Sent ${status} alert`,
        sent: response.ok,
      });
    } catch (error) {
      console.error('❌ Failed to send Telegram alert:', error);
      await saveAlertHistory({
        projectName,
        pipelineId,
        status,
        channel: 'telegram',
        message: `Failed to send ${status} alert`,
        sent: false,
      });
    }
  } else {
    console.log(`⚠️ Telegram not in channels or not enabled`);
  }

  // Send to Slack
  if (rule.channels.includes('slack') && channelConfigMap.has('slack')) {
    try {
      const slackConfig = channelConfigMap.get('slack') as { webhookUrl: string } | undefined;
      if (!slackConfig) return;
      const { webhookUrl } = slackConfig;
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${statusEmoji} Pipeline ${status.toUpperCase()}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Pipeline ${status.toUpperCase()}*\n\n📦 Project: ${projectName}\n🔢 Pipeline: #${pipelineId}`,
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

      await saveAlertHistory({
        projectName,
        pipelineId,
        status,
        channel: 'slack',
        message: `Sent ${status} alert`,
        sent: true,
      });
    } catch (error) {
      console.error('Failed to send Slack alert:', error);
    }
  }

  // Send to Discord
  if (rule.channels.includes('discord') && channelConfigMap.has('discord')) {
    try {
      const discordConfig = channelConfigMap.get('discord') as { webhookUrl: string } | undefined;
      if (!discordConfig) return;
      const { webhookUrl } = discordConfig;
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `${statusEmoji} **Pipeline ${status.toUpperCase()}**\n\n📦 Project: ${projectName}\n🔢 Pipeline: #${pipelineId}\n🔗 ${webUrl}`,
        }),
      });

      await saveAlertHistory({
        projectName,
        pipelineId,
        status,
        channel: 'discord',
        message: `Sent ${status} alert`,
        sent: true,
      });
    } catch (error) {
      console.error('Failed to send Discord alert:', error);
    }
  }
}

async function saveAlertHistory(alert: {
  projectName: string;
  pipelineId: number;
  status: string;
  channel: string;
  message: string;
  sent: boolean;
}) {
  try {
    await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert),
    });
  } catch (error) {
    console.error('Failed to save alert history:', error);
  }
}
