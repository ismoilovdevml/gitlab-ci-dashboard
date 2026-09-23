import { checkOrgAccess } from '@/lib/org/scope';
import type { AuthContext } from '@/lib/auth/types';

const ORG_ADMIN_ROLES = ['owner', 'admin'];

/**
 * Whether the caller may create, change or delete alert channels: an owner or
 * admin of their organization, or the install admin when they have none.
 * Same rule as GET /api/webhook/setup.
 */
export async function canManageAlertChannels(auth: AuthContext): Promise<boolean> {
  return auth.organizationId
    ? checkOrgAccess(auth.user.id, auth.organizationId, ORG_ADMIN_ROLES)
    : auth.user.role === 'admin';
}
