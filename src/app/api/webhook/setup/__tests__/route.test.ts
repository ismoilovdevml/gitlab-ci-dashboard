/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET } from '../route';
import { POST as RECEIVE_WEBHOOK } from '../../gitlab/route';
import { getAuth } from '@/lib/auth/adapter';
import { deriveOrgWebhookSecret } from '@/lib/gitlab/webhook-secret';

const ORG_A = 'orgaaaaaaaaaaaaaaaaaaaaaa';
const ORG_B = 'orgbbbbbbbbbbbbbbbbbbbbbb';
const GLOBAL_SECRET = 'global-webhook-secret';

const mockMembers: Array<{ organizationId: string; userId: string; role: string }> = [];

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    organizationMember: {
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: { organizationId_userId: { organizationId: string; userId: string } };
        }) =>
          mockMembers.find(
            (m) =>
              m.organizationId === where.organizationId_userId.organizationId &&
              m.userId === where.organizationId_userId.userId
          ) ?? null
      ),
    },
    organization: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        [ORG_A, ORG_B].includes(where.id) ? { id: where.id } : null
      ),
      findMany: jest.fn(async () => []),
    },
    alertChannel: { findMany: jest.fn(async () => []) },
    alertHistory: { create: jest.fn() },
  },
}));

jest.mock('@/lib/auth/adapter', () => ({
  getAuth: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }),
  logSecurityEvent: jest.fn(),
}));

const mockGetAuth = getAuth as jest.Mock;

function authAs(opts: { id?: string; role?: string; organizationId: string | null }) {
  const id = opts.id ?? 'user-1';
  mockGetAuth.mockResolvedValue({
    user: { id, role: opts.role ?? 'user', organizationId: opts.organizationId },
    organizationId: opts.organizationId,
  });
}

function setupRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://internal:3000/api/webhook/setup', { headers });
}

describe('GET /api/webhook/setup', () => {
  const originalSecret = process.env.GITLAB_WEBHOOK_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMembers.length = 0;
    process.env.GITLAB_WEBHOOK_SECRET = GLOBAL_SECRET;
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.GITLAB_WEBHOOK_SECRET;
    else process.env.GITLAB_WEBHOOK_SECRET = originalSecret;
  });

  it('returns 401 without a session', async () => {
    mockGetAuth.mockResolvedValue(null);

    const res = await GET(setupRequest());

    expect(res.status).toBe(401);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it.each(['member', 'viewer'])('returns 403 to an org %s', async (role) => {
    mockMembers.push({ organizationId: ORG_A, userId: 'user-1', role });
    authAs({ organizationId: ORG_A });

    const res = await GET(setupRequest());

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.secret).toBeUndefined();
  });

  it('returns 403 to an install admin who is only a member of the organization', async () => {
    mockMembers.push({ organizationId: ORG_A, userId: 'user-1', role: 'member' });
    authAs({ organizationId: ORG_A, role: 'admin' });

    const res = await GET(setupRequest());

    expect(res.status).toBe(403);
  });

  it('returns 403 to a user with no organization who is not an install admin', async () => {
    authAs({ organizationId: null, role: 'user' });

    const res = await GET(setupRequest());

    expect(res.status).toBe(403);
    expect((await res.json()).secret).toBeUndefined();
  });

  it('returns 503 with a clear message when GITLAB_WEBHOOK_SECRET is unset', async () => {
    delete process.env.GITLAB_WEBHOOK_SECRET;
    mockMembers.push({ organizationId: ORG_A, userId: 'user-1', role: 'admin' });
    authAs({ organizationId: ORG_A });

    const res = await GET(setupRequest());

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/GITLAB_WEBHOOK_SECRET/);
    expect(body.secret).toBeUndefined();
  });

  it.each(['owner', 'admin'])('returns the org URL and derived secret to an org %s', async (role) => {
    mockMembers.push({ organizationId: ORG_A, userId: 'user-1', role });
    authAs({ organizationId: ORG_A });

    const res = await GET(setupRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body).toEqual({
      url: `http://internal:3000/api/webhook/gitlab?org=${ORG_A}`,
      secret: deriveOrgWebhookSecret(GLOBAL_SECRET, ORG_A),
      scope: 'organization',
      organizationId: ORG_A,
    });
    expect(body.secret).not.toBe(GLOBAL_SECRET);
  });

  it('builds the URL from X-Forwarded-Proto and X-Forwarded-Host', async () => {
    mockMembers.push({ organizationId: ORG_A, userId: 'user-1', role: 'admin' });
    authAs({ organizationId: ORG_A });

    const res = await GET(
      setupRequest({
        'x-forwarded-proto': 'https, http',
        'x-forwarded-host': 'ci.example.com, internal',
      })
    );

    const body = await res.json();
    expect(body.url).toBe(`https://ci.example.com/api/webhook/gitlab?org=${ORG_A}`);
  });

  it('ignores a malformed forwarded host', async () => {
    mockMembers.push({ organizationId: ORG_A, userId: 'user-1', role: 'admin' });
    authAs({ organizationId: ORG_A });

    const res = await GET(setupRequest({ 'x-forwarded-host': 'evil.com/path?x=' }));

    const body = await res.json();
    expect(body.url).toBe(`http://internal:3000/api/webhook/gitlab?org=${ORG_A}`);
  });

  it('returns the global URL and secret to an install admin without an organization', async () => {
    authAs({ organizationId: null, role: 'admin' });

    const res = await GET(setupRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('http://internal:3000/api/webhook/gitlab');
    expect(body.secret).toBe(GLOBAL_SECRET);
    expect(body.scope).toBe('global');
    expect(body.note).toMatch(/not a member of any organization/);
  });

  describe('secret is accepted by POST /api/webhook/gitlab', () => {
    async function deliver(url: string, token: string) {
      return RECEIVE_WEBHOOK(
        new NextRequest(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Gitlab-Token': token },
          body: JSON.stringify({ object_kind: 'pipeline' }),
        })
      );
    }

    it('accepts the returned org URL + secret and rejects it for another org', async () => {
      mockMembers.push({ organizationId: ORG_A, userId: 'user-1', role: 'owner' });
      authAs({ organizationId: ORG_A });
      const { url, secret } = await (await GET(setupRequest())).json();

      expect((await deliver(url, secret)).status).toBe(200);

      const otherOrg = new URL(url);
      otherOrg.searchParams.set('org', ORG_B);
      expect((await deliver(otherOrg.toString(), secret)).status).toBe(401);
    });

    it('accepts the returned global URL + secret', async () => {
      authAs({ organizationId: null, role: 'admin' });
      const { url, secret } = await (await GET(setupRequest())).json();

      expect((await deliver(url, secret)).status).toBe(200);
    });
  });
});
