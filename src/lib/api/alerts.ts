// API client for alert management

export interface ChannelConfig {
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

export type AlertChannel = 'telegram' | 'slack' | 'discord' | 'email' | 'webhook';

export interface AlertRule {
  id?: string;
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
  createdAt?: string;
}

export interface AlertHistory {
  id: string;
  timestamp: string;
  projectName: string;
  pipelineId: number;
  status: string;
  message: string;
  channel: AlertChannel;
  sent: boolean;
}

// Channels API
export const channelsApi = {
  async getAll() {
    const res = await fetch('/api/channels');
    if (!res.ok) throw new Error('Failed to fetch channels');
    return res.json();
  },

  async save(type: AlertChannel, enabled: boolean, config: unknown) {
    console.log('[channelsApi.save] Request:', { type, enabled, config });
    const res = await fetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, enabled, config }),
    });
    console.log('[channelsApi.save] Response status:', res.status);
    if (!res.ok) {
      const errorText = await res.text();
      console.error('[channelsApi.save] Error:', errorText);
      throw new Error(`Failed to save channel: ${errorText}`);
    }
    const data = await res.json();
    console.log('[channelsApi.save] Success:', data);
    return data;
  },

  async delete(type: AlertChannel) {
    const res = await fetch(`/api/channels?type=${type}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete channel');
    return res.json();
  },
};

// Rules API
export const rulesApi = {
  async getAll(): Promise<AlertRule[]> {
    const res = await fetch('/api/rules');
    if (!res.ok) throw new Error('Failed to fetch rules');
    return res.json();
  },

  async create(rule: Omit<AlertRule, 'id' | 'createdAt'>) {
    const res = await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    });
    if (!res.ok) throw new Error('Failed to create rule');
    return res.json();
  },

  async update(id: string, data: Partial<AlertRule>) {
    const res = await fetch('/api/rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...data }),
    });
    if (!res.ok) throw new Error('Failed to update rule');
    return res.json();
  },

  async delete(id: string) {
    const res = await fetch(`/api/rules?id=${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete rule');
    return res.json();
  },
};

// History API
export const historyApi = {
  async getAll(limit = 100): Promise<AlertHistory[]> {
    const res = await fetch(`/api/history?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch history');
    return res.json();
  },

  async add(entry: Omit<AlertHistory, 'id' | 'timestamp'>) {
    const res = await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (!res.ok) throw new Error('Failed to add history');
    return res.json();
  },
};
