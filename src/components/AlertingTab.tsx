'use client';

import { useState, useEffect } from 'react';
import { Bell, Send, TestTube, Settings, History, Plus, Trash2, Check, X, MessageSquare, Mail, Hash } from 'lucide-react';
import { useDashboardStore } from '@/store/dashboard-store';
import { useTheme } from '@/hooks/useTheme';

type AlertChannel = 'telegram' | 'slack' | 'discord' | 'email' | 'webhook';

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

interface AlertRule {
  id: string;
  name: string;
  projectId: number | 'all';
  projectName: string;
  channels: AlertChannel[];
  events: {
    success: boolean;
    failed: boolean;
    running: boolean;
    canceled: boolean;
  };
  enabled: boolean;
  createdAt: string;
}

interface AlertHistory {
  id: string;
  timestamp: string;
  projectName: string;
  pipelineId: number;
  status: string;
  message: string;
  channel: AlertChannel;
  sent: boolean;
}

export default function AlertingTab() {
  const { theme, card, textPrimary, textSecondary, input } = useTheme();
  const { addNotification } = useDashboardStore();

  const [activeTab, setActiveTab] = useState<'channels' | 'rules' | 'history'>('channels');
  const [activeChannel, setActiveChannel] = useState<AlertChannel>('telegram');

  const [channelConfig, setChannelConfig] = useState<ChannelConfig>({
    telegram: { enabled: false, botToken: '', chatId: '' },
    slack: { enabled: false, webhookUrl: '', channel: '#general' },
    discord: { enabled: false, webhookUrl: '' },
    email: { enabled: false, smtpHost: '', smtpPort: '587', username: '', password: '', from: '', to: '' },
    webhook: { enabled: false, url: '', headers: {} },
  });

  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [alertHistory, setAlertHistory] = useState<AlertHistory[]>([]);
  const [testing, setTesting] = useState(false);

  // Load config from localStorage
  useEffect(() => {
    const savedConfig = localStorage.getItem('alert_channel_config');
    if (savedConfig) {
      setChannelConfig(JSON.parse(savedConfig));
    }

    const savedRules = localStorage.getItem('alert_rules');
    if (savedRules) {
      setAlertRules(JSON.parse(savedRules));
    }

    const savedHistory = localStorage.getItem('alert_history');
    if (savedHistory) {
      setAlertHistory(JSON.parse(savedHistory));
    }
  }, []);

  const saveChannelConfig = () => {
    localStorage.setItem('alert_channel_config', JSON.stringify(channelConfig));
    addNotification({
      id: Date.now().toString(),
      type: 'success',
      title: 'Saved',
      message: 'Channel configuration saved successfully',
      timestamp: Date.now()
    });
  };

  const testChannel = async (channel: AlertChannel) => {
    setTesting(true);
    try {
      switch (channel) {
        case 'telegram':
          await testTelegram();
          break;
        case 'slack':
          await testSlack();
          break;
        case 'discord':
          await testDiscord();
          break;
        case 'email':
          addNotification({
            id: Date.now().toString(),
            type: 'info',
            title: 'Info',
            message: 'Email test will be implemented with backend',
            timestamp: Date.now()
          });
          break;
        case 'webhook':
          await testWebhook();
          break;
      }
    } catch (error) {
      addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Error',
        message: `Failed to test ${channel}`,
        timestamp: Date.now()
      });
    } finally {
      setTesting(false);
    }
  };

  const testTelegram = async () => {
    const { botToken, chatId } = channelConfig.telegram;
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '🔔 *GitLab CI/CD Dashboard*\n\n✅ Telegram integration test successful!\n\nYour alerts are configured.',
        parse_mode: 'Markdown',
      }),
    });

    if (response.ok) {
      addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Success',
        message: 'Telegram test message sent successfully',
        timestamp: Date.now()
      });
    } else {
      const error = await response.json();
      throw new Error(error.description);
    }
  };

  const testSlack = async () => {
    const { webhookUrl } = channelConfig.slack;
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '🔔 GitLab CI/CD Dashboard',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*GitLab CI/CD Dashboard*\n\n✅ Slack integration test successful!\n\nYour alerts are configured.',
            },
          },
        ],
      }),
    });

    if (response.ok) {
      addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Success',
        message: 'Slack test message sent successfully',
        timestamp: Date.now()
      });
    } else {
      throw new Error('Slack webhook failed');
    }
  };

  const testDiscord = async () => {
    const { webhookUrl } = channelConfig.discord;
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '🔔 **GitLab CI/CD Dashboard**\n\n✅ Discord integration test successful!\n\nYour alerts are configured.',
      }),
    });

    if (response.ok) {
      addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Success',
        message: 'Discord test message sent successfully',
        timestamp: Date.now()
      });
    } else {
      throw new Error('Discord webhook failed');
    }
  };

  const testWebhook = async () => {
    const { url, headers } = channelConfig.webhook;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        event: 'test',
        message: 'GitLab CI/CD Dashboard webhook test',
        timestamp: new Date().toISOString(),
      }),
    });

    if (response.ok) {
      addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Success',
        message: 'Webhook test successful',
        timestamp: Date.now()
      });
    } else {
      throw new Error('Webhook failed');
    }
  };

  const addAlertRule = () => {
    const newRule: AlertRule = {
      id: Date.now().toString(),
      name: 'New Alert Rule',
      projectId: 'all',
      projectName: 'All Projects',
      channels: ['telegram'],
      events: {
        success: false,
        failed: true,
        running: false,
        canceled: false,
      },
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    const updatedRules = [...alertRules, newRule];
    setAlertRules(updatedRules);
    localStorage.setItem('alert_rules', JSON.stringify(updatedRules));
  };

  const deleteAlertRule = (id: string) => {
    const updatedRules = alertRules.filter(rule => rule.id !== id);
    setAlertRules(updatedRules);
    localStorage.setItem('alert_rules', JSON.stringify(updatedRules));
    addNotification({
      id: Date.now().toString(),
      type: 'success',
      title: 'Deleted',
      message: 'Alert rule deleted successfully',
      timestamp: Date.now()
    });
  };

  const toggleRule = (id: string) => {
    const updatedRules = alertRules.map(rule =>
      rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
    );
    setAlertRules(updatedRules);
    localStorage.setItem('alert_rules', JSON.stringify(updatedRules));
  };

  const toggleRuleEvent = (id: string, event: keyof AlertRule['events']) => {
    const updatedRules = alertRules.map(rule =>
      rule.id === id ? { ...rule, events: { ...rule.events, [event]: !rule.events[event] } } : rule
    );
    setAlertRules(updatedRules);
    localStorage.setItem('alert_rules', JSON.stringify(updatedRules));
  };

  const toggleRuleChannel = (id: string, channel: AlertChannel) => {
    const updatedRules = alertRules.map(rule => {
      if (rule.id === id) {
        const channels = rule.channels.includes(channel)
          ? rule.channels.filter(c => c !== channel)
          : [...rule.channels, channel];
        return { ...rule, channels };
      }
      return rule;
    });
    setAlertRules(updatedRules);
    localStorage.setItem('alert_rules', JSON.stringify(updatedRules));
  };

  const getChannelIcon = (channel: AlertChannel) => {
    switch (channel) {
      case 'telegram': return <Send className="w-4 h-4" />;
      case 'slack': return <Hash className="w-4 h-4" />;
      case 'discord': return <MessageSquare className="w-4 h-4" />;
      case 'email': return <Mail className="w-4 h-4" />;
      case 'webhook': return <Settings className="w-4 h-4" />;
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
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'rules'
              ? 'border-b-2 border-orange-500 text-orange-500'
              : `${textSecondary} hover:text-gray-300`
          }`}
        >
          <Bell className="w-4 h-4 inline mr-2" />
          Alert Rules ({alertRules.length})
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
          History ({alertHistory.length})
        </button>
      </div>

      {/* Channels Tab */}
      {activeTab === 'channels' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Channel Selector */}
          <div className="space-y-2">
            {(['telegram', 'slack', 'discord', 'email', 'webhook'] as AlertChannel[]).map((channel) => (
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
                  {getChannelIcon(activeChannel)}
                  {activeChannel} Configuration
                </h3>
                <button
                  onClick={() => {
                    const updated = { ...channelConfig };
                    updated[activeChannel].enabled = !updated[activeChannel].enabled;
                    setChannelConfig(updated);
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
                      onChange={(e) => setChannelConfig({
                        ...channelConfig,
                        telegram: { ...channelConfig.telegram, botToken: e.target.value }
                      })}
                      placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                      className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
                    />
                    <p className={`text-sm ${textSecondary} mt-1`}>Get from @BotFather</p>
                  </div>
                  <div>
                    <label className={`block font-medium ${textPrimary} mb-2`}>Chat ID</label>
                    <input
                      type="text"
                      value={channelConfig.telegram.chatId}
                      onChange={(e) => setChannelConfig({
                        ...channelConfig,
                        telegram: { ...channelConfig.telegram, chatId: e.target.value }
                      })}
                      placeholder="-1001234567890"
                      className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
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
                      onChange={(e) => setChannelConfig({
                        ...channelConfig,
                        slack: { ...channelConfig.slack, webhookUrl: e.target.value }
                      })}
                      placeholder="https://hooks.slack.com/services/..."
                      className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
                    />
                  </div>
                  <div>
                    <label className={`block font-medium ${textPrimary} mb-2`}>Channel</label>
                    <input
                      type="text"
                      value={channelConfig.slack.channel}
                      onChange={(e) => setChannelConfig({
                        ...channelConfig,
                        slack: { ...channelConfig.slack, channel: e.target.value }
                      })}
                      placeholder="#general"
                      className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
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
                      onChange={(e) => setChannelConfig({
                        ...channelConfig,
                        discord: { ...channelConfig.discord, webhookUrl: e.target.value }
                      })}
                      placeholder="https://discord.com/api/webhooks/..."
                      className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
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
                        onChange={(e) => setChannelConfig({
                          ...channelConfig,
                          email: { ...channelConfig.email, smtpHost: e.target.value }
                        })}
                        placeholder="smtp.gmail.com"
                        className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
                      />
                    </div>
                    <div>
                      <label className={`block font-medium ${textPrimary} mb-2`}>SMTP Port</label>
                      <input
                        type="text"
                        value={channelConfig.email.smtpPort}
                        onChange={(e) => setChannelConfig({
                          ...channelConfig,
                          email: { ...channelConfig.email, smtpPort: e.target.value }
                        })}
                        placeholder="587"
                        className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={`block font-medium ${textPrimary} mb-2`}>From Email</label>
                    <input
                      type="email"
                      value={channelConfig.email.from}
                      onChange={(e) => setChannelConfig({
                        ...channelConfig,
                        email: { ...channelConfig.email, from: e.target.value }
                      })}
                      placeholder="alerts@example.com"
                      className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
                    />
                  </div>
                  <div>
                    <label className={`block font-medium ${textPrimary} mb-2`}>To Email</label>
                    <input
                      type="email"
                      value={channelConfig.email.to}
                      onChange={(e) => setChannelConfig({
                        ...channelConfig,
                        email: { ...channelConfig.email, to: e.target.value }
                      })}
                      placeholder="team@example.com"
                      className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
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
                      onChange={(e) => setChannelConfig({
                        ...channelConfig,
                        webhook: { ...channelConfig.webhook, url: e.target.value }
                      })}
                      placeholder="https://your-api.com/webhook"
                      className={`w-full px-3 py-2 border rounded-lg transition-colors ${input} focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500`}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={saveChannelConfig}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Save Configuration
                </button>
                <button
                  onClick={() => testChannel(activeChannel)}
                  disabled={!channelConfig[activeChannel].enabled || testing}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <TestTube className="w-4 h-4" />
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alert Rules Tab */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={addAlertRule}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Alert Rule
            </button>
          </div>

          {alertRules.length === 0 ? (
            <div className={`${card} p-12 text-center`}>
              <Bell className={`w-16 h-16 mx-auto ${textSecondary} mb-4`} />
              <h3 className={`text-lg font-semibold ${textPrimary} mb-2`}>No Alert Rules</h3>
              <p className={`${textSecondary} mb-4`}>
                Create alert rules to get notified about pipeline events
              </p>
              <button
                onClick={addAlertRule}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                Add Alert Rule
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {alertRules.map((rule) => (
                <div key={rule.id} className={`${card} p-4`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className={`font-semibold ${textPrimary}`}>{rule.name}</h3>
                        <span className={`text-xs px-2 py-1 rounded ${
                          rule.enabled ? 'bg-green-500/20 text-green-500' : 'bg-gray-500/20 text-gray-500'
                        }`}>
                          {rule.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      <p className={`text-sm ${textSecondary}`}>
                        Project: {rule.projectName}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleRule(rule.id)}
                        className={`p-2 rounded hover:bg-gray-700 transition-colors ${textSecondary}`}
                      >
                        {rule.enabled ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => deleteAlertRule(rule.id)}
                        className={`p-2 rounded hover:bg-gray-700 transition-colors ${textSecondary}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Events */}
                  <div className="mb-3">
                    <label className={`text-sm font-medium ${textPrimary} mb-2 block`}>Events</label>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => toggleRuleEvent(rule.id, 'success')}
                        className={`px-3 py-1 text-sm rounded transition-colors ${
                          rule.events.success ? 'bg-green-500 text-white' : 'bg-gray-600 text-gray-300'
                        }`}
                      >
                        ✅ Success
                      </button>
                      <button
                        onClick={() => toggleRuleEvent(rule.id, 'failed')}
                        className={`px-3 py-1 text-sm rounded transition-colors ${
                          rule.events.failed ? 'bg-red-500 text-white' : 'bg-gray-600 text-gray-300'
                        }`}
                      >
                        ❌ Failed
                      </button>
                      <button
                        onClick={() => toggleRuleEvent(rule.id, 'running')}
                        className={`px-3 py-1 text-sm rounded transition-colors ${
                          rule.events.running ? 'bg-blue-500 text-white' : 'bg-gray-600 text-gray-300'
                        }`}
                      >
                        🏃 Running
                      </button>
                      <button
                        onClick={() => toggleRuleEvent(rule.id, 'canceled')}
                        className={`px-3 py-1 text-sm rounded transition-colors ${
                          rule.events.canceled ? 'bg-gray-500 text-white' : 'bg-gray-600 text-gray-300'
                        }`}
                      >
                        🚫 Canceled
                      </button>
                    </div>
                  </div>

                  {/* Channels */}
                  <div>
                    <label className={`text-sm font-medium ${textPrimary} mb-2 block`}>Notification Channels</label>
                    <div className="flex gap-2 flex-wrap">
                      {(['telegram', 'slack', 'discord', 'email', 'webhook'] as AlertChannel[]).map((channel) => (
                        <button
                          key={channel}
                          onClick={() => toggleRuleChannel(rule.id, channel)}
                          disabled={!channelConfig[channel].enabled}
                          className={`px-3 py-1 text-sm rounded transition-colors flex items-center gap-1 ${
                            rule.channels.includes(channel)
                              ? `${getChannelColor(channel)} text-white`
                              : 'bg-gray-600 text-gray-300'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {getChannelIcon(channel)}
                          <span className="capitalize">{channel}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className={`${card} p-6`}>
          {alertHistory.length === 0 ? (
            <div className="text-center py-12">
              <History className={`w-16 h-16 mx-auto ${textSecondary} mb-4`} />
              <h3 className={`text-lg font-semibold ${textPrimary} mb-2`}>No Alert History</h3>
              <p className={`${textSecondary}`}>
                Alert history will appear here once notifications are sent
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {alertHistory.map((alert) => (
                <div key={alert.id} className="p-3 bg-gray-700/50 rounded-lg flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-medium ${textPrimary}`}>{alert.projectName}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${getChannelColor(alert.channel)} text-white`}>
                        {alert.channel}
                      </span>
                      <span className={`text-xs ${textSecondary}`}>
                        #{alert.pipelineId}
                      </span>
                    </div>
                    <p className={`text-sm ${textSecondary}`}>{alert.message}</p>
                  </div>
                  <span className={`text-xs ${textSecondary} ml-4`}>
                    {new Date(alert.timestamp).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
