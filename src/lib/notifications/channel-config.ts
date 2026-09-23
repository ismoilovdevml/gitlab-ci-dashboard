/**
 * Which alert channel config fields are secret, how they are shown to the
 * browser, and how a save that leaves them masked or blank keeps the stored
 * value.
 */
import { alertChannelSchema, type AlertChannelType } from '@/lib/validation';

interface ChannelFieldSpec {
  /** Returned to the browser as stored. */
  publicFields: readonly string[];
  /** Never returned; shown as a mask. */
  secretFields: readonly string[];
  /** Secrets whose mask may include the last characters (long, random values only). */
  hintedSecrets: readonly string[];
  /** Secrets the channel works without (SMTP servers may not need auth). */
  optionalSecrets?: readonly string[];
  /**
   * Fields that decide where a secret is sent. Changing one while keeping a
   * stored secret is refused, so a secret cannot be redirected without
   * re-entering it.
   */
  targetFields: readonly string[];
}

export const CHANNEL_FIELDS: Record<AlertChannelType, ChannelFieldSpec> = {
  telegram: {
    publicFields: ['chatId'],
    secretFields: ['botToken'],
    hintedSecrets: ['botToken'],
    targetFields: ['chatId'],
  },
  // For Slack, Discord and generic webhooks the URL itself is the credential.
  slack: { publicFields: ['channel'], secretFields: ['webhookUrl'], hintedSecrets: ['webhookUrl'], targetFields: [] },
  discord: { publicFields: [], secretFields: ['webhookUrl'], hintedSecrets: ['webhookUrl'], targetFields: [] },
  email: {
    publicFields: ['smtpHost', 'smtpPort', 'from', 'to'],
    secretFields: ['username', 'password'],
    hintedSecrets: [],
    optionalSecrets: ['username', 'password'],
    targetFields: ['smtpHost', 'smtpPort'],
  },
  webhook: { publicFields: [], secretFields: ['url'], hintedSecrets: ['url'], targetFields: [] },
};

export const SECRET_MASK_PREFIX = '***';
const HINT_LENGTH = 4;
const MIN_LENGTH_FOR_HINT = 16;

const FIELD_LABELS: Record<string, string> = {
  botToken: 'bot token',
  webhookUrl: 'webhook URL',
  url: 'webhook URL',
  username: 'SMTP username',
  password: 'SMTP password',
  chatId: 'chat ID',
  smtpHost: 'SMTP host',
  smtpPort: 'SMTP port',
};

function label(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export function isAlertChannelType(type: unknown): type is AlertChannelType {
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(CHANNEL_FIELDS, type);
}

function asRecord(config: unknown): Record<string, unknown> {
  return config !== null && typeof config === 'object' && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
}

function isSet(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/** `***` plus, for long random secrets, the last four characters. */
export function maskSecret(value: string, withHint: boolean): string {
  return withHint && value.length >= MIN_LENGTH_FOR_HINT
    ? `${SECRET_MASK_PREFIX}${value.slice(-HINT_LENGTH)}`
    : SECRET_MASK_PREFIX;
}

/**
 * Config safe to send to the browser: public fields as stored, secrets masked
 * (or omitted when not set). Unknown and legacy fields are dropped.
 */
export function maskChannelConfig(type: string, config: unknown): Record<string, unknown> {
  if (!isAlertChannelType(type)) return {};
  const spec = CHANNEL_FIELDS[type];
  const stored = asRecord(config);
  const masked: Record<string, unknown> = {};
  for (const field of spec.publicFields) {
    if (stored[field] !== undefined) masked[field] = stored[field];
  }
  for (const field of spec.secretFields) {
    const value = stored[field];
    if (isSet(value)) masked[field] = maskSecret(value, spec.hintedSecrets.includes(field));
  }
  return masked;
}

export interface MaskedChannel {
  id: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
  updatedAt: Date | string;
}

export function toMaskedChannel(channel: {
  id: string;
  type: string;
  enabled: boolean;
  config: unknown;
  updatedAt: Date | string;
}): MaskedChannel {
  return {
    id: channel.id,
    type: channel.type,
    enabled: channel.enabled,
    config: maskChannelConfig(channel.type, channel.config),
    updatedAt: channel.updatedAt,
  };
}

/** The submitted config cannot be saved; the message is safe to show to the user. */
export class ChannelSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChannelSaveError';
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
  return norm(a) === norm(b);
}

/**
 * Validate a submitted channel and merge it with the stored config.
 *
 * A secret submitted blank, or exactly as the mask GET returned, keeps the
 * stored value. Any other mask-looking value is rejected rather than saved.
 * Keeping a stored secret while changing a target field is refused.
 */
export function buildChannelConfig(
  type: AlertChannelType,
  enabled: boolean,
  submitted: Record<string, unknown>,
  storedConfig: unknown | null
): { enabled: boolean; config: Record<string, unknown> } {
  const spec = CHANNEL_FIELDS[type];
  const stored = storedConfig === null ? null : asRecord(storedConfig);
  const merged: Record<string, unknown> = {};

  for (const field of spec.publicFields) {
    if (submitted[field] !== undefined) merged[field] = submitted[field];
  }

  const keptSecrets: string[] = [];
  for (const field of spec.secretFields) {
    const value = submitted[field];
    if (value !== undefined && typeof value !== 'string') {
      throw new ChannelSaveError(`Invalid ${label(field)}`);
    }
    const storedValue = stored?.[field];
    const storedMask = isSet(storedValue)
      ? maskSecret(storedValue, spec.hintedSecrets.includes(field))
      : null;
    const trimmed = value?.trim() ?? '';

    if (trimmed === '' || trimmed === storedMask) {
      if (isSet(storedValue)) {
        merged[field] = storedValue;
        keptSecrets.push(field);
      } else if (!spec.optionalSecrets?.includes(field)) {
        throw new ChannelSaveError(`Enter the ${label(field)}`);
      }
      continue;
    }
    if (trimmed.startsWith(SECRET_MASK_PREFIX)) {
      throw new ChannelSaveError(`Enter the ${label(field)} again`);
    }
    merged[field] = value;
  }

  if (stored && keptSecrets.length > 0) {
    const changedTarget = spec.targetFields.find((field) => !sameValue(merged[field], stored[field]));
    if (changedTarget) {
      throw new ChannelSaveError(
        `Enter the ${keptSecrets.map(label).join(' and ')} again to change the ${label(changedTarget)}`
      );
    }
  }

  const parsed = alertChannelSchema.safeParse({ type, enabled, config: merged });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.filter((p) => p !== 'config').join('.');
    const message = field ? `${label(String(field))}: ${issue.message}` : (issue?.message ?? 'Invalid configuration');
    throw new ChannelSaveError(message);
  }

  return { enabled: parsed.data.enabled, config: parsed.data.config as Record<string, unknown> };
}
