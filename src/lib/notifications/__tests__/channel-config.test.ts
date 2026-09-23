/**
 * @jest-environment node
 */
import {
  buildChannelConfig,
  ChannelSaveError,
  maskChannelConfig,
  maskSecret,
  toMaskedChannel,
} from '../channel-config';
import { httpUrlSchema } from '@/lib/validation';

const BOT_TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';
const SLACK_URL = 'https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXXXXXXXXXXXXXX';
const SMTP_PASSWORD = 'smtp-pass-1';
const SMTP_USER = 'alerts@example.com';

const emailConfig = {
  smtpHost: 'smtp.example.com',
  smtpPort: 587,
  username: SMTP_USER,
  password: SMTP_PASSWORD,
  from: 'ci@example.com',
  to: 'team@example.com',
};

function saveError(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ChannelSaveError);
    return (error as Error).message;
  }
  throw new Error('expected a ChannelSaveError');
}

describe('maskSecret', () => {
  it('shows the last four characters of long secrets only', () => {
    expect(maskSecret(BOT_TOKEN, true)).toBe('***Dsaw');
    expect(maskSecret('short', true)).toBe('***');
    expect(maskSecret(BOT_TOKEN, false)).toBe('***');
  });
});

describe('maskChannelConfig', () => {
  it.each([
    ['telegram', { botToken: BOT_TOKEN, chatId: '-100123' }, BOT_TOKEN],
    ['slack', { webhookUrl: SLACK_URL, channel: '#ci' }, SLACK_URL],
    ['discord', { webhookUrl: SLACK_URL }, SLACK_URL],
    ['webhook', { url: SLACK_URL, headers: { Authorization: 'Bearer abc' } }, SLACK_URL],
    ['email', emailConfig, SMTP_PASSWORD],
  ])('never includes the %s secret', (type, config, secret) => {
    const masked = JSON.stringify(maskChannelConfig(type, config));
    expect(masked).not.toContain(secret);
    expect(masked).not.toContain('Bearer abc');
  });

  it('keeps public fields and masks secrets', () => {
    expect(maskChannelConfig('telegram', { botToken: BOT_TOKEN, chatId: '-100123' })).toEqual({
      botToken: '***Dsaw',
      chatId: '-100123',
    });
    expect(maskChannelConfig('email', emailConfig)).toEqual({
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      username: '***',
      password: '***',
      from: 'ci@example.com',
      to: 'team@example.com',
    });
  });

  it('omits unset secrets and drops unknown fields', () => {
    expect(maskChannelConfig('slack', { channel: '#ci', enabled: true, extra: 'x' })).toEqual({ channel: '#ci' });
    expect(maskChannelConfig('unknown', { token: 'x' })).toEqual({});
    expect(maskChannelConfig('telegram', null)).toEqual({});
  });

  it('toMaskedChannel does not carry the organization or raw config', () => {
    const masked = toMaskedChannel({
      id: 'c1',
      type: 'slack',
      enabled: true,
      config: { webhookUrl: SLACK_URL },
      updatedAt: '2026-01-01T00:00:00.000Z',
      organizationId: 'org-1',
    } as Parameters<typeof toMaskedChannel>[0]);
    expect(masked).toEqual({
      id: 'c1',
      type: 'slack',
      enabled: true,
      config: { webhookUrl: '***XXXX' },
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });
});

describe('buildChannelConfig', () => {
  it('validates and normalises a new channel', () => {
    expect(
      buildChannelConfig('slack', true, { webhookUrl: ' HTTPS://Hooks.Example.com/x ', channel: '#ci', enabled: true }, null)
    ).toEqual({ enabled: true, config: { webhookUrl: 'https://hooks.example.com/x', channel: '#ci' } });
  });

  it.each([
    ['', /Enter the webhook URL/],
    ['   ', /Enter the webhook URL/],
    ['not a url', /valid URL/],
    ['ftp://hooks.example.com/x', /http or https/],
    ['javascript:alert(1)', /http or https/],
    ['https://user:pass@hooks.example.com/x', /credentials/],
  ])('rejects the webhook URL %p', (url, message) => {
    expect(saveError(() => buildChannelConfig('discord', true, { webhookUrl: url }, null))).toMatch(message);
  });

  it.each(['12a4', '-100abc', '@ab', 'chat id'])('rejects the Telegram chat id %p', (chatId) => {
    expect(saveError(() => buildChannelConfig('telegram', true, { botToken: BOT_TOKEN, chatId }, null))).toMatch(
      /chat ID/
    );
  });

  it('accepts numeric and @channel Telegram chat ids', () => {
    for (const chatId of ['42', '-1001234567890', '@ci_alerts']) {
      expect(buildChannelConfig('telegram', true, { botToken: BOT_TOKEN, chatId }, null).config.chatId).toBe(chatId);
    }
  });

  it('rejects a malformed Telegram bot token', () => {
    expect(saveError(() => buildChannelConfig('telegram', true, { botToken: 'nope', chatId: '42' }, null))).toMatch(
      /bot token/
    );
  });

  it('validates email settings', () => {
    expect(
      buildChannelConfig('email', false, { ...emailConfig, smtpPort: '465', to: 'a@example.com,b@example.com' }, null)
        .config
    ).toEqual({ ...emailConfig, smtpPort: 465, to: 'a@example.com, b@example.com' });
    expect(saveError(() => buildChannelConfig('email', false, { ...emailConfig, to: 'a@example.com, nope' }, null))).toMatch(
      /nope/
    );
    expect(saveError(() => buildChannelConfig('email', false, { ...emailConfig, smtpPort: '99999' }, null))).toMatch(
      /SMTP port/
    );
  });

  describe('stored secrets', () => {
    const stored = { botToken: BOT_TOKEN, chatId: '42' };

    it.each([
      ['blank', ''],
      ['missing', undefined],
      ['the mask', '***Dsaw'],
    ])('keeps the stored secret when it is sent %s', (_, botToken) => {
      expect(buildChannelConfig('telegram', true, { botToken, chatId: '42' }, stored).config).toEqual(stored);
    });

    it('replaces the secret when a new one is entered', () => {
      const newToken = '987654321:BBHdqTcvCH1vGWJxfSeofSAs0K5PALDzzz';
      expect(buildChannelConfig('telegram', true, { botToken: newToken, chatId: '42' }, stored).config.botToken).toBe(
        newToken
      );
    });

    it('rejects a mask that does not match the stored secret instead of saving it', () => {
      expect(saveError(() => buildChannelConfig('telegram', true, { botToken: '***abcd', chatId: '42' }, stored))).toMatch(
        /Enter the bot token again/
      );
      expect(saveError(() => buildChannelConfig('slack', true, { webhookUrl: '***XXXX' }, null))).toMatch(
        /Enter the webhook URL again/
      );
    });

    it('requires a secret for a new channel', () => {
      expect(saveError(() => buildChannelConfig('slack', true, { webhookUrl: '' }, null))).toBe('Enter the webhook URL');
      expect(saveError(() => buildChannelConfig('telegram', true, { chatId: '42' }, null))).toBe('Enter the bot token');
    });

    it('requires the bot token again to change the Telegram chat', () => {
      expect(saveError(() => buildChannelConfig('telegram', true, { botToken: '', chatId: '43' }, stored))).toMatch(
        /Enter the bot token again to change the chat ID/
      );
    });

    it('requires the SMTP credentials again to change the SMTP server', () => {
      const submitted = { ...emailConfig, username: '', password: '', smtpHost: 'smtp.attacker.example' };
      expect(saveError(() => buildChannelConfig('email', true, submitted, emailConfig))).toMatch(
        /SMTP username and SMTP password again to change the SMTP host/
      );
      expect(
        buildChannelConfig('email', true, { ...emailConfig, username: '', password: '', smtpPort: '587' }, emailConfig)
          .config
      ).toEqual(emailConfig);
    });

    it('does not carry secrets over from another channel type', () => {
      expect(saveError(() => buildChannelConfig('discord', true, { webhookUrl: '' }, null))).toMatch(/webhook URL/);
    });
  });
});

describe('httpUrlSchema', () => {
  it('normalises http(s) URLs', () => {
    expect(httpUrlSchema.parse('http://Example.COM:80/a b')).toBe('http://example.com/a%20b');
  });
});
