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

// ==========================================
// Alert Channel Schemas
// ==========================================

export const telegramConfigSchema = z.object({
  botToken: z.string().min(10),
  chatId: z.string().min(1),
});

export const slackConfigSchema = z.object({
  webhookUrl: z.string().url(),
  channel: z.string().optional(),
});

export const discordConfigSchema = z.object({
  webhookUrl: z.string().url(),
});

export const emailConfigSchema = z.object({
  smtpHost: z.string(),
  smtpPort: z.number().min(1).max(65535),
  smtpUser: z.string(),
  smtpPassword: z.string(),
  from: z.string().email(),
  to: z.array(z.string().email()),
});

export const webhookConfigSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT']).default('POST'),
  headers: z.record(z.string(), z.string()).optional(),
});

export const alertChannelSchema = z.object({
  type: z.enum(['telegram', 'slack', 'discord', 'email', 'webhook']),
  enabled: z.boolean().default(false),
  config: z.union([
    telegramConfigSchema,
    slackConfigSchema,
    discordConfigSchema,
    emailConfigSchema,
    webhookConfigSchema,
  ]),
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
export type AlertChannelInput = z.infer<typeof alertChannelSchema>;
export type PipelineActionInput = z.infer<typeof pipelineActionSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
