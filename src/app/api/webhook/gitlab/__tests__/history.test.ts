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

const WEBHOOK_SECRET = 'webhook-shared-secret';

function pipelineEvent() {
  return new NextRequest('http://localhost/api/webhook/gitlab', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gitlab-Token': WEBHOOK_SECRET },
    body: JSON.stringify({
      object_kind: 'pipeline',
      project: { id: 7, name: 'demo', web_url: 'https://gitlab.example.com/demo' },
      user: { name: 'Jane', username: 'jane' },
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

function channel(type: string, config: Record<string, unknown>) {
  return { id: `id-${type}`, organizationId: null, type, enabled: true, config };
}

const historyRows = () => mockHistoryCreate.mock.calls.map((call) => call[0].data);

describe('POST /api/webhook/gitlab alert history', () => {
  const originalFetch = global.fetch;
  const originalSecret = process.env.GITLAB_WEBHOOK_SECRET;
  let fetchMock: jest.Mock;
  let consoleSpies: jest.SpyInstance[];

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(() => undefined)
    );
    process.env.GITLAB_WEBHOOK_SECRET = WEBHOOK_SECRET;
    mockHistoryCreate.mockResolvedValue({});
    fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    consoleSpies.forEach((spy) => spy.mockRestore());
    global.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.GITLAB_WEBHOOK_SECRET;
    else process.env.GITLAB_WEBHOOK_SECRET = originalSecret;
  });

  it('records sent: true only for channels whose sender ran and succeeded', async () => {
    mockFindMany.mockResolvedValue([
      channel('slack', { webhookUrl: 'https://hooks.slack.test/ok' }),
      channel('email', { smtpHost: 'smtp.example.com', password: 'x' }),
      channel('webhook', { url: 'https://ops.example.com/hook' }),
    ]);

    const res = await POST(pipelineEvent());

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://hooks.slack.test/ok');
    // Email and generic webhook have no sender: nothing is attempted, nothing is recorded.
    expect(historyRows()).toEqual([expect.objectContaining({ channel: 'slack', sent: true, pipelineId: 99 })]);
  });

  it('records sent: false with the reason when the upstream rejects the alert', async () => {
    mockFindMany.mockResolvedValue([channel('discord', { webhookUrl: 'https://discord.test/hook' })]);
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

    await POST(pipelineEvent());

    expect(historyRows()).toEqual([
      expect.objectContaining({ channel: 'discord', sent: false, error: 'Discord webhook failed (HTTP 404)' }),
    ]);
  });

  it('records sent: false without calling out when the stored config is unusable', async () => {
    mockFindMany.mockResolvedValue([
      channel('telegram', { chatId: '42' }),
      channel('slack', { webhookUrl: 'https://user:pw@hooks.slack.test/x' }),
    ]);

    await POST(pipelineEvent());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(historyRows()).toEqual([
      expect.objectContaining({ channel: 'telegram', sent: false, error: 'Bot token is not set' }),
      expect.objectContaining({ channel: 'slack', sent: false, error: 'Webhook URL must not contain credentials' }),
    ]);
  });

  it('does not turn a delivered alert into a failure when the history write fails', async () => {
    mockFindMany.mockResolvedValue([
      channel('slack', { webhookUrl: 'https://hooks.slack.test/a' }),
      channel('discord', { webhookUrl: 'https://discord.test/b' }),
    ]);
    mockHistoryCreate.mockRejectedValueOnce(new Error('db down'));

    const res = await POST(pipelineEvent());

    // 200 so GitLab does not retry and resend the alert; the next channel is still notified.
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(historyRows()).toEqual([
      expect.objectContaining({ channel: 'slack', sent: true }),
      expect.objectContaining({ channel: 'discord', sent: true }),
    ]);
  });
});
