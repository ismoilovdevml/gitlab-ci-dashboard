import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import prisma from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

const ALGORITHM = 'aes-256-gcm';
const TOKEN_SALT = 'gitlab-ci-dashboard-token-v1';

let legacyKeyWarned = false;

function getTokenEncryptionKey(): Buffer | null {
  let secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret && process.env.LICENSE_ENCRYPTION_KEY) {
    // Older installs encrypted tokens with LICENSE_ENCRYPTION_KEY; keep reading them.
    secret = process.env.LICENSE_ENCRYPTION_KEY;
    if (!legacyKeyWarned) {
      legacyKeyWarned = true;
      logger.warn(
        'LICENSE_ENCRYPTION_KEY is deprecated for GitLab token encryption; set TOKEN_ENCRYPTION_KEY to the same value'
      );
    }
  }
  if (!secret) return null;
  return scryptSync(secret, TOKEN_SALT, 32);
}

export function encryptToken(plaintext: string): string {
  const key = getTokenEncryptionKey();
  if (!key) return plaintext;

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `tok:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptToken(stored: string): string {
  if (!stored.startsWith('tok:')) return stored;

  const key = getTokenEncryptionKey();
  if (!key) {
    throw new Error('TOKEN_ENCRYPTION_KEY required to decrypt stored GitLab token');
  }

  const parts = stored.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted token format');
  }

  const iv = Buffer.from(parts[1], 'hex');
  const authTag = Buffer.from(parts[2], 'hex');
  const ciphertext = parts[3];

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Store a GitLab token for an organization.
 * Encrypts the token at rest.
 */
export async function storeOrgGitLabToken(opts: {
  organizationId: string;
  url: string;
  token: string;
  configId?: string;
}) {
  const encryptedToken = encryptToken(opts.token);

  if (opts.configId) {
    return prisma.gitLabConfig.update({
      where: { id: opts.configId },
      data: {
        url: opts.url,
        token: encryptedToken,
      },
    });
  }

  return prisma.gitLabConfig.create({
    data: {
      organizationId: opts.organizationId,
      url: opts.url,
      token: encryptedToken,
    },
  });
}

/**
 * Get the GitLab token for an organization, decrypted.
 */
export async function getOrgGitLabToken(organizationId: string): Promise<{
  url: string;
  token: string;
  configId: string;
} | null> {
  const config = await prisma.gitLabConfig.findFirst({
    where: { organizationId },
  });

  if (!config || !config.token) return null;

  try {
    return {
      url: config.url,
      token: decryptToken(config.token),
      configId: config.id,
    };
  } catch (error) {
    logger.error('Failed to decrypt GitLab token', { organizationId, error });
    return null;
  }
}

/**
 * Get all GitLab connections for an organization.
 */
export async function getOrgGitLabConfigs(organizationId: string) {
  const configs = await prisma.gitLabConfig.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
  });

  return configs.map((c) => ({
    id: c.id,
    url: c.url,
    tokenConfigured: !!c.token,
    createdAt: c.createdAt,
  }));
}

/**
 * Delete a GitLab connection.
 */
export async function deleteOrgGitLabConfig(configId: string, organizationId: string) {
  return prisma.gitLabConfig.deleteMany({
    where: { id: configId, organizationId },
  });
}

/**
 * Test a GitLab connection by calling /api/v4/user.
 */
export async function testGitLabConnection(url: string, token: string): Promise<{
  success: boolean;
  username?: string;
  error?: string;
}> {
  try {
    const normalizedUrl = url.replace(/\/$/, '');
    const res = await fetch(`${normalizedUrl}/api/v4/user`, {
      headers: { 'PRIVATE-TOKEN': token },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, username: data.username };
    }

    if (res.status === 401) {
      return { success: false, error: 'Invalid token' };
    }

    return { success: false, error: `GitLab returned status ${res.status}` };
  } catch {
    return { success: false, error: 'Connection failed — check the URL' };
  }
}
