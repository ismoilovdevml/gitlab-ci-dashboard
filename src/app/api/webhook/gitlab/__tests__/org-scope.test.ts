/**
 * @jest-environment node
 */
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import prisma from '@/lib/db/prisma';
import { POST } from '../route';

type Channel = {
  id: string;
  organizationId: string | null;
  type: string;
  enabled: boolean;
  config: Record<string, string>;
};

type ChannelWhere = { enabled?: boolean; OR?: Array<{ organizationId: string | null }> };

// In-memory stand-in that applies the route's where clause, so a query that
// forgets the org filter returns other orgs' channels and fails the test.
const mockDb = {
  orgs: [] as Array<{ id: string }>,
  channels: [] as Channel[],
};

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    alertChannel: {
      findMany: jest.fn(async ({ where }: { where: ChannelWhere }) =>
        mockDb.channels.filter(
          (c) =>
            (where.enabled === undefined || c.enabled === where.enabled) &&
            (!where.OR || where.OR.some((o) => o.organizationId === c.organizationId))
        )
      ),
    },
    alertHistory: { create: jest.fn().mockResolvedValue({}) },
    organization: {
      findMany: jest.fn(async ({ take }: { take?: number }) => mockDb.orgs.slice(0, take)),
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          mockDb.orgs.find((o) => o.id === where.id) ?? null
      ),
    },
  },
}));

const historyCreate = prisma.alertHistory.create as jest.Mock;

const GLOBAL_SECRET = 'global-webhook-secret';
const ORG_A = 'orgaaaaaaaaaaaaaaaaaaaaaa';
const ORG_B = 'orgbbbbbbbbbbbbbbbbbbbbbb';

function orgSecret(orgId: string, secret = GLOBAL_SECRET): string {
  return createHmac('sha256', secret).update(`gitlab-webhook-org:${orgId}`).digest('hex');
}

function slack(id: string, organizationId: string | null, enabled = true): Channel {
  return {
    id,
    organizationId,
    type: 'slack',
    enabled,
    config: { webhookUrl: `https://hooks.slack.test/${id}` },
  };
}

function webhook(opts: { org?: string; token?: string } = {}) {
  const url = new URL('http://localhost/api/webhook/gitlab');
  if (opts.org !== undefined) url.searchParams.set('org', opts.org);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token !== undefined) headers['X-Gitlab-Token'] = opts.token;
  return new NextRequest(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      object_kind: 'pipeline',
      project: { id: 1, name: 'api', web_url: 'https://gitlab.example.com/api' },
      user: { name: 'Jane', username: 'jane' },
      object_attributes: {
        id: 5,
        iid: 1,
        ref: 'main',
        tag: false,
        sha: 'abc',
        status: 'failed',
        created_at: '',
        finished_at: '',
        duration: 10,
        web_url: 'https://gitlab.example.com/api/-/pipelines/5',
      },
    }),
  });
}

function notifiedUrls(fetchMock: jest.Mock): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0])).sort();
}

function historyOrgIds(): Array<string | null> {
  return historyCreate.mock.calls.map((call) => call[0].data.organizationId);
}

describe('POST /api/webhook/gitlab organization scoping', () => {
  const originalSecret = process.env.GITLAB_WEBHOOK_SECRET;
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let consoleSpies: jest.SpyInstance[];

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(() => undefined)
    );
    process.env.GITLAB_WEBHOOK_SECRET = GLOBAL_SECRET;
    fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    mockDb.orgs = [];
    mockDb.channels = [];
  });

  afterEach(() => {
    consoleSpies.forEach((spy) => spy.mockRestore());
    global.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.GITLAB_WEBHOOK_SECRET;
    else process.env.GITLAB_WEBHOOK_SECRET = originalSecret;
  });

  describe('per-organization URL', () => {
    beforeEach(() => {
      mockDb.orgs = [{ id: ORG_A }, { id: ORG_B }];
      mockDb.channels = [
        slack('a1', ORG_A),
        slack('a-off', ORG_A, false),
        slack('b1', ORG_B),
        slack('none', null),
      ];
    });

    it("notifies only that org's enabled channels and tags history with the org", async () => {
      const res = await POST(webhook({ org: ORG_A, token: orgSecret(ORG_A) }));

      expect(res.status).toBe(200);
      expect(notifiedUrls(fetchMock)).toEqual(['https://hooks.slack.test/a1']);
      expect(historyOrgIds()).toEqual([ORG_A]);
    });

    it("rejects org A's secret on org B's URL and notifies nobody", async () => {
      const res = await POST(webhook({ org: ORG_B, token: orgSecret(ORG_A) }));

      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(historyCreate).not.toHaveBeenCalled();
      expect(prisma.alertChannel.findMany).not.toHaveBeenCalled();
    });

    it('rejects the global secret on a per-org URL', async () => {
      const res = await POST(webhook({ org: ORG_B, token: GLOBAL_SECRET }));

      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a missing token', async () => {
      const res = await POST(webhook({ org: ORG_A }));

      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns 404 for a valid secret of an organization that does not exist', async () => {
      const ghost = 'orgdeleted0000000000000000';
      const res = await POST(webhook({ org: ghost, token: orgSecret(ghost) }));

      expect(res.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns 503 when GITLAB_WEBHOOK_SECRET is not configured', async () => {
      delete process.env.GITLAB_WEBHOOK_SECRET;
      const res = await POST(webhook({ org: ORG_A, token: orgSecret(ORG_A) }));

      expect(res.status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a malformed org parameter', async () => {
      const res = await POST(webhook({ org: "a' OR 1=1", token: GLOBAL_SECRET }));

      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not log the received or expected secret', async () => {
      await POST(webhook({ org: ORG_B, token: orgSecret(ORG_A) }));

      const output = JSON.stringify(consoleSpies.flatMap((spy) => spy.mock.calls));
      expect(output).toContain('[SECURITY]');
      expect(output).not.toContain(orgSecret(ORG_A));
      expect(output).not.toContain(orgSecret(ORG_B));
      expect(output).not.toContain(GLOBAL_SECRET);
    });
  });

  describe('legacy URL without org', () => {
    it('single-tenant with no organization: notifies unowned channels, history org is null', async () => {
      mockDb.channels = [slack('none', null), slack('none-off', null, false)];

      const res = await POST(webhook({ token: GLOBAL_SECRET }));

      expect(res.status).toBe(200);
      expect(notifiedUrls(fetchMock)).toEqual(['https://hooks.slack.test/none']);
      expect(historyOrgIds()).toEqual([null]);
    });

    it('single organization: notifies that org and unowned channels with matching history orgs', async () => {
      mockDb.orgs = [{ id: ORG_A }];
      mockDb.channels = [slack('a1', ORG_A), slack('none', null)];

      const res = await POST(webhook({ token: GLOBAL_SECRET }));

      expect(res.status).toBe(200);
      expect(notifiedUrls(fetchMock)).toEqual([
        'https://hooks.slack.test/a1',
        'https://hooks.slack.test/none',
      ]);
      expect(historyOrgIds().sort()).toEqual([ORG_A, null].sort());
    });

    it('multiple organizations: notifies no organization-owned channel', async () => {
      mockDb.orgs = [{ id: ORG_A }, { id: ORG_B }];
      mockDb.channels = [slack('a1', ORG_A), slack('b1', ORG_B), slack('none', null)];

      const res = await POST(webhook({ token: GLOBAL_SECRET }));

      expect(res.status).toBe(200);
      expect(notifiedUrls(fetchMock)).toEqual(['https://hooks.slack.test/none']);
      expect(historyOrgIds()).toEqual([null]);
    });

    it('rejects a per-org secret on the legacy URL', async () => {
      mockDb.orgs = [{ id: ORG_A }];
      mockDb.channels = [slack('a1', ORG_A)];

      const res = await POST(webhook({ token: orgSecret(ORG_A) }));

      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('still accepts requests when no secret is configured (unchanged behaviour)', async () => {
      delete process.env.GITLAB_WEBHOOK_SECRET;
      mockDb.orgs = [{ id: ORG_A }];
      mockDb.channels = [slack('a1', ORG_A)];

      const res = await POST(webhook());

      expect(res.status).toBe(200);
      expect(notifiedUrls(fetchMock)).toEqual(['https://hooks.slack.test/a1']);
      expect(historyOrgIds()).toEqual([ORG_A]);
    });
  });
});
