import { verify, JwtPayload } from 'jsonwebtoken';
import { cacheHelpers } from '@/lib/db/redis';
import { createLogger } from '@/lib/logger';
import prisma from '@/lib/db/prisma';

const logger = createLogger('License');

const CACHE_KEY = 'license:status';
const CACHE_TTL = 3600; // 1 hour

export type LicenseTier = 'free' | 'pro' | 'enterprise';

export interface LicenseStatus {
  valid: boolean;
  tier: LicenseTier;
  maxProjects: number;
  maxUsers: number;
  features: string[];
  expiresAt: string | null;
  daysRemaining: number;
  error?: string;
}

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
    const decoded = verify(licenseKey, publicKey, {
      algorithms: ['RS256'],
      issuer: 'gitlab-ci-dashboard',
      clockTolerance: 30,
    }) as LicensePayload;

    const expiresAt = new Date(decoded.exp! * 1000);
    const now = new Date();

    if (expiresAt < now) {
      return {
        ...FREE_LICENSE,
        valid: false,
        error: 'License expired',
      };
    }

    const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000);

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
    logger.error('License verification failed', {
      error: error instanceof Error ? error.message : String(error),
    });
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
      return setting.value;
    }
  } catch {
    logger.warn('Failed to read license key from database, falling back to env');
  }

  // 2. Fall back to environment variable
  return process.env.LICENSE_KEY || null;
}

/**
 * Save license key to database
 */
export async function saveLicenseKey(licenseKey: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: 'license_key' },
    update: { value: licenseKey },
    create: { key: 'license_key', value: licenseKey },
  });
  await invalidateLicenseCache();
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
