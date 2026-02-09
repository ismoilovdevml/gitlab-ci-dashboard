import { verify, JwtPayload } from 'jsonwebtoken';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'crypto';
import { hostname as osHostname } from 'os';
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
 * Verify license key with optional online validation.
 * When online validation succeeds, its expiresAt/features/plan override the JWT values
 * because the web app's DB is the source of truth (subscription renewals extend expiry).
 */
export async function verifyLicense(licenseKey: string): Promise<LicenseStatus> {
  // Step 1: Offline verification (signature + exp with grace period)
  const offlineResult = verifyLicenseOffline(licenseKey);

  // If signature is completely invalid (not just expired), check if it's expiry-only
  if (!offlineResult.valid && !offlineResult.gracePeriod) {
    const publicKey = process.env.LICENSE_PUBLIC_KEY?.replace(/\\n/g, '\n');
    if (publicKey) {
      try {
        // Verify signature only, ignore expiry — online check will determine real expiry
        verify(licenseKey, publicKey, {
          algorithms: ['RS256'],
          issuer: 'gitlab-ci-dashboard',
          ignoreExpiration: true,
        });
        // Signature is valid but fully expired past grace — try online check below
      } catch {
        return offlineResult; // Signature itself is bad, reject
      }
    } else {
      return offlineResult;
    }
  }

  // Step 2: Online validation (if URL configured) — DB is source of truth
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

        // Online succeeded — use DB values as authoritative (renewal extends expiry)
        const dbExpiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
        const now = new Date();
        const daysRemaining = dbExpiresAt
          ? Math.ceil((dbExpiresAt.getTime() - now.getTime()) / 86400000)
          : offlineResult.daysRemaining;

        if (dbExpiresAt && dbExpiresAt < now) {
          return {
            ...FREE_LICENSE,
            valid: false,
            error: 'License expired. Please renew your subscription.',
          };
        }

        return {
          valid: true,
          tier: (data.plan || offlineResult.tier) as LicenseTier,
          maxProjects: data.maxProjects ?? offlineResult.maxProjects,
          maxUsers: data.maxUsers ?? offlineResult.maxUsers,
          features: data.features || offlineResult.features,
          expiresAt: data.expiresAt || offlineResult.expiresAt,
          daysRemaining,
        };
      }
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

// ── Instance Identification ──────────────────────────────────────────

const INSTANCE_ID_KEY = 'instance_id';
const DASHBOARD_VERSION = process.env.npm_package_version || '1.3.0';

/**
 * Get or create a persistent instance ID for this dashboard installation.
 * Stored in AppSetting so it survives restarts.
 */
async function getOrCreateInstanceId(): Promise<string> {
  try {
    const existing = await prisma.appSetting.findUnique({
      where: { key: INSTANCE_ID_KEY },
    });
    if (existing?.value) return existing.value;
  } catch {
    // DB might not be ready yet
  }

  const instanceId = `inst_${randomBytes(16).toString('hex')}`;
  try {
    await prisma.appSetting.upsert({
      where: { key: INSTANCE_ID_KEY },
      update: { value: instanceId },
      create: { key: INSTANCE_ID_KEY, value: instanceId },
    });
  } catch {
    // Race condition or DB issue — use generated ID anyway
  }
  return instanceId;
}

/**
 * Call the web app's activation endpoint to register this instance.
 * Non-blocking — logs errors but never throws.
 */
async function callActivationEndpoint(licenseKey: string): Promise<void> {
  const verificationUrl = process.env.LICENSE_VERIFICATION_URL;
  if (!verificationUrl) return;

  try {
    const instanceId = await getOrCreateInstanceId();
    const res = await fetch(`${verificationUrl}/api/license/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey,
        instanceId,
        instanceName: process.env.DASHBOARD_INSTANCE_NAME || osHostname(),
        hostname: osHostname(),
        dashboardVersion: DASHBOARD_VERSION,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      logger.info('License activation registered with cloud');
    } else {
      const text = await res.text().catch(() => 'no body');
      logger.warn('Activation endpoint returned error', { status: res.status, body: text });
    }
  } catch (error) {
    logger.warn('Failed to call activation endpoint', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
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

  // Register this instance with the web app (non-blocking)
  callActivationEndpoint(licenseKey).catch(() => {});
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
 * Cloud mode: derive license status from the authenticated user's org plan.
 * In cloud mode, the SaaS platform manages subscriptions — no local license key needed.
 */
async function getCloudLicenseStatus(): Promise<LicenseStatus> {
  try {
    const { getAuth } = await import('@/lib/auth/adapter');
    const auth = await getAuth();
    if (!auth?.organizationId) return FREE_LICENSE;

    const org = await prisma.organization.findUnique({
      where: { id: auth.organizationId },
      select: { plan: true },
    });

    const tier = (org?.plan || 'free') as LicenseTier;
    const tierConfig = TIER_FEATURES[tier];
    if (!tierConfig) return FREE_LICENSE;

    return {
      valid: true,
      tier,
      maxProjects: tierConfig.maxProjects,
      maxUsers: tierConfig.maxUsers,
      features: tierConfig.features,
      expiresAt: null,
      daysRemaining: -1, // cloud subscriptions don't have local expiry
    };
  } catch (error) {
    logger.error('Failed to get cloud license status', { error });
    return FREE_LICENSE;
  }
}

/**
 * Get current license status (cached)
 */
export async function getLicenseStatus(): Promise<LicenseStatus> {
  // Cloud mode: license is managed by the SaaS platform, not self-hosted keys
  if (process.env.AUTH_MODE === 'supabase') {
    return getCloudLicenseStatus();
  }

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

// ── Periodic Background Revalidation ─────────────────────────────────

const REVALIDATION_INTERVAL = 30 * 60 * 1000; // 30 minutes
let revalidationTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic background license revalidation.
 * Runs every 30 minutes to ensure license status stays in sync with the web app's DB.
 * Call once during app startup.
 */
export function startLicenseRevalidation(): void {
  if (revalidationTimer) return; // Already running

  revalidationTimer = setInterval(async () => {
    try {
      const licenseKey = await getLicenseKey();
      if (!licenseKey) return;

      const verificationUrl = process.env.LICENSE_VERIFICATION_URL;
      if (!verificationUrl) return;

      logger.info('Running periodic license revalidation');
      await invalidateLicenseCache(); // Force fresh check
      const status = await verifyLicense(licenseKey);

      // Update cache with fresh result
      await cacheHelpers.set(CACHE_KEY, status, CACHE_TTL).catch(() => {});

      if (!status.valid) {
        logger.warn('Periodic revalidation: license no longer valid', { error: status.error });
      }
    } catch (error) {
      logger.warn('Periodic revalidation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, REVALIDATION_INTERVAL);

  // Don't prevent Node.js process from exiting
  if (revalidationTimer.unref) {
    revalidationTimer.unref();
  }
}

/**
 * Stop periodic license revalidation.
 */
export function stopLicenseRevalidation(): void {
  if (revalidationTimer) {
    clearInterval(revalidationTimer);
    revalidationTimer = null;
  }
}
