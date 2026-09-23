/**
 * Server-side delivery of alerts to chat channels. Channel configs hold
 * secrets (bot tokens, webhook URLs), so these run on the server only.
 */

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface WebhookUrlConfig {
  webhookUrl: string;
}

export interface AlertMessage {
  title: string;
  message: string;
  url: string;
  status: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

const STATUS_EMOJI: Record<string, string> = {
  success: '✅',
  failed: '❌',
  running: '🏃',
  canceled: '🚫',
  pending: '⏳',
  created: '🆕',
  updated: '🔄',
  opened: '📂',
  merged: '🔀',
  closed: '✅',
  push: '📤',
};

const DISCORD_COLOR: Record<string, number> = {
  success: 3066993, // green
  failed: 15158332, // red
  running: 3447003, // blue
  canceled: 10070709, // gray
  pending: 16776960, // yellow
  created: 5763719, // green
  updated: 3447003, // blue
  opened: 3447003, // blue
  merged: 5793266, // purple
  closed: 10070709, // gray
  push: 3447003, // blue
};

function statusEmoji(status: string): string {
  return STATUS_EMOJI[status] ?? '•';
}

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // Webhook endpoints do not redirect; following one would let a saved URL bounce elsewhere.
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

export async function sendTelegramAlert(config: TelegramConfig, alert: AlertMessage): Promise<void> {
  const text = `${statusEmoji(alert.status)} *${alert.title}*\n\n${alert.message}\n\n🔗 [View Details](${alert.url})`;

  const response = await postJson(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    chat_id: config.chatId,
    text,
    parse_mode: 'Markdown',
    disable_web_page_preview: false,
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { description?: unknown } | null;
    const description = typeof error?.description === 'string' ? error.description : null;
    throw new Error(description ?? `Telegram API error (HTTP ${response.status})`);
  }
}

export async function sendSlackAlert(config: WebhookUrlConfig, alert: AlertMessage): Promise<void> {
  const response = await postJson(config.webhookUrl, {
    text: `${statusEmoji(alert.status)} ${alert.title}`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${alert.title}*\n\n${alert.message}` },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Details' },
            url: alert.url,
          },
        ],
      },
    ],
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed (HTTP ${response.status})`);
  }
}

export async function sendDiscordAlert(config: WebhookUrlConfig, alert: AlertMessage): Promise<void> {
  const response = await postJson(config.webhookUrl, {
    embeds: [
      {
        title: `${statusEmoji(alert.status)} ${alert.title}`,
        description: alert.message,
        url: alert.url,
        color: DISCORD_COLOR[alert.status] ?? 9807270,
        timestamp: new Date().toISOString(),
      },
    ],
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed (HTTP ${response.status})`);
  }
}
