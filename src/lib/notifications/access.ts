import { isOrgAdmin } from '@/lib/org/admin';
import type { AuthContext } from '@/lib/auth/types';

/**
 * Whether the caller may create, change or delete alert channels.
 * Same rule as GET /api/webhook/setup.
 */
export async function canManageAlertChannels(auth: AuthContext): Promise<boolean> {
  return isOrgAdmin(auth);
}
