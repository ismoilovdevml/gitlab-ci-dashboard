import { z } from 'zod';

// ==========================================
// Authentication Schemas
// ==========================================

export const loginSchema = z.object({
  username: z.string().min(3).max(50).trim(),
  password: z.string().min(6).max(100),
});

export const registerSchema = z.object({
  username: z.string().min(3).max(50).trim(),
  password: z.string().min(8).max(100),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'user', 'viewer']).default('user'),
});

// ==========================================
// GitLab Configuration Schemas
// ==========================================

export const gitlabConfigSchema = z.object({
  url: z.string().url(),
  token: z.string().min(10),
  autoRefresh: z.boolean().default(true),
  refreshInterval: z.number().min(5000).max(300000).default(10000),
  theme: z.enum(['light', 'dark']).default('dark'),
  notifyPipelineFailures: z.boolean().default(true),
  notifyPipelineSuccess: z.boolean().default(false),
});

/**
 * Body of POST /api/config. Every field is optional so a partial update leaves
 * the other columns untouched. The URL is normalised separately with
 * normalizeGitLabBaseUrl.
 */
export const userGitLabConfigUpdateSchema = z.object({
  url: z.string().max(2048).optional(),
  token: z.string().max(1024).optional(),
  autoRefresh: z.boolean().optional(),
  refreshInterval: z.number().int().min(5000).max(300000).optional(),
  theme: z.enum(['light', 'dark']).optional(),
  notifyPipelineFailures: z.boolean().optional(),
  notifyPipelineSuccess: z.boolean().optional(),
});

/**
 * Body of POST /api/gitlab (org GitLab connection). The URL is normalised
 * separately with normalizeGitLabBaseUrl.
 */
export const orgGitLabConnectionSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  token: z.string().trim().min(1).max(1024),
  configId: z.string().trim().min(1).max(128).optional(),
});

/** Query params of POST /api/webhook/gitlab. */
export const gitlabWebhookQuerySchema = z.object({
  org: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
});

// ==========================================
// Alert Channel Schemas
// ==========================================

/**
 * An http(s) URL without embedded credentials, normalised by the URL parser.
 * Alerts are POSTed to these URLs from the server.
 */
export const httpUrlSchema = z
  .string()
  .trim()
  .min(1, 'URL is required')
  .max(2048)
  .transform((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Must be a valid URL' });
      return z.NEVER;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      ctx.addIssue({ code: 'custom', message: 'URL must use http or https' });
      return z.NEVER;
    }
    if (url.username || url.password) {
      ctx.addIssue({ code: 'custom', message: 'URL must not contain credentials' });
      return z.NEVER;
    }
    return url.toString();
  });

export const ALERT_CHANNEL_TYPES = ['telegram', 'slack', 'discord', 'email', 'webhook'] as const;
export const alertChannelTypeSchema = z.enum(ALERT_CHANNEL_TYPES);

export const telegramConfigSchema = z.object({
  botToken: z
    .string()
    .trim()
    .regex(/^\d{3,20}:[A-Za-z0-9_-]{20,100}$/, 'Bot token must look like 123456789:ABC...'),
  // Numeric chat/group/channel id, or @username of a public channel.
  chatId: z
    .string()
    .trim()
    .regex(/^(-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{3,31})$/, 'Chat ID must be a number or @channelname'),
});

export const slackConfigSchema = z.object({
  webhookUrl: httpUrlSchema,
  channel: z.string().trim().max(80).optional(),
});

export const discordConfigSchema = z.object({
  webhookUrl: httpUrlSchema,
});

const emailListSchema = z
  .string()
  .trim()
  .min(1, 'At least one recipient is required')
  .max(2048)
  .transform((value, ctx) => {
    const addresses = value.split(',').map((a) => a.trim()).filter(Boolean);
    for (const address of addresses) {
      if (!z.string().email().safeParse(address).success) {
        ctx.addIssue({ code: 'custom', message: `Invalid recipient: ${address}` });
        return z.NEVER;
      }
    }
    return addresses.join(', ');
  });

export const emailConfigSchema = z.object({
  smtpHost: z
    .string()
    .trim()
    .min(1, 'SMTP host is required')
    .max(253)
    .regex(/^[A-Za-z0-9.-]+$/, 'SMTP host must be a hostname or IP address'),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  username: z.string().trim().max(256).optional(),
  password: z.string().max(1024).optional(),
  from: z.string().trim().email(),
  to: emailListSchema,
});

export const webhookConfigSchema = z.object({
  url: httpUrlSchema,
});

/** Stored config shape per channel type, validated on save. */
export const alertChannelSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('telegram'), enabled: z.boolean().default(false), config: telegramConfigSchema }),
  z.object({ type: z.literal('slack'), enabled: z.boolean().default(false), config: slackConfigSchema }),
  z.object({ type: z.literal('discord'), enabled: z.boolean().default(false), config: discordConfigSchema }),
  z.object({ type: z.literal('email'), enabled: z.boolean().default(false), config: emailConfigSchema }),
  z.object({ type: z.literal('webhook'), enabled: z.boolean().default(false), config: webhookConfigSchema }),
]);

/**
 * Body of POST /api/channels before secrets are merged with the stored channel.
 * The config is checked against alertChannelSchema after the merge.
 */
export const alertChannelSaveSchema = z.object({
  type: alertChannelTypeSchema,
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()),
});

// ==========================================
// Pipeline Schemas
// ==========================================

export const pipelineIdSchema = z.number().int().positive();

export const projectIdSchema = z.number().int().positive();

export const pipelineActionSchema = z.object({
  action: z.enum(['retry', 'cancel']),
  pipelineId: pipelineIdSchema,
});

// ==========================================
// Pagination Schemas
// ==========================================

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// ==========================================
// Date Range Schemas
// ==========================================

export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// ==========================================
// Helper Functions
// ==========================================

/**
 * Validate data against schema
 * @param schema - Zod schema
 * @param data - Data to validate
 * @returns Validated data or throws error
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safe validate - returns result with success flag
 * @param schema - Zod schema
 * @param data - Data to validate
 * @returns Safe parse result
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
) {
  return schema.safeParse(data);
}

/**
 * Extract validation errors
 * @param error - Zod error
 * @returns Formatted error messages
 */
export function formatValidationError(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  error.issues.forEach((err) => {
    const path = err.path.join('.');
    errors[path] = err.message;
  });
  return errors;
}

// ==========================================
// Type Exports
// ==========================================

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type GitLabConfigInput = z.infer<typeof gitlabConfigSchema>;
export type UserGitLabConfigUpdateInput = z.infer<typeof userGitLabConfigUpdateSchema>;
export type AlertChannelInput = z.infer<typeof alertChannelSchema>;
export type AlertChannelType = z.infer<typeof alertChannelTypeSchema>;
export type PipelineActionInput = z.infer<typeof pipelineActionSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
