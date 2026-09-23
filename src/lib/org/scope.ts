import prisma from '@/lib/db/prisma';
import { createLogger } from '@/lib/logger';

const logger = createLogger('OrgScope');

/**
 * Models that are scoped to an organization.
 * All queries to these models should include organizationId filter.
 */
export const ORG_SCOPED_MODELS = [
  'alertChannel',
  'alertHistory',
  'gitLabConfig',
  'pipelineStatus',
  'deployment',
  'incident',
  'doraMetric',
  'dashboard',
  'trendData',
] as const;

export type OrgScopedModel = (typeof ORG_SCOPED_MODELS)[number];

/**
 * Create an org-scoped query helper.
 * Automatically injects organizationId into where clauses and create data.
 *
 * Usage:
 *   const scoped = orgScope(orgId);
 *   const channels = await prisma.alertChannel.findMany(scoped.where());
 *   await prisma.alertChannel.create({ data: scoped.data({ type: 'slack', ... }) });
 */
export function orgScope(organizationId: string) {
  return {
    /** Add organizationId to a where clause */
    where(extra: Record<string, unknown> = {}) {
      return { where: { organizationId, ...extra } };
    },

    /** Add organizationId to create/update data */
    data<T extends Record<string, unknown>>(extra: T): T & { organizationId: string } {
      return { organizationId, ...extra };
    },

    /** Filter for findMany with additional options */
    findMany(args: Record<string, unknown> = {}) {
      const { where = {}, ...rest } = args;
      return {
        where: { organizationId, ...(where as Record<string, unknown>) },
        ...rest,
      };
    },

    /** The org ID */
    id: organizationId,
  };
}

/**
 * Get the default organization for a user (first org they belong to).
 * In self-hosted mode, there's typically one org.
 */
export async function getDefaultOrg(userId: string) {
  const membership = await prisma.organizationMember.findFirst({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: 'asc' },
  });

  return membership?.organization ?? null;
}

/**
 * Get all organizations a user belongs to.
 */
export async function getUserOrgs(userId: string) {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: 'asc' },
  });

  return memberships.map((m) => ({
    ...m.organization,
    role: m.role,
  }));
}

/**
 * Create a new organization and add the creator as owner.
 */
export async function createOrganization(params: {
  name: string;
  slug: string;
  ownerId: string;
}) {
  const org = await prisma.organization.create({
    data: {
      name: params.name,
      slug: params.slug,
      ownerId: params.ownerId,
      members: {
        create: {
          userId: params.ownerId,
          role: 'owner',
        },
      },
    },
    include: {
      members: true,
    },
  });

  logger.info('Organization created', { orgId: org.id, slug: org.slug, ownerId: params.ownerId });
  return org;
}

/**
 * Check if a user has access to an organization with the required role.
 */
export async function checkOrgAccess(
  userId: string,
  organizationId: string,
  requiredRoles?: string[]
): Promise<boolean> {
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId, userId },
    },
  });

  if (!membership) return false;
  if (!requiredRoles || requiredRoles.length === 0) return true;
  return requiredRoles.includes(membership.role);
}

/**
 * Generate a URL-safe slug from organization name.
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 48);
}
