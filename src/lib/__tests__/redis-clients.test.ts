/**
 * @jest-environment node
 */
type RetryStrategy = (times: number) => number | null;

const mockClient = {
  get: jest.fn(),
  setex: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
};
const mockRedisCtor = jest.fn();

jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation((...args: unknown[]) => {
    mockRedisCtor(...args);
    return mockClient;
  }),
}));

jest.mock('../logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const REDIS_URL = 'redis://:secret@localhost:6379';

// Each module keeps a lazily created client singleton; reload them per test.
async function loadModules() {
  jest.resetModules();
  const cache = await import('../cache');
  const rateLimit = await import('../rate-limit');
  return { cache, rateLimit };
}

function retryStrategyOf(call: number): RetryStrategy {
  const options = mockRedisCtor.mock.calls[call][1] as { retryStrategy: RetryStrategy };
  return options.retryStrategy;
}

describe('cache and rate-limit Redis clients', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REDIS_URL = REDIS_URL;
  });

  it('use a linear reconnect backoff capped at 2s', async () => {
    const { cache, rateLimit } = await loadModules();
    mockClient.get.mockResolvedValue(null);
    mockClient.incr.mockResolvedValue(2);
    mockClient.ttl.mockResolvedValue(30);

    await cache.getCache('k');
    await rateLimit.rateLimit('ip');

    expect(mockRedisCtor).toHaveBeenCalledTimes(2);
    for (const call of [0, 1]) {
      expect(mockRedisCtor.mock.calls[call][0]).toBe(REDIS_URL);
      const strategy = retryStrategyOf(call);
      expect([1, 2, 10, 40, 100].map(strategy)).toEqual([50, 100, 500, 2000, 2000]);
    }
  });

  it('rateLimit fails closed when Redis rejects', async () => {
    const { rateLimit } = await loadModules();
    mockClient.incr.mockRejectedValue(new Error('Reached the max retries per request limit'));

    const result = await rateLimit.rateLimit('ip', { limit: 5, window: 60 });

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('cacheWithTTL falls back to the loader when Redis rejects', async () => {
    const { cache } = await loadModules();
    mockClient.get.mockRejectedValue(new Error('Connection is closed.'));
    const loader = jest.fn().mockResolvedValue('fresh');

    await expect(cache.cacheWithTTL('k', loader)).resolves.toBe('fresh');
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
