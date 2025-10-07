import { Redis } from 'ioredis';
import { logger } from './logger';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL is not defined');
    }
    redis = new Redis(redisUrl);
  }
  return redis;
}

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
  tags?: string[];
}

/**
 * Cache with TTL - Smart caching with automatic invalidation
 * @param key - Cache key
 * @param fn - Function to execute if cache miss
 * @param options - Cache options
 * @returns Cached or fresh data
 */
export async function cacheWithTTL<T>(
  key: string,
  fn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const { ttl = 300, prefix = 'cache' } = options; // Default 5 minutes
  const cacheKey = `${prefix}:${key}`;

  try {
    const client = getRedis();

    // Try to get from cache
    const cached = await client.get(cacheKey);

    if (cached) {
      logger.debug('Cache hit', { key: cacheKey });
      return JSON.parse(cached) as T;
    }

    logger.debug('Cache miss', { key: cacheKey });

    // Execute function
    const result = await fn();

    // Store in cache
    await client.setex(cacheKey, ttl, JSON.stringify(result));

    // Store tags for invalidation
    if (options.tags && options.tags.length > 0) {
      for (const tag of options.tags) {
        const tagKey = `${prefix}:tag:${tag}`;
        await client.sadd(tagKey, cacheKey);
        await client.expire(tagKey, ttl);
      }
    }

    return result;
  } catch (error) {
    logger.error('Cache error', { key: cacheKey, error });
    // If cache fails, still return the result
    return await fn();
  }
}

/**
 * Invalidate cache by key
 */
export async function invalidateCache(
  key: string,
  prefix: string = 'cache'
): Promise<void> {
  const cacheKey = `${prefix}:${key}`;

  try {
    const client = getRedis();
    await client.del(cacheKey);
    logger.debug('Cache invalidated', { key: cacheKey });
  } catch (error) {
    logger.error('Cache invalidation error', { key: cacheKey, error });
  }
}

/**
 * Invalidate cache by tag
 */
export async function invalidateCacheByTag(
  tag: string,
  prefix: string = 'cache'
): Promise<void> {
  const tagKey = `${prefix}:tag:${tag}`;

  try {
    const client = getRedis();

    // Get all keys with this tag
    const keys = await client.smembers(tagKey);

    if (keys.length > 0) {
      // Delete all keys
      await client.del(...keys);
      logger.debug('Cache invalidated by tag', { tag, count: keys.length });
    }

    // Delete tag set
    await client.del(tagKey);
  } catch (error) {
    logger.error('Cache tag invalidation error', { tag, error });
  }
}

/**
 * Invalidate cache by pattern
 */
export async function invalidateCacheByPattern(
  pattern: string,
  prefix: string = 'cache'
): Promise<void> {
  const searchPattern = `${prefix}:${pattern}`;

  try {
    const client = getRedis();

    // Scan for matching keys
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, foundKeys] = await client.scan(
        cursor,
        'MATCH',
        searchPattern,
        'COUNT',
        100
      );
      cursor = nextCursor;
      keys.push(...foundKeys);
    } while (cursor !== '0');

    if (keys.length > 0) {
      await client.del(...keys);
      logger.debug('Cache invalidated by pattern', { pattern, count: keys.length });
    }
  } catch (error) {
    logger.error('Cache pattern invalidation error', { pattern, error });
  }
}

/**
 * Clear all cache (use with caution!)
 */
export async function clearAllCache(prefix: string = 'cache'): Promise<void> {
  await invalidateCacheByPattern('*', prefix);
}

/**
 * Get cached value without executing function
 */
export async function getCache<T>(
  key: string,
  prefix: string = 'cache'
): Promise<T | null> {
  const cacheKey = `${prefix}:${key}`;

  try {
    const client = getRedis();
    const cached = await client.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as T;
    }

    return null;
  } catch (error) {
    logger.error('Get cache error', { key: cacheKey, error });
    return null;
  }
}

/**
 * Set cache value directly
 */
export async function setCache<T>(
  key: string,
  value: T,
  ttl: number = 300,
  prefix: string = 'cache'
): Promise<void> {
  const cacheKey = `${prefix}:${key}`;

  try {
    const client = getRedis();
    await client.setex(cacheKey, ttl, JSON.stringify(value));
    logger.debug('Cache set', { key: cacheKey, ttl });
  } catch (error) {
    logger.error('Set cache error', { key: cacheKey, error });
  }
}

/**
 * Check if key exists in cache
 */
export async function hasCache(
  key: string,
  prefix: string = 'cache'
): Promise<boolean> {
  const cacheKey = `${prefix}:${key}`;

  try {
    const client = getRedis();
    const exists = await client.exists(cacheKey);
    return exists === 1;
  } catch (error) {
    logger.error('Check cache error', { key: cacheKey, error });
    return false;
  }
}

/**
 * Get cache TTL
 */
export async function getCacheTTL(
  key: string,
  prefix: string = 'cache'
): Promise<number> {
  const cacheKey = `${prefix}:${key}`;

  try {
    const client = getRedis();
    const ttl = await client.ttl(cacheKey);
    return ttl;
  } catch (error) {
    logger.error('Get cache TTL error', { key: cacheKey, error });
    return -1;
  }
}

/**
 * Memoize function with cache
 */
export function memoize<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: CacheOptions & { keyGenerator?: (...args: Parameters<T>) => string } = {}
): T {
  const { keyGenerator, ...cacheOptions } = options;

  return (async (...args: Parameters<T>) => {
    const key = keyGenerator
      ? keyGenerator(...args)
      : `memoized:${fn.name}:${JSON.stringify(args)}`;

    return cacheWithTTL(key, () => fn(...args), cacheOptions);
  }) as T;
}
