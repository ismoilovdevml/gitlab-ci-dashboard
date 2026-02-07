import { verify, JwtPayload } from 'jsonwebtoken';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { cacheHelpers } from '@/lib/db/redis';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/db/prisma';

const logger = createLogger('License');
const auditLogger = createLogger('LicenseAudit');

type LicenseAuditEvent =
  | 'license.activated'
  | 'license.removed'
  | 'license.verification_failed'
  | 'license.expired'
  | 'license.grace_period_entered'
  | 'license.grace_period_ended'
  | 'license.clock_tamper_detected';

function auditLog(event: LicenseAuditEvent, details: Record<string, unknown> = {}) {
  auditLogger.info(`[AUDIT] ${event}`, { event, timestamp: new Date().toISOString(), ...details });
}

const CACHE_KEY = 'license:status';
const CACHE_TTL = 300; // 5 minutes

export type LicenseTier = 'free' | 'pro' | 'enterprise';

export interface LicenseStatus {
  valid: boolean;
  tier: LicenseTier;
  maxProjects: number;
  maxUsers: number;
  features: string[];
  expiresAt: string | null;
  daysRemaining: number;
  gracePeriod?: boolean; // true if in grace period (expired but still functional)
  error?: string;
}

const GRACE_PERIOD_DAYS = 14;

const FREE_LICENSE: LicenseStatus = {
  valid: true,
  tier: 'free',
  maxProjects: 3,
  maxUsers: 1,
  features: [],
  expiresAt: null,
  daysRemaining: -1,
};

interface LicensePayload extends JwtPayload {
  plan: LicenseTier;
  maxProjects: number;
  maxUsers: number;
  maxActivations: number;
  features: string[];
  customerEmail: string;
}

// ── Clock Tamper Detection ───────────────────────────────────────────

const CLOCK_KEY = 'license:last_check_time';
const MAX_CLOCK_DRIFT = 5 * 60 * 1000; // 5 minutes backward tolerance

async function detectClockTamper(): Promise<boolean> {
  try {
    const now = Date.now();
    const lastCheckStr = await cacheHelpers.get<string>(CLOCK_KEY);

    if (lastCheckStr) {
      const lastCheck = parseInt(lastCheckStr, 10);
      if (now < lastCheck - MAX_CLOCK_DRIFT) {
        logger.warn('Clock tamper detected: system clock jumped backward', {
          lastCheck: new Date(lastCheck).toISOString(),
          now: new Date(now).toISOString(),
          driftMs: lastCheck - now,
        });
        auditLog('license.clock_tamper_detected', {
          lastCheck: new Date(lastCheck).toISOString(),
          currentTime: new Date(now).toISOString(),
          driftMs: lastCheck - now,
        });
        return true;
      }
    }

    // Store current time (use long TTL so it persists across restarts)
    await cacheHelpers.set(CLOCK_KEY, String(now), 86400);
    return false;
  } catch {
    // If Redis is down, skip the check
    return false;
  }
}

/**
 * Verify license key offline using RSA public key
 */
export function verifyLicenseOffline(licenseKey: string): LicenseStatus {
  const publicKey = process.env.LICENSE_PUBLIC_KEY?.replace(/\\n/g, '\n');

  if (!publicKey) {
    logger.warn('LICENSE_PUBLIC_KEY not configured, running as free tier');
    return FREE_LICENSE;
  }

  try {
    // Allow grace period: set clockTolerance to cover grace period for JWT verification
    const gracePeriodSeconds = GRACE_PERIOD_DAYS * 86400;
    const decoded = verify(licenseKey, publicKey, {
      algorithms: ['RS256'],
      issuer: 'gitlab-ci-dashboard',
      clockTolerance: gracePeriodSeconds,
    }) as LicensePayload;

    const expiresAt = new Date(decoded.exp! * 1000);
    const now = new Date();
    const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000);

    // License is past its expiry date
    if (expiresAt < now) {
      const daysPastExpiry = Math.ceil((now.getTime() - expiresAt.getTime()) / 86400000);

      if (daysPastExpiry <= GRACE_PERIOD_DAYS) {
        // Within grace period - still functional but warn user
        logger.warn(`License in grace period: ${daysPastExpiry} of ${GRACE_PERIOD_DAYS} days used`);
        auditLog('license.grace_period_entered', {
          tier: decoded.plan,
          expiredAt: expiresAt.toISOString(),
          daysPastExpiry,
          graceDaysRemaining: GRACE_PERIOD_DAYS - daysPastExpiry,
        });
        return {
          valid: true,
          tier: decoded.plan,
          maxProjects: decoded.maxProjects,
          maxUsers: decoded.maxUsers,
          features: decoded.features,
          expiresAt: expiresAt.toISOString(),
          daysRemaining,
          gracePeriod: true,
          error: `License expired ${daysPastExpiry} day(s) ago. Grace period ends in ${GRACE_PERIOD_DAYS - daysPastExpiry} day(s).`,
        };
      }

      // Grace period exhausted
      auditLog('license.grace_period_ended', {
        tier: decoded.plan,
        expiredAt: expiresAt.toISOString(),
        daysPastExpiry,
      });
      return {
        ...FREE_LICENSE,
        valid: false,
        error: `License expired and ${GRACE_PERIOD_DAYS}-day grace period has ended. Please renew.`,
      };
    }

    return {
      valid: true,
      tier: decoded.plan,
      maxProjects: decoded.maxProjects,
      maxUsers: decoded.maxUsers,
      features: decoded.features,
      expiresAt: expiresAt.toISOString(),
      daysRemaining,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('License verification failed', { error: errorMsg });
    auditLog('license.verification_failed', { error: errorMsg });
    return {
      ...FREE_LICENSE,
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid license',
    };
  }
}

/**
 * Verify license key with optional online validation
 */
export async function verifyLicense(licenseKey: string): Promise<LicenseStatus> {
  // Step 1: Offline verification (always)
  const offlineResult = verifyLicenseOffline(licenseKey);
  if (!offlineResult.valid) {
    return offlineResult;
  }

  // Step 2: Online validation (optional, if URL configured)
  const verificationUrl = process.env.LICENSE_VERIFICATION_URL;
  if (verificationUrl) {
    try {
      const res = await fetch(`${verificationUrl}/api/license/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey }),
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = await res.json();
        if (!data.valid) {
          return {
            ...FREE_LICENSE,
            valid: false,
            error: data.error || 'License revoked or invalid',
          };
        }
      }
      // If online check fails (network error), fall through to offline result
    } catch {
      logger.warn('Online license validation failed, using offline result');
    }
  }

  return offlineResult;
}

// ── License Key Encryption (AES-256-GCM) ────────────────────────────

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_SALT = 'gitlab-ci-dashboard-license-v1';

function getEncryptionKey(): Buffer | null {
  const secret = process.env.LICENSE_ENCRYPTION_KEY;
  if (!secret) return null;
  return scryptSync(secret, ENCRYPTION_SALT, 32);
}

function encryptLicenseKey(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) return plaintext; // No encryption key configured = store plaintext

  const iv = randomBytes(12);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  // Format: enc:<iv>:<authTag>:<ciphertext>
  return `enc:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decryptLicenseKey(stored: string): string {
  // Not encrypted (legacy or no encryption key was set when saved)
  if (!stored.startsWith('enc:')) return stored;

  const key = getEncryptionKey();
  if (!key) {
    throw new Error('LICENSE_ENCRYPTION_KEY required to decrypt stored license key');
  }

  const parts = stored.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted license key format');
  }

  const iv = Buffer.from(parts[1], 'hex');
  const authTag = Buffer.from(parts[2], 'hex');
  const ciphertext = parts[3];

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Get license key from database (AppSetting table) or env var
 */
async function getLicenseKey(): Promise<string | null> {
  // 1. Try database first
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: 'license_key' },
    });
    if (setting?.value) {
      return decryptLicenseKey(setting.value);
    }
  } catch (error) {
    logger.warn('Failed to read license key from database, falling back to env', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // 2. Fall back to environment variable
  return process.env.LICENSE_KEY || null;
}

/**
 * Save license key to database
 */
export async function saveLicenseKey(licenseKey: string): Promise<void> {
  const encrypted = encryptLicenseKey(licenseKey);
  await prisma.appSetting.upsert({
    where: { key: 'license_key' },
    update: { value: encrypted },
    create: { key: 'license_key', value: encrypted },
  });
  await invalidateLicenseCache();
  auditLog('license.activated', { encrypted: !!getEncryptionKey() });
}

/**
 * Remove license key from database
 */
export async function removeLicenseKey(): Promise<void> {
  try {
    await prisma.appSetting.delete({
      where: { key: 'license_key' },
    });
  } catch {
    // Key might not exist, that's fine
  }
  await invalidateLicenseCache();
  auditLog('license.removed');
}

/**
 * Get current license status (cached)
 */
export async function getLicenseStatus(): Promise<LicenseStatus> {
  try {
    // Check cache first
    const cached = await cacheHelpers.get<LicenseStatus>(CACHE_KEY);
    if (cached) {
      return cached;
    }
  } catch {
    // Redis might not be available, continue without cache
  }

  // Clock tamper detection
  const tampered = await detectClockTamper();
  if (tampered) {
    return {
      ...FREE_LICENSE,
      valid: false,
      error: 'System clock anomaly detected. Please verify system time.',
    };
  }

  const licenseKey = await getLicenseKey();

  // No license key = free tier
  if (!licenseKey) {
    return FREE_LICENSE;
  }

  // Verify license
  const status = await verifyLicense(licenseKey);

  try {
    // Cache the result
    await cacheHelpers.set(CACHE_KEY, status, CACHE_TTL);
  } catch {
    // Ignore cache errors
  }

  return status;
}

/**
 * Check if a specific feature is available in the current license
 */
export async function isFeatureAvailable(feature: string): Promise<boolean> {
  const status = await getLicenseStatus();
  return status.valid && status.features.includes(feature);
}

/**
 * Feature-to-plan mapping for error messages
 */
const FEATURE_PLAN_MAP: Record<string, string> = {
  runner_monitoring: 'Pro',
  dora_metrics: 'Pro',
  pipeline_analytics: 'Pro',
  custom_dashboard: 'Pro',
  alerts: 'Pro',
  job_logs: 'Pro',
  container_registry: 'Enterprise',
  sso: 'Enterprise',
  audit_logs: 'Enterprise',
};

/**
 * Server-side feature gate check. Returns error info if feature is not available, null if OK.
 * Use in API routes to enforce license requirements server-side.
 */
export async function requireFeature(feature: string): Promise<{ error: string; requiredPlan: string } | null> {
  const available = await isFeatureAvailable(feature);
  if (available) return null;

  const requiredPlan = FEATURE_PLAN_MAP[feature] || 'Pro';
  return {
    error: `This feature requires a ${requiredPlan} or higher license`,
    requiredPlan,
  };
}

/**
 * Check if the current user count is within license limits
 */
export async function checkUserLimit(currentUserCount: number): Promise<boolean> {
  const status = await getLicenseStatus();
  if (!status.valid) return currentUserCount <= FREE_LICENSE.maxUsers;
  if (status.maxUsers === -1) return true; // unlimited
  return currentUserCount <= status.maxUsers;
}

/**
 * Check if the current project count is within license limits
 */
export async function checkProjectLimit(currentProjectCount: number): Promise<boolean> {
  const status = await getLicenseStatus();
  if (!status.valid) return currentProjectCount <= FREE_LICENSE.maxProjects;
  if (status.maxProjects === -1) return true; // unlimited
  return currentProjectCount <= status.maxProjects;
}

/**
 * Invalidate cached license (call after license key changes)
 */
export async function invalidateLicenseCache(): Promise<void> {
  try {
    await cacheHelpers.invalidate(CACHE_KEY);
  } catch {
    // Ignore cache errors
  }
}

/**
 * Feature list by tier for UI display
 */
export const TIER_FEATURES: Record<LicenseTier, {
  name: string;
  maxProjects: number;
  maxUsers: number;
  features: string[];
}> = {
  free: {
    name: 'Free',
    maxProjects: 3,
    maxUsers: 1,
    features: ['basic_monitoring', 'pipeline_status'],
  },
  pro: {
    name: 'Pro',
    maxProjects: -1,
    maxUsers: 5,
    features: [
      'basic_monitoring', 'pipeline_status', 'all_monitoring',
      'alerts', 'dora_metrics', 'custom_dashboard', 'job_logs',
      'pipeline_analytics', 'runner_monitoring',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    maxProjects: -1,
    maxUsers: -1,
    features: [
      'basic_monitoring', 'pipeline_status', 'all_monitoring',
      'alerts', 'dora_metrics', 'custom_dashboard', 'job_logs',
      'pipeline_analytics', 'runner_monitoring', 'container_registry',
      'sso', 'audit_logs', 'priority_support', 'self_hosted',
    ],
  },
};
