import prisma from './prisma';

/**
 * Models that support organization scoping.
 * When using getScopedPrisma(), queries to these models
 * will automatically filter by organizationId.
 */
const SCOPED_MODELS = [
  'AlertChannel',
  'AlertHistory',
  'GitLabConfig',
  'PipelineStatus',
  'Deployment',
  'Incident',
  'DoraMetric',
  'Dashboard',
  'TrendData',
] as const;

type ScopedModelName = (typeof SCOPED_MODELS)[number];

function isScopedModel(model: string): model is ScopedModelName {
  return SCOPED_MODELS.includes(model as ScopedModelName);
}

/**
 * Get a Prisma client with automatic org-scoping via middleware.
 *
 * Usage:
 *   const auth = await getAuth();
 *   const db = getScopedPrisma(auth.organizationId);
 *   const channels = await db.alertChannel.findMany(); // auto-filtered by orgId
 *
 * For self-hosted with no org, pass null to get unscoped access.
 */
export function getScopedPrisma(organizationId: string | null) {
  // If no org (self-hosted single-tenant), return regular prisma
  if (!organizationId) {
    return prisma;
  }

  // Return extended client with org-scoping middleware
  return prisma.$extends({
    query: {
      $allOperations({ model, operation, args, query }) {
        if (!model || !isScopedModel(model)) {
          return query(args);
        }

        // Auto-inject organizationId into where clauses
        if (['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy'].includes(operation)) {
          const where = (args as { where?: Record<string, unknown> }).where || {};
          (args as { where: Record<string, unknown> }).where = {
            ...where,
            organizationId,
          };
        }

        // Auto-inject organizationId into create data
        if (['create', 'createMany'].includes(operation)) {
          const data = (args as { data: Record<string, unknown> }).data;
          if (Array.isArray(data)) {
            (args as { data: Record<string, unknown>[] }).data = data.map((d) => ({
              ...d,
              organizationId,
            }));
          } else {
            (args as { data: Record<string, unknown> }).data = {
              ...data,
              organizationId,
            };
          }
        }

        // Auto-inject organizationId into update where clauses
        if (['update', 'updateMany', 'delete', 'deleteMany'].includes(operation)) {
          const where = (args as { where?: Record<string, unknown> }).where || {};
          (args as { where: Record<string, unknown> }).where = {
            ...where,
            organizationId,
          };
        }

        // Auto-inject organizationId into upsert
        if (operation === 'upsert') {
          const upsertArgs = args as {
            where: Record<string, unknown>;
            create: Record<string, unknown>;
          };
          upsertArgs.where = { ...upsertArgs.where, organizationId };
          upsertArgs.create = { ...upsertArgs.create, organizationId };
        }

        return query(args);
      },
    },
  }) as typeof prisma;
}

/**
 * Helper to get org-scoped Prisma from auth context.
 * Common pattern for API routes.
 */
export async function getOrgPrisma() {
  // Lazy import to avoid circular dependency
  const { getAuth } = await import('@/lib/auth/adapter');
  const auth = await getAuth();

  if (!auth) {
    return { db: null as never, auth: null };
  }

  return {
    db: getScopedPrisma(auth.organizationId),
    auth,
  };
}
