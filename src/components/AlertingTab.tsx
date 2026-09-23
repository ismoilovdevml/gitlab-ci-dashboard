'use client';

import { useState, useEffect } from 'react';
import { Bell, TestTube, Settings, History, Check, Webhook, Lock } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';
import { useTheme } from '@/hooks/useTheme';
import { useNotifications } from '@/hooks/useNotifications';
import {
  channelsApi,
  SECRET_FIELDS,
  TESTABLE_CHANNELS,
  type AlertChannel,
  type StoredChannel,
} from '@/lib/api/alerts';
import WebhookSetup from './WebhookSetup';
import AlertHistory from './AlertHistory';
import { TelegramIcon, SlackIcon, DiscordIcon, EmailIcon, WebhookIcon } from './icons/BrandIcons';

interface ChannelConfig {
  telegram: {
    enabled: boolean;
    botToken: string;
    chatId: string;
  };
  slack: {
    enabled: boolean;
    webhookUrl: string;
    channel: string;
  };
  discord: {
    enabled: boolean;
    webhookUrl: string;
  };
  email: {
    enabled: boolean;
    smtpHost: string;
    smtpPort: string;
    username: string;
    password: string;
    from: string;
    to: string;
  };
  webhook: {
    enabled: boolean;
    url: string;
  };
}

const CHANNELS: AlertChannel[] = ['telegram', 'slack', 'discord', 'email', 'webhook'];

const DEFAULT_CONFIG: ChannelConfig = {
  telegram: { enabled: false, botToken: '', chatId: '' },
  slack: { enabled: false, webhookUrl: '', channel: '#general' },
  discord: { enabled: false, webhookUrl: '' },
  email: { enabled: false, smtpHost: '', smtpPort: '587', username: '', password: '', from: '', to: '' },
  webhook: { enabled: false, url: '' },
};

function isAlertChannel(type: string): type is AlertChannel {
  return (CHANNELS as string[]).includes(type);
}

/** Saved form state per channel, to tell whether the form has unsaved edits. */
type SavedSnapshots = Partial<Record<AlertChannel, string>>;

/** Masked value of each stored secret, e.g. `***abcd`, shown instead of the secret. */
type SecretHints = Partial<Record<AlertChannel, Record<string, string>>>;

type ChannelForm = Record<string, unknown>;

/**
 * Form state for a stored channel. Secret inputs start blank (blank keeps the
 * stored value on save); their masks go to the hints.
 */
function formFromStored(channel: AlertChannel, stored: StoredChannel): { form: ChannelForm; hints: Record<string, string> } {
  const form: ChannelForm = { ...DEFAULT_CONFIG[channel], enabled: stored.enabled === true };
  const hints: Record<string, string> = {};
  for (const [field, value] of Object.entries(stored.config ?? {})) {
    if (!(field in form) || field === 'enabled') continue;
    if (SECRET_FIELDS[channel].includes(field)) {
      if (typeof value === 'string' && value !== '') hints[field] = value;
      continue;
    }
    form[field] = value === null || value === undefined ? '' : String(value);
  }
  return { form, hints };
}

function applyStoredChannels(stored: StoredChannel[]): { config: ChannelConfig; saved: SavedSnapshots; hints: SecretHints } {
  const config: ChannelConfig = { ...DEFAULT_CONFIG };
  const saved: SavedSnapshots = {};
  const hints: SecretHints = {};
  const forms = config as unknown as Record<AlertChannel, ChannelForm>;
  for (const channel of stored) {
    if (!isAlertChannel(channel.type)) continue;
    const { form, hints: channelHints } = formFromStored(channel.type, channel);
    forms[channel.type] = form;
    hints[channel.type] = channelHints;
    saved[channel.type] = JSON.stringify(form);
  }
  return { config, saved, hints };
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function AlertingTab() {
  const { card, textPrimary, textSecondary, input } = useTheme();
  const { addNotification } = useDashboardStore();
  const { notifyError, notifySuccess } = useNotifications();

  const [activeTab, setActiveTab] = useState<'webhook' | 'channels' | 'history'>('webhook');
  const [activeChannel, setActiveChannel] = useState<AlertChannel>('telegram');

  const [channelConfig, setChannelConfig] = useState<ChannelConfig>(DEFAULT_CONFIG);
  const [savedSnapshots, setSavedSnapshots] = useState<SavedSnapshots>({});
  const [secretHints, setSecretHints] = useState<SecretHints>({});
  const [canManage, setCanManage] = useState(false);
  const [testing, setTesting] = useState(false);

  // Load config from API
  useEffect(() => {
    let ignore = false;

    channelsApi
      .getAll()
      .then(({ channels, canManage: mayManage }) => {
        if (ignore) return;
        const { config, saved, hints } = applyStoredChannels(channels);
        setChannelConfig(config);
        setSavedSnapshots(saved);
        setSecretHints(hints);
        setCanManage(mayManage);
      })
      .catch((error) => {
        console.error('Failed to load data:', error);
        addNotification({
          id: Date.now().toString(),
          type: 'error',
          title: 'Error',
          message: 'Failed to load configuration',
          timestamp: Date.now()
        });
      });

    return () => {
      ignore = true;
    };
  }, [addNotification]);

  /** Replace the channel's form with what the server stored, clearing typed secrets. */
  const applySaved = (channel: AlertChannel, stored: StoredChannel) => {
    const { form, hints } = formFromStored(channel, stored);
    setChannelConfig((previous) => ({ ...previous, [channel]: form }));
    setSecretHints((previous) => ({ ...previous, [channel]: hints }));
    setSavedSnapshots((previous) => ({ ...previous, [channel]: JSON.stringify(form) }));
  };

  const saveChannel = async (channel: AlertChannel, form: ChannelConfig[AlertChannel]) => {
    const { enabled, ...fields } = form;
    const stored = await channelsApi.save(channel, enabled, fields);
    applySaved(channel, stored);
  };

  const saveChannelConfig = async () => {
    try {
      await saveChannel(activeChannel, channelConfig[activeChannel]);
      notifySuccess('Saved', 'Channel configuration saved successfully');
    } catch (error) {
      notifyError('Error', errorText(error, 'Failed to save channel configuration'));
    }
  };

  const toggleChannel = async () => {
    const channel = activeChannel;
    const previous = channelConfig[channel];
    const updated = { ...previous, enabled: !previous.enabled };
    setChannelConfig((current) => ({ ...current, [channel]: updated }));

    try {
      await saveChannel(channel, updated);
      notifySuccess('Saved', `${channel} ${updated.enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      setChannelConfig((current) => ({ ...current, [channel]: previous }));
      notifyError('Error', errorText(error, `Failed to ${updated.enabled ? 'enable' : 'disable'} ${channel}`));
    }
  };

  const updateField = <C extends AlertChannel>(channel: C, field: keyof ChannelConfig[C], value: string) => {
    setChannelConfig((current) => ({ ...current, [channel]: { ...current[channel], [field]: value } }));
  };

  const canTest = TESTABLE_CHANNELS.includes(activeChannel);
  const savedSnapshot = savedSnapshots[activeChannel];
  const hasUnsavedChanges = savedSnapshot !== JSON.stringify(channelConfig[activeChannel]);
  const testHint = !savedSnapshot
    ? 'Save the configuration to send a test message.'
    : hasUnsavedChanges
      ? 'Save your changes first; the test uses the saved configuration.'
      : 'Sends a test message from the server using the saved configuration.';

  const sendTestMessage = async () => {
    setTesting(true);
    try {
      await channelsApi.test(activeChannel);
      notifySuccess('Test sent', `Test message sent to ${activeChannel}`);
    } catch (error) {
      notifyError('Test failed', error instanceof Error ? error.message : `Failed to test ${activeChannel}`);
    } finally {
      setTesting(false);
    }
  };

  /** Placeholder for a secret input: the stored mask when one exists. */
  const secretPlaceholder = (channel: AlertChannel, field: string, example: string): string => {
    const hint = secretHints[channel]?.[field];
    return hint ? `Saved (${hint}) - leave blank to keep` : example;
  };

  const inputClass = `w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 disabled:opacity-60 disabled:cursor-not-allowed`;

  const getChannelIcon = (channel: AlertChannel, size: 'sm' | 'md' = 'md') => {
    const sizeClass = size === 'sm' ? 'w-4 h-4' : 'w-6 h-6';
    switch (channel) {
      case 'telegram': return <TelegramIcon className={sizeClass} />;
      case 'slack': return <SlackIcon className={sizeClass} />;
      case 'discord': return <DiscordIcon className={sizeClass} />;
      case 'email': return <EmailIcon className={sizeClass} />;
      case 'webhook': return <WebhookIcon className={sizeClass} />;
    }
  };

  const getChannelColor = (channel: AlertChannel) => {
    switch (channel) {
      case 'telegram': return 'bg-blue-500';
      case 'slack': return 'bg-purple-500';
      case 'discord': return 'bg-indigo-500';
      case 'email': return 'bg-red-500';
      case 'webhook': return 'bg-green-500';
    }
  };

  const enabledChannelsCount = Object.values(channelConfig).filter(c => c.enabled).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${textPrimary} flex items-center gap-2`}>
            <Bell className="w-7 h-7" />
            Alerting & Notifications
          </h1>
          <p className={`mt-1 ${textSecondary}`}>
            Configure multi-channel alerts for pipeline events • {enabledChannelsCount} channels enabled
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('webhook')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'webhook'
              ? 'border-b-2 border-orange-500 text-orange-500'
              : `${textSecondary} hover:text-gray-300`
          }`}
        >
          <Webhook className="w-4 h-4 inline mr-2" />
          Webhook Setup ⚡
        </button>
        <button
          onClick={() => setActiveTab('channels')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'channels'
              ? 'border-b-2 border-orange-500 text-orange-500'
              : `${textSecondary} hover:text-gray-300`
          }`}
        >
          <Settings className="w-4 h-4 inline mr-2" />
          Channels ({enabledChannelsCount})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'history'
              ? 'border-b-2 border-orange-500 text-orange-500'
              : `${textSecondary} hover:text-gray-300`
          }`}
        >
          <History className="w-4 h-4 inline mr-2" />
          History
        </button>
      </div>

      {/* Webhook Setup Tab */}
      {activeTab === 'webhook' && <WebhookSetup />}

      {/* Channels Tab */}
      {activeTab === 'channels' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Channel Selector */}
          <div className="space-y-2">
            {CHANNELS.map((channel) => (
              <button
                key={channel}
                onClick={() => setActiveChannel(channel)}
                className={`w-full p-4 rounded-lg text-left transition-all ${
                  activeChannel === channel
                    ? `${getChannelColor(channel)} text-white`
                    : `${card} ${textSecondary} hover:bg-gray-700`
                }`}
              >
                <div className="flex items-center gap-3">
                  {getChannelIcon(channel)}
                  <div className="flex-1">
                    <div className="font-medium capitalize">{channel}</div>
                    <div className="text-xs opacity-75">
                      {channelConfig[channel].enabled ? '✓ Enabled' : 'Disabled'}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Channel Configuration */}
          <div className="lg:col-span-3">
            <div className={`${card} p-6 space-y-6`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-lg font-semibold ${textPrimary} capitalize flex items-center gap-2`}>
                  {getChannelIcon(activeChannel, 'sm')}
                  {activeChannel} Configuration
                </h3>
                <button
                  type="button"
                  role="switch"
                  aria-checked={channelConfig[activeChannel].enabled}
                  aria-label={`Enable ${activeChannel} alerts`}
                  onClick={toggleChannel}
                  disabled={!canManage}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    channelConfig[activeChannel].enabled ? 'bg-orange-500' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      channelConfig[activeChannel].enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {!canManage && (
                <p role="note" className={`text-sm ${textSecondary} flex items-center gap-2`}>
                  <Lock className="w-4 h-4" />
                  Only organization owners and admins can change alert channels.
                </p>
              )}

              {/* Telegram Config */}
              {activeChannel === 'telegram' && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="telegram-bot-token" className={`block font-medium ${textPrimary} mb-2`}>Bot Token</label>
                    <input
                      id="telegram-bot-token"
                      type="password"
                      autoComplete="off"
                      value={channelConfig.telegram.botToken}
                      onChange={(e) => updateField('telegram', 'botToken', e.target.value)}
                      disabled={!canManage}
                      placeholder={secretPlaceholder('telegram', 'botToken', '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz')}
                      className={inputClass}
                    />
                    <p className={`text-sm ${textSecondary} mt-1`}>Get from @BotFather</p>
                  </div>
                  <div>
                    <label htmlFor="telegram-chat-id" className={`block font-medium ${textPrimary} mb-2`}>Chat ID</label>
                    <input
                      id="telegram-chat-id"
                      type="text"
                      value={channelConfig.telegram.chatId}
                      onChange={(e) => updateField('telegram', 'chatId', e.target.value)}
                      disabled={!canManage}
                      placeholder="-1001234567890"
                      className={inputClass}
                    />
                    <p className={`text-sm ${textSecondary} mt-1`}>Changing the chat ID requires entering the bot token again.</p>
                  </div>
                </div>
              )}

              {/* Slack Config */}
              {activeChannel === 'slack' && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="slack-webhook-url" className={`block font-medium ${textPrimary} mb-2`}>Webhook URL</label>
                    <input
                      id="slack-webhook-url"
                      type="password"
                      autoComplete="off"
                      value={channelConfig.slack.webhookUrl}
                      onChange={(e) => updateField('slack', 'webhookUrl', e.target.value)}
                      disabled={!canManage}
                      placeholder={secretPlaceholder('slack', 'webhookUrl', 'https://hooks.slack.com/services/...')}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="slack-channel" className={`block font-medium ${textPrimary} mb-2`}>Channel</label>
                    <input
                      id="slack-channel"
                      type="text"
                      value={channelConfig.slack.channel}
                      onChange={(e) => updateField('slack', 'channel', e.target.value)}
                      disabled={!canManage}
                      placeholder="#general"
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              {/* Discord Config */}
              {activeChannel === 'discord' && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="discord-webhook-url" className={`block font-medium ${textPrimary} mb-2`}>Webhook URL</label>
                    <input
                      id="discord-webhook-url"
                      type="password"
                      autoComplete="off"
                      value={channelConfig.discord.webhookUrl}
                      onChange={(e) => updateField('discord', 'webhookUrl', e.target.value)}
                      disabled={!canManage}
                      placeholder={secretPlaceholder('discord', 'webhookUrl', 'https://discord.com/api/webhooks/...')}
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              {/* Email Config */}
              {activeChannel === 'email' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="email-smtp-host" className={`block font-medium ${textPrimary} mb-2`}>SMTP Host</label>
                      <input
                        id="email-smtp-host"
                        type="text"
                        value={channelConfig.email.smtpHost}
                        onChange={(e) => updateField('email', 'smtpHost', e.target.value)}
                        disabled={!canManage}
                        placeholder="smtp.gmail.com"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="email-smtp-port" className={`block font-medium ${textPrimary} mb-2`}>SMTP Port</label>
                      <input
                        id="email-smtp-port"
                        type="text"
                        inputMode="numeric"
                        value={channelConfig.email.smtpPort}
                        onChange={(e) => updateField('email', 'smtpPort', e.target.value)}
                        disabled={!canManage}
                        placeholder="587"
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="email-username" className={`block font-medium ${textPrimary} mb-2`}>Username</label>
                      <input
                        id="email-username"
                        type="text"
                        autoComplete="off"
                        value={channelConfig.email.username}
                        onChange={(e) => updateField('email', 'username', e.target.value)}
                        disabled={!canManage}
                        placeholder={secretPlaceholder('email', 'username', 'user@gmail.com')}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="email-password" className={`block font-medium ${textPrimary} mb-2`}>Password</label>
                      <input
                        id="email-password"
                        type="password"
                        autoComplete="new-password"
                        value={channelConfig.email.password}
                        onChange={(e) => updateField('email', 'password', e.target.value)}
                        disabled={!canManage}
                        placeholder={secretPlaceholder('email', 'password', '••••••••')}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <p className={`text-sm ${textSecondary}`}>
                    Changing the SMTP host or port requires entering the credentials again.
                  </p>
                  <div>
                    <label htmlFor="email-from" className={`block font-medium ${textPrimary} mb-2`}>From Email</label>
                    <input
                      id="email-from"
                      type="email"
                      value={channelConfig.email.from}
                      onChange={(e) => updateField('email', 'from', e.target.value)}
                      disabled={!canManage}
                      placeholder="alerts@example.com"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="email-to" className={`block font-medium ${textPrimary} mb-2`}>To Email</label>
                    <input
                      id="email-to"
                      type="email"
                      multiple
                      value={channelConfig.email.to}
                      onChange={(e) => updateField('email', 'to', e.target.value)}
                      disabled={!canManage}
                      placeholder="team@example.com, oncall@example.com"
                      className={inputClass}
                    />
                  </div>
                  <p className={`text-sm ${textSecondary}`}>
                    Email alerts are not sent yet; the settings are stored for when delivery is added.
                  </p>
                </div>
              )}

              {/* Webhook Config */}
              {activeChannel === 'webhook' && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="webhook-url" className={`block font-medium ${textPrimary} mb-2`}>Webhook URL</label>
                    <input
                      id="webhook-url"
                      type="password"
                      autoComplete="off"
                      value={channelConfig.webhook.url}
                      onChange={(e) => updateField('webhook', 'url', e.target.value)}
                      disabled={!canManage}
                      placeholder={secretPlaceholder('webhook', 'url', 'https://your-api.com/webhook')}
                      className={inputClass}
                    />
                  </div>
                  <p className={`text-sm ${textSecondary}`}>
                    Generic webhook alerts are not sent yet; the settings are stored for when delivery is added.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="pt-4 space-y-2">
                <div className="flex gap-3">
                  {canManage && (
                    <button
                      type="button"
                      onClick={saveChannelConfig}
                      className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
                    >
                      <Check className="w-4 h-4" />
                      Save Configuration
                    </button>
                  )}
                  {canTest && (
                    <button
                      type="button"
                      onClick={sendTestMessage}
                      disabled={!savedSnapshot || hasUnsavedChanges || testing}
                      aria-describedby="channel-test-hint"
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                    >
                      <TestTube className="w-4 h-4" />
                      {testing ? 'Sending...' : 'Send Test Message'}
                    </button>
                  )}
                </div>
                {canTest && (
                  <p id="channel-test-hint" className={`text-sm ${textSecondary}`}>
                    {testHint}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && <AlertHistory />}
    </div>
  );
}
