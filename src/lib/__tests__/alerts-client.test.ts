/**
 * @jest-environment node
 */
import { channelsApi } from '../api/alerts';
import { clearCsrfToken, CSRF_HEADER } from '../api/csrf-client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const mockFetch = jest.fn();

describe('channelsApi.test', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockFetch.mockReset();
    clearCsrfToken();
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockImplementation(async (url: string) =>
      url === '/api/csrf' ? jsonResponse(200, { csrfToken: 'csrf-1', expiresIn: 3600000 }) : jsonResponse(200, { success: true })
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts only the channel type to the server with the CSRF header', async () => {
    await channelsApi.test('slack');

    const calls = mockFetch.mock.calls.filter(([url]) => url !== '/api/csrf');
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0] as [string, RequestInit];
    expect(url).toBe('/api/channels/test');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ type: 'slack' });
    expect(new Headers(init.headers).get(CSRF_HEADER)).toBe('csrf-1');
  });

  it("throws the server's error message", async () => {
    mockFetch.mockImplementation(async (url: string) =>
      url === '/api/csrf'
        ? jsonResponse(200, { csrfToken: 'csrf-1', expiresIn: 3600000 })
        : jsonResponse(502, { error: 'Could not deliver the test message to slack: Slack webhook failed (HTTP 404)' })
    );

    await expect(channelsApi.test('slack')).rejects.toThrow(
      'Could not deliver the test message to slack: Slack webhook failed (HTTP 404)'
    );
  });

  it('falls back to a generic message when the body is not JSON', async () => {
    mockFetch.mockImplementation(async (url: string) =>
      url === '/api/csrf'
        ? jsonResponse(200, { csrfToken: 'csrf-1', expiresIn: 3600000 })
        : new Response('<html>', { status: 500 })
    );

    await expect(channelsApi.test('discord')).rejects.toThrow('Failed to send the test message');
  });
});
