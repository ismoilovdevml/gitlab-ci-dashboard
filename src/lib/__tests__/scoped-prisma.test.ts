/**
 * @jest-environment node
 */

type AllOperations = (params: {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}) => Promise<unknown>;

let capturedAllOperations: AllOperations | null = null;
const mockExtends = jest.fn((config: { query: { $allOperations: AllOperations } }) => {
  capturedAllOperations = config.query.$allOperations;
  return { extended: true };
});

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: { $extends: (config: never) => mockExtends(config) },
}));

jest.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { applyOrgScope, getScopedPrisma } from '@/lib/db/scoped-prisma';
import { OrgScopeViolationError } from '@/lib/org/scope';

const ORG = 'org-a';

beforeEach(() => {
  jest.clearAllMocks();
  capturedAllOperations = null;
});

describe('getScopedPrisma', () => {
  it('returns the base client when there is no organization', () => {
    const client = getScopedPrisma(null);
    expect(mockExtends).not.toHaveBeenCalled();
    expect(client).toHaveProperty('$extends');
  });

  it('scopes queries on org-scoped models and passes others through', async () => {
    getScopedPrisma(ORG);
    const query = jest.fn().mockResolvedValue('ok');

    await capturedAllOperations!({
      model: 'AlertChannel',
      operation: 'findMany',
      args: { where: { type: 'slack' } },
      query,
    });
    expect(query).toHaveBeenLastCalledWith({ where: { type: 'slack', organizationId: ORG } });

    await capturedAllOperations!({
      model: 'User',
      operation: 'findMany',
      args: { where: { organizationId: 'org-b' } },
      query,
    });
    expect(query).toHaveBeenLastCalledWith({ where: { organizationId: 'org-b' } });
  });

  it('throws before querying when caller input targets another organization', () => {
    getScopedPrisma(ORG);
    const query = jest.fn();
    expect(() =>
      capturedAllOperations!({
        model: 'Dashboard',
        operation: 'findFirst',
        args: { where: { organizationId: 'org-b' } },
        query,
      })
    ).toThrow(OrgScopeViolationError);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('applyOrgScope - reads and deletes', () => {
  const ops = [
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
  ];

  it.each(ops)('%s injects organizationId into where', (op) => {
    expect(applyOrgScope(ORG, op, { where: { id: '1' } }).where).toEqual({ id: '1', organizationId: ORG });
    expect(applyOrgScope(ORG, op, undefined).where).toEqual({ organizationId: ORG });
  });

  it.each(ops)('%s rejects a different top-level organizationId', (op) => {
    expect(() => applyOrgScope(ORG, op, { where: { organizationId: 'org-b' } })).toThrow(
      OrgScopeViolationError
    );
  });

  it('rejects widening filters on organizationId', () => {
    for (const filter of [{ in: [ORG, 'org-b'] }, { not: ORG }, { equals: 'org-b' }, null]) {
      expect(() => applyOrgScope(ORG, 'findMany', { where: { organizationId: filter } })).toThrow(
        OrgScopeViolationError
      );
    }
  });

  it('rejects a conflicting organizationId nested in OR/AND/NOT', () => {
    const wheres = [
      { OR: [{ id: '1' }, { organizationId: 'org-b' }] },
      { AND: [{ OR: [{ organizationId: 'org-b' }] }] },
      { NOT: { organizationId: 'org-b' } },
      { AND: { organizationId: { in: ['org-b'] } } },
    ];
    for (const where of wheres) {
      expect(() => applyOrgScope(ORG, 'findMany', { where })).toThrow(OrgScopeViolationError);
    }
  });

  it('keeps the scoped organizationId ANDed with caller OR branches', () => {
    const scoped = applyOrgScope(ORG, 'findMany', { where: { OR: [{ id: '1' }, { id: '2' }] } });
    expect(scoped.where).toEqual({ OR: [{ id: '1' }, { id: '2' }], organizationId: ORG });
  });

  it('accepts the scoped organizationId repeated by the caller', () => {
    expect(applyOrgScope(ORG, 'findMany', { where: { organizationId: ORG } }).where).toEqual({
      organizationId: ORG,
    });
  });

  it('preserves non-where args and does not mutate the input', () => {
    const input = { where: { id: '1' }, take: 5, orderBy: { createdAt: 'desc' } };
    const scoped = applyOrgScope(ORG, 'findMany', input);
    expect(scoped).toEqual({
      where: { id: '1', organizationId: ORG },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });
    expect(input.where).toEqual({ id: '1' });
  });
});

describe('applyOrgScope - creates', () => {
  it.each(['create', 'createMany', 'createManyAndReturn'])('%s injects organizationId into data', (op) => {
    expect(applyOrgScope(ORG, op, { data: { name: 'x' } }).data).toEqual({ name: 'x', organizationId: ORG });
  });

  it('injects organizationId into every createMany row', () => {
    expect(applyOrgScope(ORG, 'createMany', { data: [{ name: 'a' }, { name: 'b' }] }).data).toEqual([
      { name: 'a', organizationId: ORG },
      { name: 'b', organizationId: ORG },
    ]);
  });

  it('rejects a create for another organization', () => {
    expect(() => applyOrgScope(ORG, 'create', { data: { organizationId: 'org-b' } })).toThrow(
      OrgScopeViolationError
    );
    expect(() =>
      applyOrgScope(ORG, 'createMany', { data: [{ name: 'a' }, { name: 'b', organizationId: 'org-b' }] })
    ).toThrow(/data\[1\]\.organizationId/);
  });

  it('rejects a create through the organization relation', () => {
    expect(() =>
      applyOrgScope(ORG, 'create', { data: { organization: { connect: { id: 'org-b' } } } })
    ).toThrow(OrgScopeViolationError);
  });
});

describe('applyOrgScope - updates', () => {
  it.each(['update', 'updateMany', 'updateManyAndReturn'])('%s scopes where and leaves data alone', (op) => {
    const scoped = applyOrgScope(ORG, op, { where: { id: '1' }, data: { name: 'y' } });
    expect(scoped).toEqual({ where: { id: '1', organizationId: ORG }, data: { name: 'y' } });
  });

  it('scopes an updateMany with no where to the organization', () => {
    expect(applyOrgScope(ORG, 'updateMany', { data: {} }).where).toEqual({ organizationId: ORG });
  });

  it('rejects moving a record to another organization', () => {
    expect(() =>
      applyOrgScope(ORG, 'update', { where: { id: '1' }, data: { organizationId: 'org-b' } })
    ).toThrow(OrgScopeViolationError);
    expect(() =>
      applyOrgScope(ORG, 'updateMany', { data: { organization: { connect: { id: 'org-b' } } } })
    ).toThrow(OrgScopeViolationError);
  });

  it('rejects an update whose where targets another organization', () => {
    expect(() =>
      applyOrgScope(ORG, 'update', { where: { id: '1', organizationId: 'org-b' }, data: {} })
    ).toThrow(OrgScopeViolationError);
  });
});

describe('applyOrgScope - upsert', () => {
  it('scopes where and create', () => {
    const scoped = applyOrgScope(ORG, 'upsert', {
      where: { id: '1' },
      create: { name: 'x' },
      update: { name: 'y' },
    });
    expect(scoped).toEqual({
      where: { id: '1', organizationId: ORG },
      create: { name: 'x', organizationId: ORG },
      update: { name: 'y' },
    });
  });

  it('rejects another organization in the create branch', () => {
    expect(() =>
      applyOrgScope(ORG, 'upsert', { where: { id: '1' }, create: { organizationId: 'org-b' }, update: {} })
    ).toThrow(/create\.organizationId/);
  });

  it('rejects another organization in the update branch', () => {
    expect(() =>
      applyOrgScope(ORG, 'upsert', { where: { id: '1' }, create: {}, update: { organizationId: 'org-b' } })
    ).toThrow(/update\.organizationId/);
    expect(() =>
      applyOrgScope(ORG, 'upsert', {
        where: { id: '1' },
        create: {},
        update: { organization: { connect: { id: 'org-b' } } },
      })
    ).toThrow(/update\.organization must/);
  });

  it('rejects another organization in the where branch', () => {
    expect(() =>
      applyOrgScope(ORG, 'upsert', { where: { id: '1', organizationId: 'org-b' }, create: {}, update: {} })
    ).toThrow(OrgScopeViolationError);
  });
});

describe('applyOrgScope - unknown operations', () => {
  it('fails closed', () => {
    expect(() => applyOrgScope(ORG, 'somethingNew', {})).toThrow(OrgScopeViolationError);
  });
});
