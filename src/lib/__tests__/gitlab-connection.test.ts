/**
 * @jest-environment node
 */
import http from 'http';
import { AddressInfo } from 'net';
import { testGitLabConnection } from '@/lib/gitlab/token';

jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const TOKEN = 'glpat-secret-token';

function startServer(handler: http.RequestListener) {
  const tokens: Array<string | undefined> = [];
  const server = http.createServer((req, res) => {
    tokens.push(req.headers['private-token'] as string | undefined);
    handler(req, res);
  });
  return new Promise<{ url: string; tokens: typeof tokens; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        tokens,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

describe('testGitLabConnection', () => {
  it.each(['', 'not a url', 'file:///etc/passwd', 'https://u:p@gitlab.example.com'])(
    'rejects invalid URL %p without making a request',
    async (url) => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch');
      const result = await testGitLabConnection(url, TOKEN);
      expect(result.success).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    }
  );

  it('does not follow a cross-origin redirect', async () => {
    const attacker = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ username: 'attacker' }));
    });
    const gitlab = await startServer((req, res) => {
      res.writeHead(302, { location: `${attacker.url}${req.url}` });
      res.end();
    });

    try {
      const result = await testGitLabConnection(gitlab.url, TOKEN);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/redirect/i);
      expect(gitlab.tokens).toEqual([TOKEN]);
      expect(attacker.tokens).toHaveLength(0);
    } finally {
      await attacker.close();
      await gitlab.close();
    }
  });

  it('succeeds against the normalised URL', async () => {
    const paths: string[] = [];
    const gitlab = await startServer((req, res) => {
      paths.push(req.url ?? '');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ username: 'root' }));
    });

    try {
      const result = await testGitLabConnection(`  ${gitlab.url}/gitlab/ `, TOKEN);
      expect(result).toEqual({ success: true, username: 'root' });
      expect(paths).toEqual(['/gitlab/api/v4/user']);
    } finally {
      await gitlab.close();
    }
  });
});
