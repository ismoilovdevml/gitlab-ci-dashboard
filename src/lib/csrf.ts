import { randomBytes, createHmac } from 'crypto';

const CSRF_SECRET = process.env.SESSION_SECRET || 'default-csrf-secret-change-me';
const TOKEN_LENGTH = 32;

/**
 * Generate CSRF token
 * @param sessionId - User session ID
 * @returns CSRF token
 */
export function generateCSRFToken(sessionId?: string): string {
  const randomToken = randomBytes(TOKEN_LENGTH).toString('hex');
  const timestamp = Date.now().toString();
  const data = `${randomToken}:${timestamp}:${sessionId || 'anonymous'}`;

  const hmac = createHmac('sha256', CSRF_SECRET);
  hmac.update(data);
  const signature = hmac.digest('hex');

  return Buffer.from(`${data}:${signature}`).toString('base64');
}

/**
 * Validate CSRF token
 * @param token - CSRF token to validate
 * @param sessionId - User session ID
 * @param maxAge - Maximum age in milliseconds (default: 1 hour)
 * @returns true if valid, false otherwise
 */
export function validateCSRFToken(
  token: string,
  sessionId?: string,
  maxAge: number = 60 * 60 * 1000 // 1 hour
): boolean {
  try {
    // Decode base64 token
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');

    if (parts.length !== 4) {
      return false;
    }

    const [randomToken, timestamp, tokenSessionId, receivedSignature] = parts;

    // Check timestamp (prevent replay attacks)
    const tokenAge = Date.now() - parseInt(timestamp, 10);
    if (tokenAge > maxAge || tokenAge < 0) {
      return false;
    }

    // Check session ID if provided
    if (sessionId && tokenSessionId !== sessionId && tokenSessionId !== 'anonymous') {
      return false;
    }

    // Verify signature
    const data = `${randomToken}:${timestamp}:${tokenSessionId}`;
    const hmac = createHmac('sha256', CSRF_SECRET);
    hmac.update(data);
    const expectedSignature = hmac.digest('hex');

    return expectedSignature === receivedSignature;
  } catch (error) {
    console.error('CSRF token validation error:', error);
    return false;
  }
}

/**
 * Extract session ID from CSRF token (for debugging)
 */
export function extractSessionFromToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    return parts.length >= 3 ? parts[2] : null;
  } catch {
    return null;
  }
}
