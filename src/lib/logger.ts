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
 * Sanitize object by masking sensitive fields
 */
function sanitizeObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

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
