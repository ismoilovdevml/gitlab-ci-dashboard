import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

const getRedisURL = (): string => {
  // Use REDIS_URL if provided
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  // Construct from individual env vars
  const password = process.env.REDIS_PASSWORD;
  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT;

  // In production RUNTIME (not build time), require env vars
  // Skip check during build (NEXT_PHASE === 'phase-production-build')
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    if (!password || !host || !port) {
      console.warn(
        'Redis configuration missing. Set REDIS_URL or REDIS_PASSWORD, REDIS_HOST, REDIS_PORT environment variables.'
      );
    }
  }

  // Development fallback values
  const finalPassword = password || 'redis_2024';
  const finalHost = host || 'localhost';
  const finalPort = port || '6379';

  return `redis://:${finalPassword}@${finalHost}:${finalPort}`;
};

const createRedisClient = () => {
  // During build phase, create a dummy client that won't connect
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return new Redis(getRedisURL(), {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: () => null,
      reconnectOnError: () => false,
    });
  }

  // Runtime: create a real connected client
  return new Redis(getRedisURL(), {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 100, 2000);
    },
  });
};

export const redis = globalForRedis.redis ?? createRedisClient();

// Suppress error events during build
redis.on('error', () => {
  // Silently ignore errors during build
});

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;

// Helper functions for caching
export const cacheHelpers = {
  /**
   * Get cached value or fetch and cache it
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 30
  ): Promise<T> {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }

    const data = await fetcher();
    await redis.setex(key, ttl, JSON.stringify(data));
    return data;
  },

  /**
   * Invalidate cache by pattern
   */
  async invalidate(pattern: string): Promise<number> {
    const keys = await redis.keys(pattern);
    if (keys.length === 0) return 0;
    return await redis.del(...keys);
  },

  /**
   * Set cache with TTL
   */
  async set(key: string, value: unknown, ttl: number = 30): Promise<void> {
    await redis.setex(key, ttl, JSON.stringify(value));
  },

  /**
   * Get cache
   */
  async get<T>(key: string): Promise<T | null> {
    const cached = await redis.get(key);
    return cached ? (JSON.parse(cached) as T) : null;
  },
};

export default redis;
