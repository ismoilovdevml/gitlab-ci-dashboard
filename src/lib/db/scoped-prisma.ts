import prisma from './prisma';
import { assertDataInScope, assertWhereInScope, OrgScopeViolationError } from '@/lib/org/scope';

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
        return query(applyOrgScope(organizationId, operation, args));
      },
    },
  }) as typeof prisma;
}

const WHERE_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'delete',
  'deleteMany',
]);
const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn']);
const UPDATE_OPERATIONS = new Set(['update', 'updateMany', 'updateManyAndReturn']);

type ScopedArgs = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
};

function scopeWhere(organizationId: string, where: Record<string, unknown> | undefined) {
  assertWhereInScope(organizationId, where);
  // organizationId is set last and is ANDed with every other condition (including any
  // OR/NOT branches), so caller filters can only narrow the result set, never widen it.
  return { ...(where ?? {}), organizationId };
}

function scopeCreateData(organizationId: string, data: Record<string, unknown>) {
  return { ...data, organizationId };
}

/**
 * Rewrite Prisma operation args so they can only read or write rows of `organizationId`.
 * Caller input naming another organization throws OrgScopeViolationError. Unknown
 * operations are rejected so a new Prisma operation cannot bypass scoping unnoticed.
 */
export function applyOrgScope(organizationId: string, operation: string, rawArgs: unknown): ScopedArgs {
  const args = { ...((rawArgs ?? {}) as ScopedArgs) };

  if (WHERE_OPERATIONS.has(operation)) {
    args.where = scopeWhere(organizationId, args.where);
    return args;
  }

  if (CREATE_OPERATIONS.has(operation)) {
    assertDataInScope(organizationId, args.data);
    args.data = Array.isArray(args.data)
      ? args.data.map((d) => scopeCreateData(organizationId, d))
      : scopeCreateData(organizationId, args.data ?? {});
    return args;
  }

  if (UPDATE_OPERATIONS.has(operation)) {
    assertDataInScope(organizationId, args.data);
    args.where = scopeWhere(organizationId, args.where);
    return args;
  }

  if (operation === 'upsert') {
    assertDataInScope(organizationId, args.create, 'create');
    assertDataInScope(organizationId, args.update, 'update');
    args.where = scopeWhere(organizationId, args.where);
    args.create = scopeCreateData(organizationId, args.create ?? {});
    return args;
  }

  throw new OrgScopeViolationError(`Operation "${operation}" is not supported on org-scoped models`);
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
