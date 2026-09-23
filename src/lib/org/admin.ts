import { checkOrgAccess } from '@/lib/org/scope';

/**
 * Whether the caller administers their organization: an owner or admin
 * member, or the install admin when they belong to no organization.
 */
export async function isOrgAdmin(auth: {
  user: { id: string; role?: string | null };
  organizationId?: string | null;
}): Promise<boolean> {
  return auth.organizationId
    ? checkOrgAccess(auth.user.id, auth.organizationId, ['owner', 'admin'])
    : auth.user.role === 'admin';
}
