/**
 * @jest-environment node
 */
import { getOrgPrisma } from '@/lib/db/scoped-prisma';
import { rateLimit } from '@/lib/rate-limit';
import { csrfRequest, REJECTED_MODES, TEST_SESSION_SECRET } from '@/lib/testing/csrf';
import { startMockWebhookServer, type MockWebhookServer } from '@/lib/notifications/testing/mock-webhook-server';
import { POST } from '../route';

jest.mock('@/lib/db/scoped-prisma', () => ({
  getOrgPrisma: jest.fn(),
}));

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(),
}));

const mockGetOrgPrisma = getOrgPrisma as jest.Mock;
const mockRateLimit = rateLimit as jest.Mock;
const mockFindFirst = jest.fn();

const ENDPOINT = 'http://localhost/api/channels/test';
const BOT_TOKEN = '987654:telegram-bot-secret';

function signedIn(organizationId: string | null = 'org-a') {
  mockGetOrgPrisma.mockResolvedValue({
    db: { alertChannel: { findFirst: mockFindFirst } },
    auth: { user: { id: 'user-1' }, organizationId },
  });
}

function post(body: unknown) {
  return POST(csrfRequest(ENDPOINT, 'POST', 'valid', body));
}

describe('POST /api/channels/test', () => {
  let server: MockWebhookServer;
  let logSpies: jest.SpyInstance[];

  beforeAll(() => {
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    server = await startMockWebhookServer();
    signedIn();
    mockRateLimit.mockResolvedValue({ success: true, remaining: 4, reset: 0 });
    logSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(() => undefined)
    );
  });

  afterEach(async () => {
    logSpies.forEach((spy) => spy.mockRestore());
    await server.close();
  });

  it.each(REJECTED_MODES)('rejects a %s CSRF token before touching the database', async (mode) => {
    const res = await POST(csrfRequest(ENDPOINT, 'POST', mode, { type: 'slack' }));

    expect(res.status).toBe(403);
    expect(mockGetOrgPrisma).not.toHaveBeenCalled();
    expect(server.requests).toHaveLength(0);
  });

  it('requires a session', async () => {
    mockGetOrgPrisma.mockResolvedValue({ db: {}, auth: null });

    const res = await post({ type: 'slack' });

    expect(res.status).toBe(401);
  });

  it.each([{ type: 'email' }, { type: 'webhook' }, { type: 'nope' }, {}, null])(
    'rejects %p as a channel to test',
    async (body) => {
      const res = await post(body);

      expect(res.status).toBe(400);
      expect(mockFindFirst).not.toHaveBeenCalled();
    }
  );

  it('sends the test from the server using the saved, org-scoped config', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'c1',
      type: 'slack',
      enabled: false,
      config: { webhookUrl: server.url('/services/T/B/X'), channel: '#ops' },
    });

    // A config in the request body is ignored; only the saved channel is used.
    const res = await post({ type: 'slack', config: { webhookUrl: 'https://attacker.example/hook' } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mockGetOrgPrisma).toHaveBeenCalled();
    expect(mockFindFirst).toHaveBeenCalledWith({ where: { type: 'slack' } });
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].path).toBe('/services/T/B/X');
    expect(server.requests[0].body).toMatchObject({
      text: '✅ Test notification',
      blocks: [expect.anything(), { elements: [{ url: 'http://localhost' }] }],
    });
  });

  it('asks to save first when the channel does not exist', async () => {
    mockFindFirst.mockResolvedValue(null);

    const res = await post({ type: 'discord' });

    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/save/i);
  });

  it('explains an incomplete saved config', async () => {
    mockFindFirst.mockResolvedValue({ id: 'c1', type: 'discord', config: { webhookUrl: '' } });

    const res = await post({ type: 'discord' });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Webhook URL is not set');
    expect(server.requests).toHaveLength(0);
  });

  it('returns 502 with the upstream status when delivery fails', async () => {
    server.respondWith(500);
    mockFindFirst.mockResolvedValue({ id: 'c1', type: 'discord', config: { webhookUrl: server.url() } });

    const res = await post({ type: 'discord' });

    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('Could not deliver the test message to discord: Discord webhook failed (HTTP 500)');
  });

  it('never returns or logs the Telegram bot token', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('fetch failed')) as unknown as typeof fetch;
    mockFindFirst.mockResolvedValue({ id: 'c1', type: 'telegram', config: { botToken: BOT_TOKEN, chatId: '42' } });

    let res: Response;
    try {
      res = await post({ type: 'telegram' });
    } finally {
      global.fetch = originalFetch;
    }

    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain(BOT_TOKEN);
    expect(JSON.stringify(logSpies.flatMap((spy) => spy.mock.calls))).not.toContain(BOT_TOKEN);
  });

  it('rate limits test messages per user', async () => {
    mockRateLimit.mockResolvedValue({ success: false, remaining: 0, reset: 0 });

    const res = await post({ type: 'slack' });

    expect(res.status).toBe(429);
    expect(mockRateLimit).toHaveBeenCalledWith('channel-test:user-1', { limit: 5, window: 60 });
    expect(mockFindFirst).not.toHaveBeenCalled();
  });
});
