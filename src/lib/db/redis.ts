import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL || 'redis://:redis_2024@localhost:6379', {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    reconnectOnError: (err) => {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        return true; // or `return 1;`
      }
      return false;
    },
    lazyConnect: true, // Don't connect immediately during build
  });

// Handle connection errors gracefully during build
redis.on('error', (err) => {
  if (process.env.NODE_ENV === 'production' || process.env.NEXT_PHASE === 'phase-production-build') {
    console.warn('Redis connection error (expected during build):', err.message);
  } else {
    console.error('Redis error:', err);
  }
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
