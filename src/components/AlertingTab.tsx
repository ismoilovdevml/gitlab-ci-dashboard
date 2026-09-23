'use client';

import { useState, useEffect } from 'react';
import { Bell, TestTube, Settings, History, Check, Webhook } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';
import { useTheme } from '@/hooks/useTheme';
import { useNotifications } from '@/hooks/useNotifications';
import { channelsApi, TESTABLE_CHANNELS, type AlertChannel, type StoredChannel } from '@/lib/api/alerts';
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
    headers: Record<string, string>;
  };
}

const CHANNELS: AlertChannel[] = ['telegram', 'slack', 'discord', 'email', 'webhook'];

const DEFAULT_CONFIG: ChannelConfig = {
  telegram: { enabled: false, botToken: '', chatId: '' },
  slack: { enabled: false, webhookUrl: '', channel: '#general' },
  discord: { enabled: false, webhookUrl: '' },
  email: { enabled: false, smtpHost: '', smtpPort: '587', username: '', password: '', from: '', to: '' },
  webhook: { enabled: false, url: '', headers: {} },
};

function isAlertChannel(type: string): type is AlertChannel {
  return (CHANNELS as string[]).includes(type);
}

/** Saved form state per channel, to tell whether the form has unsaved edits. */
type SavedSnapshots = Partial<Record<AlertChannel, string>>;

function applyStoredChannels(stored: StoredChannel[]): { config: ChannelConfig; saved: SavedSnapshots } {
  const config: ChannelConfig = { ...DEFAULT_CONFIG };
  const saved: SavedSnapshots = {};
  const merged = config as unknown as Record<AlertChannel, Record<string, unknown>>;
  for (const channel of stored) {
    if (!isAlertChannel(channel.type)) continue;
    merged[channel.type] = { ...merged[channel.type], ...channel.config, enabled: channel.enabled };
    saved[channel.type] = JSON.stringify(merged[channel.type]);
  }
  return { config, saved };
}

export default function AlertingTab() {
  const { card, textPrimary, textSecondary, input } = useTheme();
  const { addNotification } = useDashboardStore();
  const { notifyError, notifySuccess } = useNotifications();

  const [activeTab, setActiveTab] = useState<'webhook' | 'channels' | 'history'>('webhook');
  const [activeChannel, setActiveChannel] = useState<AlertChannel>('telegram');

  const [channelConfig, setChannelConfig] = useState<ChannelConfig>(DEFAULT_CONFIG);
  const [savedSnapshots, setSavedSnapshots] = useState<SavedSnapshots>({});
  const [testing, setTesting] = useState(false);

  // Load config from API
  useEffect(() => {
    let ignore = false;

    channelsApi
      .getAll()
      .then((stored) => {
        if (ignore) return;
        const { config, saved } = applyStoredChannels(stored);
        setChannelConfig(config);
        setSavedSnapshots(saved);
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

  const markSaved = (channel: AlertChannel, config: ChannelConfig[AlertChannel]) => {
    setSavedSnapshots((previous) => ({ ...previous, [channel]: JSON.stringify(config) }));
  };

  const saveChannelConfig = async () => {
    const config = channelConfig[activeChannel];
    try {
      // Save active channel to API
      await channelsApi.save(activeChannel, config.enabled, config);
      markSaved(activeChannel, config);

      notifySuccess('Saved', 'Channel configuration saved successfully');
    } catch (error) {
      console.error('Failed to save channel:', error);
      notifyError('Error', 'Failed to save channel configuration');
    }
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
                  onClick={async () => {
                    const updated = {
                      ...channelConfig,
                      [activeChannel]: {
                        ...channelConfig[activeChannel],
                        enabled: !channelConfig[activeChannel].enabled,
                      },
                    };
                    setChannelConfig(updated);

                    // Auto-save to API when toggling
                    try {
                      await channelsApi.save(
                        activeChannel,
                        updated[activeChannel].enabled,
                        updated[activeChannel]
                      );
                      markSaved(activeChannel, updated[activeChannel]);
                      notifySuccess('Saved', `${activeChannel} ${updated[activeChannel].enabled ? 'enabled' : 'disabled'}`);
                    } catch (error) {
                      console.error('Failed to toggle channel:', error);
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
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

              {/* Telegram Config */}
              {activeChannel === 'telegram' && (
                <div className="space-y-4">
                  <div>
                    <label className={`block font-medium ${textPrimary} mb-2`}>Bot Token</label>
                    <input
                      type="password"
                      value={channelConfig.telegram.botToken}
                      onChange={(e) => {
                        const updated = {
                          ...channelConfig,
                          telegram: { ...channelConfig.telegram, botToken: e.target.value }
                        };
                        setChannelConfig(updated);
                      }}
                      placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                      className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
                    />
                    <p className={`text-sm ${textSecondary} mt-1`}>Get from @BotFather</p>
                  </div>
                  <div>
                    <label className={`block font-medium ${textPrimary} mb-2`}>Chat ID</label>
                    <input
                      type="text"
                      value={channelConfig.telegram.chatId}
                      onChange={(e) => {
                        const updated = {
                          ...channelConfig,
                          telegram: { ...channelConfig.telegram, chatId: e.target.value }
                        };
                        setChannelConfig(updated);
                      }}
                      placeholder="-1001234567890"
                      className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
                    />
                  </div>
                </div>
              )}

              {/* Slack Config */}
              {activeChannel === 'slack' && (
                <div className="space-y-4">
                  <div>
                    <label className={`block font-medium ${textPrimary} mb-2`}>Webhook URL</label>
                    <input
                      type="password"
                      value={channelConfig.slack.webhookUrl}
                      onChange={(e) => {
                        const updated = {
                          ...channelConfig,
                          slack: { ...channelConfig.slack, webhookUrl: e.target.value }
                        };
                        setChannelConfig(updated);
                      }}
                      placeholder="https://hooks.slack.com/services/..."
                      className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
                    />
                  </div>
                  <div>
                    <label className={`block font-medium ${textPrimary} mb-2`}>Channel</label>
                    <input
                      type="text"
                      value={channelConfig.slack.channel}
                      onChange={(e) => {
                        const updated = {
                          ...channelConfig,
                          slack: { ...channelConfig.slack, channel: e.target.value }
                        };
                        setChannelConfig(updated);
                      }}
                      placeholder="#general"
                      className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
                    />
                  </div>
                </div>
              )}

              {/* Discord Config */}
              {activeChannel === 'discord' && (
                <div className="space-y-4">
                  <div>
                    <label className={`block font-medium ${textPrimary} mb-2`}>Webhook URL</label>
                    <input
                      type="password"
                      value={channelConfig.discord.webhookUrl}
                      onChange={(e) => {
                        const updated = {
                          ...channelConfig,
                          discord: { ...channelConfig.discord, webhookUrl: e.target.value }
                        };
                        setChannelConfig(updated);
                      }}
                      placeholder="https://discord.com/api/webhooks/..."
                      className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
                    />
                  </div>
                </div>
              )}

              {/* Email Config */}
              {activeChannel === 'email' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={`block font-medium ${textPrimary} mb-2`}>SMTP Host</label>
                      <input
                        type="text"
                        value={channelConfig.email.smtpHost}
                        onChange={(e) => {
                          const updated = {
                            ...channelConfig,
                            email: { ...channelConfig.email, smtpHost: e.target.value }
                          };
                          setChannelConfig(updated);
                        }}
                        placeholder="smtp.gmail.com"
                        className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
                      />
                    </div>
                    <div>
                      <label className={`block font-medium ${textPrimary} mb-2`}>SMTP Port</label>
                      <input
                        type="text"
                        value={channelConfig.email.smtpPort}
                        onChange={(e) => {
                          const updated = {
                            ...channelConfig,
                            email: { ...channelConfig.email, smtpPort: e.target.value }
                          };
                          setChannelConfig(updated);
                        }}
                        placeholder="587"
                        className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={`block font-medium ${textPrimary} mb-2`}>Username</label>
                      <input
                        type="text"
                        value={channelConfig.email.username}
                        onChange={(e) => {
                          const updated = {
                            ...channelConfig,
                            email: { ...channelConfig.email, username: e.target.value }
                          };
                          setChannelConfig(updated);
                        }}
                        placeholder="user@gmail.com"
                        className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
                      />
                    </div>
                    <div>
                      <label className={`block font-medium ${textPrimary} mb-2`}>Password</label>
                      <input
                        type="password"
                        value={channelConfig.email.password}
                        onChange={(e) => {
                          const updated = {
                            ...channelConfig,
                            email: { ...channelConfig.email, password: e.target.value }
                          };
                          setChannelConfig(updated);
                        }}
                        placeholder="••••••••"
                        className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={`block font-medium ${textPrimary} mb-2`}>From Email</label>
                    <input
                      type="email"
                      value={channelConfig.email.from}
                      onChange={(e) => {
                        const updated = {
                          ...channelConfig,
                          email: { ...channelConfig.email, from: e.target.value }
                        };
                        setChannelConfig(updated);
                      }}
                      placeholder="alerts@example.com"
                      className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
                    />
                  </div>
                  <div>
                    <label className={`block font-medium ${textPrimary} mb-2`}>To Email</label>
                    <input
                      type="email"
                      value={channelConfig.email.to}
                      onChange={(e) => {
                        const updated = {
                          ...channelConfig,
                          email: { ...channelConfig.email, to: e.target.value }
                        };
                        setChannelConfig(updated);
                      }}
                      placeholder="team@example.com"
                      className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
                    />
                  </div>
                  <p className={`text-sm ${textSecondary}`}>
                    ⚠️ Email alerts require backend server (coming soon)
                  </p>
                </div>
              )}

              {/* Webhook Config */}
              {activeChannel === 'webhook' && (
                <div className="space-y-4">
                  <div>
                    <label className={`block font-medium ${textPrimary} mb-2`}>Webhook URL</label>
                    <input
                      type="text"
                      value={channelConfig.webhook.url}
                      onChange={(e) => {
                        const updated = {
                          ...channelConfig,
                          webhook: { ...channelConfig.webhook, url: e.target.value }
                        };
                        setChannelConfig(updated);
                      }}
                      placeholder="https://your-api.com/webhook"
                      className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-hidden focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="pt-4 space-y-2">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={saveChannelConfig}
                    className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
                  >
                    <Check className="w-4 h-4" />
                    Save Configuration
                  </button>
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
