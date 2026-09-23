import {
  sendDiscordAlert,
  sendSlackAlert,
  sendTelegramAlert,
  type AlertMessage,
  type TelegramConfig,
  type WebhookUrlConfig,
} from './senders';

export * from './senders';
export * from './channel-config';

/** Channel types that alerts are delivered to (see the GitLab webhook route). */
export const DELIVERABLE_CHANNEL_TYPES = ['telegram', 'slack', 'discord'] as const;
export type DeliverableChannelType = (typeof DELIVERABLE_CHANNEL_TYPES)[number];

export function isDeliverableChannelType(type: unknown): type is DeliverableChannelType {
  return typeof type === 'string' && (DELIVERABLE_CHANNEL_TYPES as readonly string[]).includes(type);
}

/** The saved channel config is incomplete; the message is safe to show to the user. */
export class ChannelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChannelConfigError';
  }
}

function requiredString(config: Record<string, unknown>, key: string, label: string): string {
  const value = config[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ChannelConfigError(`${label} is not set`);
  }
  return value.trim();
}

function webhookUrl(config: Record<string, unknown>): string {
  const value = requiredString(config, 'webhookUrl', 'Webhook URL');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ChannelConfigError('Webhook URL is not a valid URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ChannelConfigError('Webhook URL must use http or https');
  }
  // Configs saved before save-time validation existed may still carry these.
  if (url.username || url.password) {
    throw new ChannelConfigError('Webhook URL must not contain credentials');
  }
  return url.toString();
}

function asRecord(config: unknown): Record<string, unknown> {
  return config !== null && typeof config === 'object' ? (config as Record<string, unknown>) : {};
}

export function parseTelegramConfig(config: unknown): TelegramConfig {
  const record = asRecord(config);
  return {
    botToken: requiredString(record, 'botToken', 'Bot token'),
    chatId: requiredString(record, 'chatId', 'Chat ID'),
  };
}

export function parseWebhookUrlConfig(config: unknown): WebhookUrlConfig {
  return { webhookUrl: webhookUrl(asRecord(config)) };
}

/** Validate a stored channel config and send one alert through it. */
export async function sendChannelAlert(
  type: DeliverableChannelType,
  config: unknown,
  alert: AlertMessage
): Promise<void> {
  switch (type) {
    case 'telegram':
      return sendTelegramAlert(parseTelegramConfig(config), alert);
    case 'slack':
      return sendSlackAlert(parseWebhookUrlConfig(config), alert);
    case 'discord':
      return sendDiscordAlert(parseWebhookUrlConfig(config), alert);
  }
}
