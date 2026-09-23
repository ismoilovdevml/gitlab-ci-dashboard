/**
 * @jest-environment node
 */
import { GET, POST, DELETE } from '../route';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';
import { cacheHelpers } from '@/lib/db/redis';
import { checkOrgAccess } from '@/lib/org/scope';
import { csrfRequest, TEST_SESSION_SECRET } from '@/lib/testing/csrf';

jest.mock('@/lib/db/scoped-prisma', () => ({
  getOrgPrisma: jest.fn(),
}));

jest.mock('@/lib/db/redis', () => ({
  cacheHelpers: {
    getOrSet: jest.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidate: jest.fn(),
  },
}));

jest.mock('@/lib/org/scope', () => ({
  checkOrgAccess: jest.fn(),
}));

const mockGetOrgPrisma = getOrgPrisma as jest.Mock;
const mockGetOrSet = cacheHelpers.getOrSet as jest.Mock;
const mockInvalidate = cacheHelpers.invalidate as jest.Mock;
const mockCheckOrgAccess = checkOrgAccess as jest.Mock;

const BOT_TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';
const SLACK_URL = 'https://hooks.slack.com/services/T000/B000/SLACKSECRETVALUE1234';
const DISCORD_URL = 'https://discord.com/api/webhooks/1/DISCORDSECRETVALUE9876';
const WEBHOOK_URL = 'https://ops.example.com/hooks/GENERICSECRET5555';
const SMTP_PASSWORD = 'smtp-password-value';
const SMTP_USER = 'smtp-user-value';
const SECRETS = [BOT_TOKEN, SLACK_URL, DISCORD_URL, WEBHOOK_URL, SMTP_PASSWORD, SMTP_USER, 'SLACKSECRETVALUE'];

type Row = {
  id: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
  updatedAt: Date;
};

// Stand-in for the org-scoped client: one org's channels.
let rows: Row[];
const db = {
  alertChannel: {
    findMany: jest.fn(async () => rows),
    findFirst: jest.fn(async ({ where }: { where: { type: string } }) => rows.find((r) => r.type === where.type) ?? null),
    create: jest.fn(async ({ data }: { data: Omit<Row, 'id' | 'updatedAt'> }) => {
      const row = { id: `c${rows.length + 1}`, updatedAt: new Date(), ...data };
      rows.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = rows.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      rows = rows.filter((r) => r.id !== where.id);
    }),
  },
};

function signIn(opts: { organizationId?: string | null; role?: string; orgAdmin?: boolean } = {}) {
  const organizationId = opts.organizationId === undefined ? 'org-1' : opts.organizationId;
  mockGetOrgPrisma.mockResolvedValue({
    db,
    auth: { user: { id: 'u1', role: opts.role ?? 'user' }, organizationId },
  });
  mockCheckOrgAccess.mockResolvedValue(opts.orgAdmin ?? true);
}

function post(body: unknown) {
  return POST(csrfRequest('http://localhost/api/channels', 'POST', 'valid', body));
}

function del(type: string) {
  return DELETE(csrfRequest(`http://localhost/api/channels?type=${type}`, 'DELETE', 'valid'));
}

function storedRow(type: string, config: Record<string, unknown>, enabled = true): Row {
  return { id: `id-${type}`, type, enabled, config, updatedAt: new Date('2026-01-01T00:00:00Z') };
}

describe('/api/channels', () => {
  let consoleSpies: jest.SpyInstance[];

  beforeAll(() => {
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(() => undefined)
    );
    rows = [
      storedRow('telegram', { botToken: BOT_TOKEN, chatId: '-100123' }),
      storedRow('slack', { webhookUrl: SLACK_URL, channel: '#ci' }),
      storedRow('discord', { webhookUrl: DISCORD_URL }),
      storedRow('webhook', { url: WEBHOOK_URL, headers: { Authorization: 'Bearer HEADERSECRET' } }, false),
      storedRow(
        'email',
        {
          smtpHost: 'smtp.example.com',
          smtpPort: 587,
          username: SMTP_USER,
          password: SMTP_PASSWORD,
          from: 'ci@example.com',
          to: 'team@example.com',
        },
        false
      ),
    ];
    signIn();
  });

  afterEach(() => {
    consoleSpies.forEach((spy) => spy.mockRestore());
  });

  describe('GET', () => {
    it.each([
      ['an organization admin', { orgAdmin: true }, true],
      ['an organization member', { orgAdmin: false }, false],
    ])('never returns channel secrets to %s', async (_, opts, canManage) => {
      signIn(opts);

      const res = await GET();

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      const text = await res.text();
      for (const secret of [...SECRETS, 'HEADERSECRET']) {
        expect(text).not.toContain(secret);
      }
      const body = JSON.parse(text);
      expect(body.canManage).toBe(canManage);
      const byType = Object.fromEntries(body.channels.map((c: Row) => [c.type, c]));
      expect(byType.telegram.config).toEqual({ botToken: '***Dsaw', chatId: '-100123' });
      expect(byType.slack.config).toEqual({ webhookUrl: '***1234', channel: '#ci' });
      expect(byType.email.config).toEqual({
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        username: '***',
        password: '***',
        from: 'ci@example.com',
        to: 'team@example.com',
      });
      expect(byType.webhook.config).toEqual({ url: '***5555' });
    });

    it('caches only the masked channels, keyed by organization', async () => {
      signIn({ organizationId: 'org-a' });
      await GET();
      signIn({ organizationId: 'org-b' });
      await GET();

      const [keyA] = mockGetOrSet.mock.calls[0];
      const [keyB] = mockGetOrSet.mock.calls[1];
      expect(keyA).toContain('org-a');
      expect(keyB).toContain('org-b');
      const cached = await mockGetOrSet.mock.results[0].value;
      expect(JSON.stringify(cached)).not.toContain(BOT_TOKEN);
    });

    it('lets the install admin manage channels when they have no organization', async () => {
      signIn({ organizationId: null, role: 'admin' });
      expect((await (await GET()).json()).canManage).toBe(true);
      expect(mockCheckOrgAccess).not.toHaveBeenCalled();

      signIn({ organizationId: null, role: 'user' });
      expect((await (await GET()).json()).canManage).toBe(false);
    });

    it('checks the owner/admin roles of the caller organization', async () => {
      await GET();
      expect(mockCheckOrgAccess).toHaveBeenCalledWith('u1', 'org-1', ['owner', 'admin']);
    });

    it('returns 401 when unauthenticated', async () => {
      mockGetOrgPrisma.mockResolvedValue({ db: {}, auth: null });

      expect((await GET()).status).toBe(401);
    });
  });

  describe('POST', () => {
    it('keeps the stored secret when the masked value is sent back', async () => {
      const list = await (await GET()).json();
      const telegram = list.channels.find((c: Row) => c.type === 'telegram');

      const res = await post({ type: 'telegram', enabled: false, config: telegram.config });

      expect(res.status).toBe(200);
      expect(rows.find((r) => r.type === 'telegram')).toMatchObject({
        enabled: false,
        config: { botToken: BOT_TOKEN, chatId: '-100123' },
      });
      const text = await res.text();
      expect(text).not.toContain(BOT_TOKEN);
      expect(JSON.parse(text).config).toEqual({ botToken: '***Dsaw', chatId: '-100123' });
      expect(mockInvalidate).toHaveBeenCalledWith(expect.stringContaining('org-1'));
    });

    it('keeps the stored secret when it is left blank', async () => {
      const res = await post({ type: 'slack', enabled: true, config: { webhookUrl: '', channel: '#alerts' } });

      expect(res.status).toBe(200);
      expect(rows.find((r) => r.type === 'slack')!.config).toEqual({ webhookUrl: SLACK_URL, channel: '#alerts' });
      expect(await res.text()).not.toContain(SLACK_URL);
    });

    it('keeps SMTP credentials on a masked round trip and never returns them', async () => {
      const list = await (await GET()).json();
      const email = list.channels.find((c: Row) => c.type === 'email');

      const res = await post({ type: 'email', enabled: true, config: email.config });

      expect(res.status).toBe(200);
      expect(rows.find((r) => r.type === 'email')!.config).toMatchObject({
        username: SMTP_USER,
        password: SMTP_PASSWORD,
      });
      const text = await res.text();
      expect(text).not.toContain(SMTP_PASSWORD);
      expect(text).not.toContain(SMTP_USER);
    });

    it('creates a channel with a normalised URL', async () => {
      rows = [];

      const res = await post({
        type: 'slack',
        enabled: true,
        config: { webhookUrl: 'https://HOOKS.example.com/services/abc', channel: '#ci', enabled: true },
      });

      expect(res.status).toBe(200);
      expect(rows).toEqual([
        expect.objectContaining({
          type: 'slack',
          enabled: true,
          config: { webhookUrl: 'https://hooks.example.com/services/abc', channel: '#ci' },
        }),
      ]);
    });

    it.each([
      ['a non-http scheme', 'file:///etc/passwd', /http or https/],
      ['embedded credentials', 'https://user:pw@hooks.example.com/x', /credentials/],
      ['garbage', 'not a url', /valid URL/],
    ])('rejects a webhook URL with %s', async (_, webhookUrl, message) => {
      const res = await post({ type: 'discord', enabled: true, config: { webhookUrl } });

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(message);
      expect(db.alertChannel.update).not.toHaveBeenCalled();
      expect(db.alertChannel.create).not.toHaveBeenCalled();
    });

    it('rejects a bad Telegram chat id', async () => {
      const res = await post({ type: 'telegram', enabled: true, config: { botToken: BOT_TOKEN, chatId: 'not-a-chat' } });

      expect(res.status).toBe(400);
    });

    it('requires a new secret to change where a stored one is sent', async () => {
      const res = await post({
        type: 'email',
        enabled: true,
        config: { smtpHost: 'smtp.attacker.example', smtpPort: 587, from: 'ci@example.com', to: 'team@example.com' },
      });

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/again to change the SMTP host/);
      expect(rows.find((r) => r.type === 'email')!.config.smtpHost).toBe('smtp.example.com');
    });

    it.each([
      ['a missing type', { config: {} }],
      ['an unknown type', { type: 'sms', config: {} }],
      ['a missing config', { type: 'slack' }],
      ['a non-object body', 'x'],
    ])('rejects %s with 400', async (_, body) => {
      expect((await post(body)).status).toBe(400);
    });

    it('returns 403 to an organization member and changes nothing', async () => {
      signIn({ orgAdmin: false });

      const res = await post({ type: 'slack', enabled: true, config: { webhookUrl: 'https://evil.example/x' } });

      expect(res.status).toBe(403);
      expect(db.alertChannel.update).not.toHaveBeenCalled();
      expect(db.alertChannel.create).not.toHaveBeenCalled();
      expect(rows.find((r) => r.type === 'slack')!.config.webhookUrl).toBe(SLACK_URL);
    });

    it('returns 403 to a non-admin user without an organization', async () => {
      signIn({ organizationId: null, role: 'user' });

      expect((await post({ type: 'slack', enabled: true, config: { webhookUrl: SLACK_URL } })).status).toBe(403);
    });

    it('returns 401 when unauthenticated', async () => {
      mockGetOrgPrisma.mockResolvedValue({ db: {}, auth: null });

      expect((await post({ type: 'slack', config: {} })).status).toBe(401);
    });
  });

  describe('DELETE', () => {
    it('deletes the channel for an admin', async () => {
      const res = await del('slack');

      expect(res.status).toBe(200);
      expect(rows.map((r) => r.type)).not.toContain('slack');
      expect(mockInvalidate).toHaveBeenCalled();
    });

    it('returns 403 to an organization member', async () => {
      signIn({ orgAdmin: false });

      const res = await del('slack');

      expect(res.status).toBe(403);
      expect(db.alertChannel.delete).not.toHaveBeenCalled();
    });

    it('rejects an unknown type', async () => {
      expect((await del('sms')).status).toBe(400);
      expect(db.alertChannel.delete).not.toHaveBeenCalled();
    });
  });
});
