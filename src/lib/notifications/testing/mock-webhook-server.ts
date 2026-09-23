import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';

export interface ReceivedRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface MockWebhookServer {
  url: (path?: string) => string;
  requests: ReceivedRequest[];
  /** Status (and optional Location header) for the next responses. */
  respondWith: (status: number, location?: string) => void;
  close: () => Promise<void>;
}

/** A local HTTP server standing in for Slack/Discord incoming webhooks. */
export async function startMockWebhookServer(): Promise<MockWebhookServer> {
  const requests: ReceivedRequest[] = [];
  let status = 200;
  let location: string | undefined;

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      let body: unknown = raw;
      try {
        body = JSON.parse(raw);
      } catch {
        // keep the raw text
      }
      requests.push({ method: req.method ?? '', path: req.url ?? '', headers: req.headers, body });
      res.statusCode = status;
      if (location) res.setHeader('Location', location);
      res.end(status < 300 ? 'ok' : 'error');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: (path = '/hook') => `http://127.0.0.1:${port}${path}`,
    requests,
    respondWith: (nextStatus, nextLocation) => {
      status = nextStatus;
      location = nextLocation;
    },
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
