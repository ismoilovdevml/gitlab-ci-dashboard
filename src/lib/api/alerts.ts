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

  async test(channel: AlertChannel) {
    const res = await fetch('/api/channels/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel }),
    });
    if (!res.ok) throw new Error(`Failed to test ${channel}`);
    return res.json();
  },

  async upsert(type: AlertChannel, enabled: boolean, config: unknown) {
    return channelsApi.save(type, enabled, config);
  },
};

// History API
export const historyApi = {
  async getRecent(limit = 50): Promise<AlertHistory[]> {
    const res = await fetch(`/api/history?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch history');
    const data = await res.json();
    return data.data || data;
  },

  async getAll(limit = 50, cursor?: string): Promise<{
    data: AlertHistory[];
    pagination: {
      hasMore: boolean;
      nextCursor: string | null;
      limit: number;
    };
  }> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (cursor) params.append('cursor', cursor);

    const res = await fetch(`/api/history?${params}`);
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

  async delete(id: string) {
    const res = await fetch(`/api/history?id=${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete history item');
    return res.json();
  },

  async clear() {
    const res = await fetch('/api/history', {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to clear history');
    return res.json();
  },
};
