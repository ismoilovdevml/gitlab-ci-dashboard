import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

const getRedisURL = (): string => {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  const password = process.env.REDIS_PASSWORD || 'redis_2024';
  const host = process.env.REDIS_HOST || 'localhost';
  const port = process.env.REDIS_PORT || '6379';

  return `redis://:${password}@${host}:${port}`;
};

export const redis =
  globalForRedis.redis ??
  new Redis(getRedisURL(), {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy: () => null, // Don't retry during build
    reconnectOnError: () => false,
  });

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
