/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { getOrgPrisma } from '@/lib/db/scoped-prisma';
import {
  GitLabConfigNotFoundError,
  storeOrgGitLabToken,
  testGitLabConnection,
} from '@/lib/gitlab/token';
import { csrfRequest, TEST_SESSION_SECRET } from '@/lib/testing/csrf';
import { POST } from '../route';

jest.mock('@/lib/db/scoped-prisma', () => ({
  getOrgPrisma: jest.fn(),
}));

jest.mock('@/lib/gitlab/token', () => {
  const actual = jest.requireActual('@/lib/gitlab/token');
  return {
    GitLabConfigNotFoundError: actual.GitLabConfigNotFoundError,
    storeOrgGitLabToken: jest.fn(),
    getOrgGitLabConfigs: jest.fn(),
    deleteOrgGitLabConfig: jest.fn(),
    testGitLabConnection: jest.fn(),
  };
});

const mockGetOrgPrisma = getOrgPrisma as jest.Mock;
const mockStore = storeOrgGitLabToken as jest.Mock;
const mockTest = testGitLabConnection as jest.Mock;

const URL_ = 'http://localhost/api/gitlab';

function post(body: unknown) {
  return POST(csrfRequest(URL_, 'POST', 'valid', body));
}

describe('POST /api/gitlab', () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = TEST_SESSION_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetOrgPrisma.mockResolvedValue({ db: {}, auth: { organizationId: 'org-a' } });
    mockTest.mockResolvedValue({ success: true, username: 'jane' });
    mockStore.mockImplementation(async (opts: { url: string }) => ({
      id: 'cfg-a',
      url: opts.url,
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalises the URL before testing and storing it', async () => {
    const res = await post({ url: '  https://gitlab.example.com/gitlab/  ', token: 'glpat-x' });

    expect(res.status).toBe(200);
    expect(mockTest).toHaveBeenCalledWith('https://gitlab.example.com/gitlab', 'glpat-x');
    expect(mockStore).toHaveBeenCalledWith({
      organizationId: 'org-a',
      url: 'https://gitlab.example.com/gitlab',
      token: 'glpat-x',
      configId: undefined,
    });
    const body = await res.json();
    expect(body.data.url).toBe('https://gitlab.example.com/gitlab');
    expect(JSON.stringify(body)).not.toContain('glpat-x');
  });

  it.each([
    ['missing token', { url: 'https://gitlab.example.com' }],
    ['missing url', { token: 'glpat-x' }],
    ['non-string url', { url: 123, token: 'glpat-x' }],
    ['non-string configId', { url: 'https://gitlab.example.com', token: 'glpat-x', configId: 5 }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(mockTest).not.toHaveBeenCalled();
    expect(mockStore).not.toHaveBeenCalled();
  });

  it.each([
    ['non-http scheme', 'ftp://gitlab.example.com'],
    ['embedded credentials', 'https://user:pass@gitlab.example.com'],
    ['query string', 'https://gitlab.example.com/?x=1'],
    ['not a URL', 'gitlab.example.com'],
  ])('rejects a URL with %s', async (_label, url) => {
    const res = await post({ url, token: 'glpat-x' });

    expect(res.status).toBe(400);
    expect(mockTest).not.toHaveBeenCalled();
    expect(mockStore).not.toHaveBeenCalled();
  });

  it('rejects an invalid JSON body', async () => {
    const { headers } = csrfRequest(URL_, 'POST', 'valid');
    const res = await POST(new NextRequest(URL_, { method: 'POST', headers, body: 'not-json{' }));

    expect(res.status).toBe(400);
    expect(mockStore).not.toHaveBeenCalled();
  });

  it("returns 404 when updating another organization's config", async () => {
    mockStore.mockRejectedValue(new GitLabConfigNotFoundError());

    const res = await post({
      url: 'https://gitlab.example.com',
      token: 'glpat-x',
      configId: 'cfg-b',
    });

    expect(res.status).toBe(404);
    expect(mockStore).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-a', configId: 'cfg-b' })
    );
  });

  it('returns 400 without an organization context', async () => {
    mockGetOrgPrisma.mockResolvedValue({ db: {}, auth: { organizationId: null } });

    const res = await post({ url: 'https://gitlab.example.com', token: 'glpat-x' });

    expect(res.status).toBe(400);
    expect(mockStore).not.toHaveBeenCalled();
  });

  it('returns 422 when the connection test fails', async () => {
    mockTest.mockResolvedValue({ success: false, error: 'Invalid token' });

    const res = await post({ url: 'https://gitlab.example.com', token: 'glpat-x' });

    expect(res.status).toBe(422);
    expect(mockStore).not.toHaveBeenCalled();
  });
});
