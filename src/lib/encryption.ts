import crypto from 'crypto';

/**
 * Encryption utility for sensitive data (GitLab tokens, API keys, etc)
 * Uses AES-256-GCM for encryption
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // For GCM mode
const KEY_LENGTH = 32; // 256 bits

// Get encryption key from environment variable
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    // In production, this should throw an error
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'ENCRYPTION_KEY environment variable is not set. ' +
        'Generate one with: openssl rand -hex 32'
      );
    }

    // Development fallback (NOT FOR PRODUCTION!)
    console.warn('⚠️  Using default encryption key - NOT SECURE FOR PRODUCTION!');
    return crypto.scryptSync('dev-fallback-key-not-secure', 'salt', KEY_LENGTH);
  }

  // Convert hex string to Buffer
  if (key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate with: openssl rand -hex 32');
  }

  return Buffer.from(key, 'hex');
}

/**
 * Encrypt sensitive text
 * @param text - Plain text to encrypt
 * @returns Encrypted string in format: iv:tag:encrypted
 */
export function encrypt(text: string): string {
  if (!text) return '';

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    // Format: iv:tag:encrypted
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt encrypted text
 * @param encryptedText - Encrypted string in format: iv:tag:encrypted
 * @returns Decrypted plain text
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';

  try {
    const parts = encryptedText.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivHex, tagHex, encrypted] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data - data may be corrupted or encryption key changed');
  }
}

/**
 * Generate a new encryption key (for setup/migration)
 * @returns 32-byte hex string
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Verify if text is encrypted
 * @param text - Text to check
 * @returns true if text appears to be encrypted
 */
export function isEncrypted(text: string): boolean {
  if (!text) return false;

  // Check format: iv:tag:encrypted (hex strings separated by colons)
  const parts = text.split(':');
  if (parts.length !== 3) return false;

  // Check if all parts are valid hex
  const hexRegex = /^[0-9a-f]+$/i;
  return parts.every(part => hexRegex.test(part));
}
