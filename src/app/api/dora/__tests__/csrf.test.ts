/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from 'next/server';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';
import { csrfRequest, REJECTED_MODES, TEST_SESSION_SECRET } from '@/lib/testing/csrf';
import { POST as POST_INCIDENT, PATCH as PATCH_INCIDENT } from '../incidents/route';
import { POST as POST_DEPLOYMENT } from '../deployments/route';

jest.mock('@/lib/db/scoped-prisma', () => ({
  getOrgPrisma: jest.fn(),
}));

const mockGetOrgPrisma = getOrgPrisma as jest.Mock;

type Handler = (request: NextRequest) => Promise<NextResponse>;

const cases: Array<[string, string, Handler]> = [
  ['POST', 'http://localhost/api/dora/incidents', POST_INCIDENT],
  ['PATCH', 'http://localhost/api/dora/incidents', PATCH_INCIDENT],
  ['POST', 'http://localhost/api/dora/deployments', POST_DEPLOYMENT],
];

describe('/api/dora CSRF enforcement', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Unauthenticated past the CSRF guard: a 401 proves the guard let the request through.
    mockGetOrgPrisma.mockResolvedValue({ db: {}, auth: null });
  });

  describe.each(cases)('%s %s', (method, url, handler) => {
    it.each(REJECTED_MODES)('rejects a %s CSRF token with 403', async (mode) => {
      const res = await handler(csrfRequest(url, method, mode, {}));

      expect(res.status).toBe(403);
      expect((await res.json()).code).toMatch(/^CSRF_TOKEN_/);
      expect(mockGetOrgPrisma).not.toHaveBeenCalled();
    });

    it('passes a valid CSRF token through to the handler', async () => {
      const res = await handler(csrfRequest(url, method, 'valid', {}));

      expect(res.status).toBe(401);
      expect(mockGetOrgPrisma).toHaveBeenCalled();
    });
  });
});
