// Browser client for alert channel settings.

import { csrfFetch } from '@/lib/api/csrf-client';

export type AlertChannel = 'telegram' | 'slack' | 'discord' | 'email' | 'webhook';

/** Channels the server can send a test message through. */
export const TESTABLE_CHANNELS: readonly AlertChannel[] = ['telegram', 'slack', 'discord'];

export interface StoredChannel {
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === 'string' ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export const channelsApi = {
  async getAll(): Promise<StoredChannel[]> {
    const res = await fetch('/api/channels');
    if (!res.ok) throw new Error('Failed to fetch channels');
    return res.json();
  },

  async save(type: AlertChannel, enabled: boolean, config: unknown) {
    const res = await csrfFetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, enabled, config }),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to save channel: ${errorText}`);
    }
    return res.json();
  },

  /**
   * Ask the server to send a test message through the saved channel. Only the
   * type is sent; the server reads the stored config, so the browser never
   * contacts the chat service itself.
   */
  async test(type: AlertChannel): Promise<void> {
    const res = await csrfFetch('/api/channels/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });
    if (!res.ok) {
      throw new Error(await errorMessage(res, 'Failed to send the test message'));
    }
  },
};
