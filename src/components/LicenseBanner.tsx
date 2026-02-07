'use client';

import { useLicenseStatus } from '@/hooks/useLicenseStatus';
import { AlertTriangle, Shield, ExternalLink } from 'lucide-react';

export function LicenseBanner() {
  const { license, loading, isFreeTier, isExpiringSoon } = useLicenseStatus();

  if (loading) return null;

  // No license key or invalid = free tier info
  if (!license.valid && license.error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 flex items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>License error: {license.error}. Running in free tier mode.</span>
        <a
          href={process.env.NEXT_PUBLIC_LICENSE_URL || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 text-red-300 hover:text-red-200 shrink-0"
        >
          Get License <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  // Expiring soon warning
  if (isExpiringSoon) {
    return (
      <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 px-4 py-2 flex items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          Your {license.tier.toUpperCase()} license expires in {license.daysRemaining} days.
        </span>
        <a
          href={process.env.NEXT_PUBLIC_LICENSE_URL || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 text-yellow-300 hover:text-yellow-200 shrink-0"
        >
          Renew <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  // Free tier info (only show if no license key configured)
  if (isFreeTier && !process.env.NEXT_PUBLIC_HIDE_LICENSE_BANNER) {
    return (
      <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 px-4 py-2 flex items-center gap-2 text-sm">
        <Shield className="h-4 w-4 shrink-0" />
        <span>
          Free tier: {license.maxProjects} projects, {license.maxUsers} user.
          Upgrade for unlimited projects, alerts, DORA metrics, and more.
        </span>
        <a
          href={process.env.NEXT_PUBLIC_LICENSE_URL || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 text-blue-300 hover:text-blue-200 shrink-0"
        >
          Upgrade <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  return null;
}
