/**
 * Sanitized Logger - Prevents sensitive data from being logged
 */

const SENSITIVE_KEYS = [
  'password',
  'token',
  'apiKey',
  'api_key',
  'secret',
  'authorization',
  'cookie',
  'session',
  'sessionId',
  'session_id',
  'csrf',
  'creditCard',
  'credit_card',
  'ssn',
  'privateKey',
  'private_key',
];

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  [key: string]: unknown;
}

/**
 * Check if key is sensitive
 */
function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) =>
    lowerKey.includes(sensitive.toLowerCase())
  );
}

/**
 * Reduce an Error to fields that are safe to log. Axios/fetch errors carry the
 * request config (headers such as PRIVATE-TOKEN) and sockets, so only a small
 * allow-list is kept.
 */
export function serializeError(error: Error): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  };
  const extra = error as Error & { code?: unknown; response?: { status?: unknown } };
  if (typeof extra.code === 'string' || typeof extra.code === 'number') {
    serialized.code = extra.code;
  }
  if (extra.response && typeof extra.response.status === 'number') {
    serialized.status = extra.response.status;
  }
  if (process.env.NODE_ENV !== 'production' && error.stack) {
    serialized.stack = error.stack;
  }
  return serialized;
}

/**
 * Sanitize object by masking sensitive fields
 */
function sanitizeObject(obj: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Error) {
    return serializeError(obj);
  }

  if (seen.has(obj)) {
    return '[Circular]';
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    const items = obj.map((item) => sanitizeObject(item, seen));
    seen.delete(obj);
    return items;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value, seen);
    } else {
      sanitized[key] = value;
    }
  }

  // Only ancestors count as cycles; shared siblings are still serialized.
  seen.delete(obj);
  return sanitized;
}

/**
 * Format log message with context
 */
function formatLogMessage(
  level: LogLevel,
  message: string,
  context?: LogContext
): string {
  const timestamp = new Date().toISOString();
  const sanitizedContext = context ? sanitizeObject(context) : {};

  const contextObj = typeof sanitizedContext === 'object' && sanitizedContext !== null && !Array.isArray(sanitizedContext)
    ? sanitizedContext
    : {};

  return JSON.stringify({
    timestamp,
    level: level.toUpperCase(),
    message,
    ...contextObj,
  });
}

/**
 * Logger class with sanitization
 */
class Logger {
  private prefix?: string;

  constructor(prefix?: string) {
    this.prefix = prefix;
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const fullMessage = this.prefix ? `[${this.prefix}] ${message}` : message;

    if (process.env.NODE_ENV === 'production') {
      // Structured logging for production
      const logMessage = formatLogMessage(level, fullMessage, context);
      console[level](logMessage);
    } else {
      // Human-readable for development
      const sanitizedContext = context ? sanitizeObject(context) : {};
      console[level](fullMessage, sanitizedContext);
    }
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'production') {
      this.log('debug', message, context);
    }
  }
}

/**
 * Create logger instance
 */
export function createLogger(prefix?: string): Logger {
  return new Logger(prefix);
}

/**
 * Default logger instance
 */
export const logger = createLogger();

/**
 * Request logger middleware helper
 */
export function logRequest(
  method: string,
  path: string,
  context?: LogContext
): void {
  logger.info(`${method} ${path}`, {
    method,
    path,
    ...context,
  });
}

/**
 * Error logger helper
 */
export function logError(
  error: Error | unknown,
  context?: LogContext
): void {
  if (error instanceof Error) {
    logger.error(error.message, {
      name: error.name,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      ...context,
    });
  } else {
    logger.error('Unknown error', {
      error: String(error),
      ...context,
    });
  }
}

/**
 * Security event logger
 */
export function logSecurityEvent(
  event: string,
  context?: LogContext
): void {
  logger.warn(`[SECURITY] ${event}`, context);
}
