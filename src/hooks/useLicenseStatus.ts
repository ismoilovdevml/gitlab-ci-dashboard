'use client';

import { useState, useEffect, useCallback } from 'react';

export interface LicenseStatusData {
  valid: boolean;
  tier: 'free' | 'pro' | 'enterprise';
  maxProjects: number;
  maxUsers: number;
  features: string[];
  expiresAt: string | null;
  daysRemaining: number;
  error?: string;
}

const DEFAULT_STATUS: LicenseStatusData = {
  valid: true,
  tier: 'free',
  maxProjects: 3,
  maxUsers: 1,
  features: [],
  expiresAt: null,
  daysRemaining: -1,
};

export function useLicenseStatus() {
  const [license, setLicense] = useState<LicenseStatusData>(DEFAULT_STATUS);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/license');
      if (res.ok) {
        const json = await res.json();
        setLicense(json.data);
      }
    } catch {
      // Silently fall back to free tier
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    license,
    loading,
    refresh: fetchStatus,
    isFreeTier: license.tier === 'free',
    isPro: license.tier === 'pro' || license.tier === 'enterprise',
    isEnterprise: license.tier === 'enterprise',
    canAccessFeature: (feature: string) => license.features.includes(feature),
    isExpiringSoon: license.daysRemaining > 0 && license.daysRemaining <= 30,
  };
}
