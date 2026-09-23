/**
 * @jest-environment node
 */
import { canManageAlertChannels } from '../access';
import { checkOrgAccess } from '@/lib/org/scope';
import type { AuthContext } from '@/lib/auth/types';

jest.mock('@/lib/org/scope', () => ({ checkOrgAccess: jest.fn() }));

const mockCheckOrgAccess = checkOrgAccess as jest.Mock;

function auth(organizationId: string | null, role = 'user'): AuthContext {
  return { user: { id: 'u1', role } as AuthContext['user'], organizationId };
}

describe('canManageAlertChannels', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires the owner or admin role in the caller organization', async () => {
    mockCheckOrgAccess.mockResolvedValue(true);
    await expect(canManageAlertChannels(auth('org-1', 'viewer'))).resolves.toBe(true);
    expect(mockCheckOrgAccess).toHaveBeenCalledWith('u1', 'org-1', ['owner', 'admin']);

    mockCheckOrgAccess.mockResolvedValue(false);
    await expect(canManageAlertChannels(auth('org-1', 'admin'))).resolves.toBe(false);
  });

  it('falls back to the install admin role without an organization', async () => {
    await expect(canManageAlertChannels(auth(null, 'admin'))).resolves.toBe(true);
    await expect(canManageAlertChannels(auth(null, 'user'))).resolves.toBe(false);
    expect(mockCheckOrgAccess).not.toHaveBeenCalled();
  });
});
