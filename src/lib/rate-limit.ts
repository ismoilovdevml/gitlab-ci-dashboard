import { Redis } from 'ioredis';

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

export interface RateLimitOptions {
  limit?: number;
  window?: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

/**
 * Redis-based rate limiting
 * @param identifier - Unique identifier (IP address, user ID, etc.)
 * @param options - Rate limit options
 * @returns Rate limit result
 */
export async function rateLimit(
  identifier: string,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const { limit = 5, window = 60 } = options;
  const key = `rate_limit:${identifier}`;

  try {
    const client = getRedis();
    const current = await client.incr(key);

    // Set expiry on first request
    if (current === 1) {
      await client.expire(key, window);
    }

    const ttl = await client.ttl(key);
    const remaining = Math.max(0, limit - current);

    return {
      success: current <= limit,
      remaining,
      reset: Date.now() + ttl * 1000,
    };
  } catch (error) {
    console.error('Rate limit error:', error);
    // Fail open: allow request if Redis is down
    return {
      success: true,
      remaining: limit,
      reset: Date.now() + window * 1000,
    };
  }
}

/**
 * Check if identifier is rate limited
 */
export async function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = {}
): Promise<boolean> {
  const result = await rateLimit(identifier, options);
  return result.success;
}

/**
 * Reset rate limit for identifier
 */
export async function resetRateLimit(identifier: string): Promise<void> {
  const key = `rate_limit:${identifier}`;
  try {
    const client = getRedis();
    await client.del(key);
  } catch (error) {
    console.error('Reset rate limit error:', error);
  }
}

/**
 * Get current rate limit status
 */
export async function getRateLimitStatus(
  identifier: string,
  limit: number = 5
): Promise<RateLimitResult> {
  const key = `rate_limit:${identifier}`;
  try {
    const client = getRedis();
    const current = await client.get(key);
    const ttl = await client.ttl(key);

    const count = current ? parseInt(current, 10) : 0;
    const remaining = Math.max(0, limit - count);

    return {
      success: count < limit,
      remaining,
      reset: Date.now() + (ttl > 0 ? ttl * 1000 : 0),
    };
  } catch (error) {
    console.error('Get rate limit status error:', error);
    return {
      success: true,
      remaining: limit,
      reset: Date.now(),
    };
  }
}
