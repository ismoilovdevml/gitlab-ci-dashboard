/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import axios from 'axios';
import { GET } from '../route';
import { getCurrentUser } from '@/lib/auth';
import { encryptToken } from '@/lib/gitlab/token';

jest.mock('axios', () => {
  const actual = jest.requireActual('axios');
  return {
    __esModule: true,
    default: { get: jest.fn(), isAxiosError: actual.isAxiosError },
  };
});

jest.mock('@/lib/auth', () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const mockGet = axios.get as jest.Mock;
const mockUser = getCurrentUser as jest.Mock;

const GITLAB = 'https://gitlab.example.com';
const ARTIFACT_URL = `${GITLAB}/api/v4/projects/1/jobs/2/artifacts`;

function req(query = 'projectId=1&jobId=2') {
  return new NextRequest(`http://localhost/api/artifacts/download?${query}`);
}

function user(overrides: Record<string, unknown> = {}) {
  return { id: 'u1', gitlabUrl: GITLAB, gitlabToken: 'plain-token', ...overrides };
}

function ok(body = 'zipdata') {
  return { status: 200, headers: {}, data: Buffer.from(body) };
}

function redirect(location: string) {
  return { status: 302, headers: { location }, data: Buffer.alloc(0) };
}

describe('GET /api/artifacts/download', () => {
  const originalKey = process.env.TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.TOKEN_ENCRYPTION_KEY;
    mockUser.mockResolvedValue(user());
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = originalKey;
  });

  it('rejects invalid ids', async () => {
    const res = await GET(req('projectId=1&jobId=abc'));
    expect(res.status).toBe(400);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('returns 401 without a user', async () => {
    mockUser.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it.each([
    'file:///etc/passwd',
    'ftp://gitlab.example.com',
    'https://user:pass@gitlab.example.com',
  ])('rejects configured GitLab URL %s without calling out', async (gitlabUrl) => {
    mockUser.mockResolvedValue(user({ gitlabUrl }));
    const res = await GET(req());
    expect(res.status).toBe(400);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('downloads from the configured host with redirects disabled', async () => {
    mockGet.mockResolvedValueOnce(ok('zipdata'));
    const res = await GET(req('projectId=1&jobId=2&filename=../../evil name.zip'));

    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('zipdata');
    expect(res.headers.get('content-length')).toBe('7');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename=".._.._evil_name.zip"');

    expect(mockGet).toHaveBeenCalledTimes(1);
    const [url, config] = mockGet.mock.calls[0];
    expect(url).toBe(ARTIFACT_URL);
    expect(config.maxRedirects).toBe(0);
    expect(config.headers).toEqual({ 'PRIVATE-TOKEN': 'plain-token' });
  });

  it('normalises a trailing slash in the configured URL', async () => {
    mockUser.mockResolvedValue(user({ gitlabUrl: `${GITLAB}/` }));
    mockGet.mockResolvedValueOnce(ok());
    await GET(req());
    expect(mockGet.mock.calls[0][0]).toBe(ARTIFACT_URL);
  });

  it('decrypts an encrypted token before sending it', async () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'test-key-for-artifact-download';
    const stored = encryptToken('secret-glpat');
    expect(stored.startsWith('tok:')).toBe(true);
    mockUser.mockResolvedValue(user({ gitlabToken: stored }));
    mockGet.mockResolvedValueOnce(ok());

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mockGet.mock.calls[0][1].headers).toEqual({ 'PRIVATE-TOKEN': 'secret-glpat' });
  });

  it('returns 500 when an encrypted token cannot be decrypted', async () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'key-a';
    const stored = encryptToken('secret');
    process.env.TOKEN_ENCRYPTION_KEY = 'key-b';
    mockUser.mockResolvedValue(user({ gitlabToken: stored }));

    const res = await GET(req());
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe('GITLAB_TOKEN_UNREADABLE');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it.each([
    ['token', { gitlabToken: '' }],
    ['URL', { gitlabUrl: '' }],
  ])('returns 409 when the GitLab %s is not configured', async (_what, overrides) => {
    mockUser.mockResolvedValue(user(overrides));
    const res = await GET(req());
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('GITLAB_NOT_CONFIGURED');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('follows a same-host redirect and keeps the token', async () => {
    mockGet
      .mockResolvedValueOnce(redirect('/api/v4/projects/1/jobs/2/artifacts/final'))
      .mockResolvedValueOnce(ok());

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet.mock.calls[1][0]).toBe(`${ARTIFACT_URL}/final`);
    expect(mockGet.mock.calls[1][1].headers).toEqual({ 'PRIVATE-TOKEN': 'plain-token' });
  });

  it('does not forward the token on a cross-host redirect (object storage)', async () => {
    const storage = 'https://storage.example.net/bucket/artifacts.zip?X-Amz-Signature=abc';
    mockGet.mockResolvedValueOnce(redirect(storage)).mockResolvedValueOnce(ok());

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mockGet.mock.calls[1][0]).toBe(storage);
    expect(mockGet.mock.calls[1][1].headers).toEqual({});
    expect(mockGet.mock.calls[1][1].maxRedirects).toBe(0);
  });

  it('does not forward the token on a scheme downgrade to the same host', async () => {
    mockGet
      .mockResolvedValueOnce(redirect('http://gitlab.example.com/api/v4/projects/1/jobs/2/artifacts'))
      .mockResolvedValueOnce(ok());

    await GET(req());
    expect(mockGet.mock.calls[1][1].headers).toEqual({});
  });

  it('does not re-attach the token when a foreign host redirects back', async () => {
    mockGet
      .mockResolvedValueOnce(redirect('https://evil.example.org/x'))
      .mockResolvedValueOnce(ok());
    await GET(req());
    for (const call of mockGet.mock.calls.slice(1)) {
      expect(JSON.stringify(call[1].headers)).not.toContain('plain-token');
    }
  });

  it('refuses redirects to non-http schemes', async () => {
    mockGet.mockResolvedValueOnce(redirect('file:///etc/passwd'));
    const res = await GET(req());
    expect(res.status).toBe(502);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('stops after too many redirects', async () => {
    mockGet.mockResolvedValue(redirect('/loop'));
    const res = await GET(req());
    expect(res.status).toBe(502);
    expect(mockGet).toHaveBeenCalledTimes(4);
  });

  it('returns 502 for a redirect without a location', async () => {
    mockGet.mockResolvedValueOnce({ status: 302, headers: {}, data: Buffer.alloc(0) });
    const res = await GET(req());
    expect(res.status).toBe(502);
  });

  it('maps GitLab 404 without leaking upstream details', async () => {
    const err = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      response: { status: 404, data: { message: 'internal detail' } },
      config: { headers: { 'PRIVATE-TOKEN': 'plain-token' } },
    });
    mockGet.mockRejectedValueOnce(err);
    const res = await GET(req());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Artifact not found');
  });

  it('returns 502 on network errors', async () => {
    mockGet.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await GET(req());
    expect(res.status).toBe(502);
  });
});
