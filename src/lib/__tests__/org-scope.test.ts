/**
 * @jest-environment node
 */

const mockOrgCreate = jest.fn();
const mockMemberFindFirst = jest.fn();
const mockMemberFindMany = jest.fn();
const mockMemberFindUnique = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    organization: { create: (...args: unknown[]) => mockOrgCreate(...args) },
    organizationMember: {
      findFirst: (...args: unknown[]) => mockMemberFindFirst(...args),
      findMany: (...args: unknown[]) => mockMemberFindMany(...args),
      findUnique: (...args: unknown[]) => mockMemberFindUnique(...args),
    },
  },
}));

jest.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import {
  checkOrgAccess,
  createOrganization,
  generateSlug,
  getDefaultOrg,
  getUserOrgs,
  orgScope,
} from '@/lib/org/scope';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createOrganization', () => {
  it('creates the org with the creator as owner and no plan field', async () => {
    mockOrgCreate.mockResolvedValue({ id: 'o1', slug: 'acme', members: [] });

    const org = await createOrganization({ name: 'Acme', slug: 'acme', ownerId: 'u1' });

    expect(org.id).toBe('o1');
    const args = mockOrgCreate.mock.calls[0][0];
    expect(args.data).toEqual({
      name: 'Acme',
      slug: 'acme',
      ownerId: 'u1',
      members: { create: { userId: 'u1', role: 'owner' } },
    });
    expect(args.data).not.toHaveProperty('plan');
    expect(args.include).toEqual({ members: true });
  });
});

describe('orgScope', () => {
  it('injects organizationId into where, data and findMany args', () => {
    const scoped = orgScope('o1');
    expect(scoped.id).toBe('o1');
    expect(scoped.where({ type: 'slack' })).toEqual({ where: { organizationId: 'o1', type: 'slack' } });
    expect(scoped.data({ name: 'x' })).toEqual({ organizationId: 'o1', name: 'x' });
    expect(scoped.findMany({ where: { a: 1 }, take: 5 })).toEqual({
      where: { organizationId: 'o1', a: 1 },
      take: 5,
    });
  });
});

describe('membership lookups', () => {
  it('getDefaultOrg returns the first membership org or null', async () => {
    mockMemberFindFirst.mockResolvedValueOnce({ organization: { id: 'o1' } });
    await expect(getDefaultOrg('u1')).resolves.toEqual({ id: 'o1' });

    mockMemberFindFirst.mockResolvedValueOnce(null);
    await expect(getDefaultOrg('u1')).resolves.toBeNull();
  });

  it('getUserOrgs merges the member role into each org', async () => {
    mockMemberFindMany.mockResolvedValue([
      { role: 'owner', organization: { id: 'o1', name: 'A' } },
      { role: 'viewer', organization: { id: 'o2', name: 'B' } },
    ]);
    await expect(getUserOrgs('u1')).resolves.toEqual([
      { id: 'o1', name: 'A', role: 'owner' },
      { id: 'o2', name: 'B', role: 'viewer' },
    ]);
  });

  it('checkOrgAccess enforces membership and required roles', async () => {
    mockMemberFindUnique.mockResolvedValueOnce(null);
    await expect(checkOrgAccess('u1', 'o1')).resolves.toBe(false);

    mockMemberFindUnique.mockResolvedValueOnce({ role: 'member' });
    await expect(checkOrgAccess('u1', 'o1')).resolves.toBe(true);

    mockMemberFindUnique.mockResolvedValueOnce({ role: 'member' });
    await expect(checkOrgAccess('u1', 'o1', ['owner', 'admin'])).resolves.toBe(false);

    mockMemberFindUnique.mockResolvedValueOnce({ role: 'admin' });
    await expect(checkOrgAccess('u1', 'o1', ['owner', 'admin'])).resolves.toBe(true);
  });
});

describe('generateSlug', () => {
  it('builds a URL-safe slug capped at 48 chars', () => {
    expect(generateSlug('  My Team!! ')).toBe('my-team');
    expect(generateSlug('a'.repeat(60))).toHaveLength(48);
  });
});
