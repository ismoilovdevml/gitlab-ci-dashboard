/**
 * @jest-environment node
 */
import {
  ChannelConfigError,
  isDeliverableChannelType,
  parseTelegramConfig,
  parseWebhookUrlConfig,
  sendChannelAlert,
  sendDiscordAlert,
  sendSlackAlert,
  sendTelegramAlert,
} from '@/lib/notifications';
import { startMockWebhookServer, type MockWebhookServer } from '@/lib/notifications/testing/mock-webhook-server';

const ALERT = {
  title: 'Pipeline FAILED',
  message: 'Project: demo',
  url: 'https://gitlab.example.com/demo/-/pipelines/1',
  status: 'failed',
};

describe('notification senders', () => {
  let server: MockWebhookServer;

  beforeEach(async () => {
    server = await startMockWebhookServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('posts a Slack message to the webhook URL', async () => {
    await sendSlackAlert({ webhookUrl: server.url('/services/T/B/X') }, ALERT);

    expect(server.requests).toHaveLength(1);
    const [req] = server.requests;
    expect(req.method).toBe('POST');
    expect(req.path).toBe('/services/T/B/X');
    expect(req.headers['content-type']).toBe('application/json');
    expect(req.body).toMatchObject({
      text: '❌ Pipeline FAILED',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: '*Pipeline FAILED*\n\nProject: demo' } },
        { type: 'actions', elements: [{ url: ALERT.url }] },
      ],
    });
  });

  it('posts a Discord embed to the webhook URL', async () => {
    await sendDiscordAlert({ webhookUrl: server.url() }, { ...ALERT, status: 'success' });

    expect(server.requests[0].body).toMatchObject({
      embeds: [{ title: '✅ Pipeline FAILED', description: 'Project: demo', url: ALERT.url, color: 3066993 }],
    });
  });

  it('reports the upstream status when the webhook rejects the message', async () => {
    server.respondWith(404);

    await expect(sendSlackAlert({ webhookUrl: server.url() }, ALERT)).rejects.toThrow(
      'Slack webhook failed (HTTP 404)'
    );
    await expect(sendDiscordAlert({ webhookUrl: server.url() }, ALERT)).rejects.toThrow(
      'Discord webhook failed (HTTP 404)'
    );
  });

  it('does not follow redirects from a webhook URL', async () => {
    server.respondWith(307, server.url('/elsewhere'));

    await expect(sendSlackAlert({ webhookUrl: server.url('/hook') }, ALERT)).rejects.toThrow();
    expect(server.requests.map((r) => r.path)).toEqual(['/hook']);
  });

  it('sends a Telegram message through the Bot API', async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      await sendTelegramAlert({ botToken: '123:abc', chatId: '-100' }, ALERT);
    } finally {
      global.fetch = originalFetch;
    }

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.telegram.org/bot123:abc/sendMessage');
    expect(JSON.parse(init.body as string)).toMatchObject({ chat_id: '-100', parse_mode: 'Markdown' });
  });

  it("uses Telegram's error description, or the status when there is none", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(new Response('{"description":"Bad Request: chat not found"}', { status: 400 }))
      .mockResolvedValueOnce(new Response('<html>', { status: 502 })) as unknown as typeof fetch;
    try {
      const config = { botToken: '123:abc', chatId: '-100' };
      await expect(sendTelegramAlert(config, ALERT)).rejects.toThrow('Bad Request: chat not found');
      await expect(sendTelegramAlert(config, ALERT)).rejects.toThrow('Telegram API error (HTTP 502)');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('channel config parsing', () => {
  it('accepts deliverable channel types only', () => {
    expect(['telegram', 'slack', 'discord'].every(isDeliverableChannelType)).toBe(true);
    expect(isDeliverableChannelType('email')).toBe(false);
    expect(isDeliverableChannelType('webhook')).toBe(false);
    expect(isDeliverableChannelType(undefined)).toBe(false);
  });

  it('requires a bot token and chat id', () => {
    expect(parseTelegramConfig({ botToken: ' t ', chatId: '1', enabled: true })).toEqual({
      botToken: 't',
      chatId: '1',
    });
    expect(() => parseTelegramConfig({ chatId: '1' })).toThrow(new ChannelConfigError('Bot token is not set'));
    expect(() => parseTelegramConfig(null)).toThrow(ChannelConfigError);
  });

  it.each([
    [{}, 'Webhook URL is not set'],
    [{ webhookUrl: 'not a url' }, 'Webhook URL is not a valid URL'],
    [{ webhookUrl: 'file:///etc/passwd' }, 'Webhook URL must use http or https'],
  ])('rejects webhook config %p', (config, message) => {
    expect(() => parseWebhookUrlConfig(config)).toThrow(new ChannelConfigError(message));
  });

  it('refuses to send with an incomplete config', async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      await expect(sendChannelAlert('slack', { webhookUrl: '' }, ALERT)).rejects.toThrow(ChannelConfigError);
    } finally {
      global.fetch = originalFetch;
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
