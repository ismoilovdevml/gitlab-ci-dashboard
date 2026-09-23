/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { POST } from '../route';
import prisma from '@/lib/db/prisma';

jest.mock('@/lib/db/prisma', () => ({
  __esModule: true,
  default: {
    alertChannel: { findMany: jest.fn() },
    alertHistory: { create: jest.fn() },
    organization: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
  },
}));

const mockFindMany = prisma.alertChannel.findMany as jest.Mock;
const mockHistoryCreate = prisma.alertHistory.create as jest.Mock;

const BOT_TOKEN = '123456:bot-secret-token';
const WEBHOOK_SECRET = 'webhook-shared-secret';

function makeRequest(token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== undefined) headers['X-Gitlab-Token'] = token;
  return new NextRequest('http://localhost/api/webhook/gitlab', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      object_kind: 'pipeline',
      project: { id: 7, name: 'demo', web_url: 'https://gitlab.example.com/demo' },
      user: { name: 'Jane', username: 'jane', email: 'jane@example.com' },
      object_attributes: {
        id: 99,
        iid: 1,
        ref: 'main',
        tag: false,
        sha: 'abc',
        status: 'failed',
        created_at: '',
        finished_at: '',
        duration: 61,
        web_url: 'https://gitlab.example.com/demo/-/pipelines/99',
      },
    }),
  });
}

function allLogOutput(spies: jest.SpyInstance[]): string {
  return JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
}

describe('POST /api/webhook/gitlab logging', () => {
  let spies: jest.SpyInstance[];
  const originalSecret = process.env.GITLAB_WEBHOOK_SECRET;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(() => undefined)
    );
    process.env.GITLAB_WEBHOOK_SECRET = WEBHOOK_SECRET;
    mockHistoryCreate.mockResolvedValue({});
  });

  afterEach(() => {
    spies.forEach((spy) => spy.mockRestore());
    global.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.GITLAB_WEBHOOK_SECRET;
    else process.env.GITLAB_WEBHOOK_SECRET = originalSecret;
  });

  it('logs a security event without the supplied token when it is invalid', async () => {
    const res = await POST(makeRequest('wrong-token-value'));

    expect(res.status).toBe(401);
    const output = allLogOutput(spies);
    expect(output).toContain('[SECURITY]');
    expect(output).not.toContain('wrong-token-value');
    expect(output).not.toContain(WEBHOOK_SECRET);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('logs a security event when the token header is missing', async () => {
    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(allLogOutput(spies)).toContain('missing X-Gitlab-Token');
  });

  it('logs delivery failures without channel secrets or user data', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'c1', type: 'telegram', enabled: true, config: { botToken: BOT_TOKEN, chatId: '42' } },
    ]);
    global.fetch = jest.fn().mockRejectedValue(
      Object.assign(new Error('fetch failed'), {
        config: { url: `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage` },
      })
    ) as unknown as typeof fetch;

    const res = await POST(makeRequest(WEBHOOK_SECRET));

    expect(res.status).toBe(200);
    const output = allLogOutput(spies);
    expect(output).toContain('Failed to send alert');
    expect(output).toContain('fetch failed');
    expect(output).not.toContain(BOT_TOKEN);
    expect(output).not.toContain(WEBHOOK_SECRET);
    expect(output).not.toContain('jane@example.com');
    expect(output).toContain('telegram');
    expect(mockHistoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sent: false }) })
    );
  });

  it('does not use console.log for routine events', async () => {
    mockFindMany.mockResolvedValue([]);

    const res = await POST(makeRequest(WEBHOOK_SECRET));

    expect(res.status).toBe(200);
    expect(spies[0]).not.toHaveBeenCalled();
  });
});
