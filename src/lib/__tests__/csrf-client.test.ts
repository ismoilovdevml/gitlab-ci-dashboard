/**
 * @jest-environment node
 */
import {
  clearCsrfToken,
  csrfFetch,
  getCsrfToken,
  withCsrf,
  CSRF_HEADER,
} from '../api/csrf-client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

let issued = 0;
function tokenResponse(): Response {
  issued += 1;
  return jsonResponse(200, { csrfToken: `token-${issued}`, expiresIn: 3600000 });
}

function apiCalls() {
  return mockFetch.mock.calls.filter(([url]) => url !== '/api/csrf');
}

describe('csrf-client', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearCsrfToken();
    issued = 0;
  });

  it('caches the token between calls and shares an in-flight request', async () => {
    mockFetch.mockImplementation(async () => tokenResponse());

    const [a, b] = await Promise.all([getCsrfToken(), getCsrfToken()]);
    const c = await getCsrfToken();

    expect(a).toBe('token-1');
    expect(b).toBe('token-1');
    expect(c).toBe('token-1');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('refetches after clearCsrfToken', async () => {
    mockFetch.mockImplementation(async () => tokenResponse());

    await getCsrfToken();
    clearCsrfToken();

    expect(await getCsrfToken()).toBe('token-2');
  });

  it('throws when no token can be obtained (e.g. no session)', async () => {
    mockFetch.mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }));

    await expect(getCsrfToken()).rejects.toThrow('401');
  });

  it('csrfFetch leaves GET requests untouched', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, []));

    await csrfFetch('/api/history');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/history', {});
  });

  it('csrfFetch attaches the token to mutating requests and keeps caller headers', async () => {
    mockFetch.mockImplementation(async (url: string) =>
      url === '/api/csrf' ? tokenResponse() : jsonResponse(200, { ok: true })
    );

    await csrfFetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    const [[, init]] = apiCalls();
    const headers = init.headers as Headers;
    expect(headers.get(CSRF_HEADER)).toBe('token-1');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('csrfFetch retries once with a fresh token after a CSRF rejection', async () => {
    let apiAttempts = 0;
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/csrf') return tokenResponse();
      apiAttempts += 1;
      return apiAttempts === 1
        ? jsonResponse(403, { error: 'Invalid CSRF token', code: 'CSRF_TOKEN_INVALID' })
        : jsonResponse(200, { ok: true });
    });

    const res = await csrfFetch('/api/history', { method: 'DELETE' });

    expect(res.status).toBe(200);
    const calls = apiCalls();
    expect(calls).toHaveLength(2);
    expect((calls[1][1].headers as Headers).get(CSRF_HEADER)).toBe('token-2');
  });

  it('csrfFetch does not retry non-CSRF 403 responses', async () => {
    mockFetch.mockImplementation(async (url: string) =>
      url === '/api/csrf' ? tokenResponse() : jsonResponse(403, { error: 'Forbidden' })
    );

    const res = await csrfFetch('/api/history', { method: 'DELETE' });

    expect(res.status).toBe(403);
    expect(apiCalls()).toHaveLength(1);
  });

  it('withCsrf passes headers and retries once on an axios-style CSRF rejection', async () => {
    mockFetch.mockImplementation(async () => tokenResponse());
    const request = jest
      .fn()
      .mockRejectedValueOnce({ response: { status: 403, data: { code: 'CSRF_TOKEN_INVALID' } } })
      .mockResolvedValueOnce('ok');

    await expect(withCsrf(request)).resolves.toBe('ok');
    expect(request).toHaveBeenNthCalledWith(1, { [CSRF_HEADER]: 'token-1' });
    expect(request).toHaveBeenNthCalledWith(2, { [CSRF_HEADER]: 'token-2' });
  });

  it('withCsrf rethrows other errors without retrying', async () => {
    mockFetch.mockImplementation(async () => tokenResponse());
    const error = { response: { status: 401, data: { error: 'Unauthorized' } } };
    const request = jest.fn().mockRejectedValue(error);

    await expect(withCsrf(request)).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
