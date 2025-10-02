/**
 * API Response Caching Utility
 * Implements in-memory caching with TTL (Time To Live) support
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

class APICache {
  private cache: Map<string, CacheEntry<unknown>>
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    this.cache = new Map()
    this.startCleanup()
  }

  /**
   * Start periodic cleanup of expired cache entries
   */
  private startCleanup() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 5 * 60 * 1000)
  }

  /**
   * Generate cache key from URL and params
   */
  private generateKey(url: string, params?: Record<string, unknown>): string {
    const paramStr = params ? JSON.stringify(params) : ''
    return `${url}:${paramStr}`
  }

  /**
   * Get cached data if not expired
   */
  get<T>(url: string, params?: Record<string, unknown>): T | null {
    const key = this.generateKey(url, params)
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    const now = Date.now()
    const isExpired = now - entry.timestamp > entry.ttl

    if (isExpired) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  /**
   * Set cache data with TTL (in milliseconds)
   */
  set<T>(url: string, data: T, ttl: number = 60000, params?: Record<string, unknown>): void {
    const key = this.generateKey(url, params)
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    })
  }

  /**
   * Check if cache entry exists and is not expired
   */
  has(url: string, params?: Record<string, unknown>): boolean {
    return this.get(url, params) !== null
  }

  /**
   * Clear specific cache entry
   */
  delete(url: string, params?: Record<string, unknown>): boolean {
    const key = this.generateKey(url, params)
    return this.cache.delete(key)
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Remove expired entries
   */
  cleanup(): void {
    const now = Date.now()
    const keysToDelete: string[] = []

    this.cache.forEach((entry, key) => {
      const isExpired = now - entry.timestamp > entry.ttl
      if (isExpired) {
        keysToDelete.push(key)
      }
    })

    keysToDelete.forEach(key => this.cache.delete(key))

    if (keysToDelete.length > 0) {
      console.log(`Cleaned up ${keysToDelete.length} expired cache entries`)
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    }
  }

  /**
   * Destroy cache and cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.clear()
  }
}

// Singleton instance
let cacheInstance: APICache | null = null

export function getCache(): APICache {
  if (!cacheInstance) {
    cacheInstance = new APICache()
  }
  return cacheInstance
}

// Cache TTL presets (in milliseconds)
export const CacheTTL = {
  SHORT: 30 * 1000,        // 30 seconds
  MEDIUM: 2 * 60 * 1000,   // 2 minutes
  LONG: 5 * 60 * 1000,     // 5 minutes
  VERY_LONG: 15 * 60 * 1000 // 15 minutes
}

/**
 * Wrapper function for caching async API calls
 */
export async function cachedFetch<T>(
  url: string,
  fetcher: () => Promise<T>,
  ttl: number = CacheTTL.MEDIUM,
  params?: Record<string, unknown>
): Promise<T> {
  const cache = getCache()

  // Try to get from cache first
  const cached = cache.get<T>(url, params)
  if (cached !== null) {
    return cached
  }

  // If not in cache, fetch and cache the result
  try {
    const data = await fetcher()
    cache.set(url, data, ttl, params)
    return data
  } catch (error) {
    throw error
  }
}

/**
 * Cache invalidation utility
 */
export function invalidateCache(pattern?: string): void {
  const cache = getCache()

  if (!pattern) {
    // Clear all cache
    cache.clear()
    return
  }

  // Clear specific pattern
  const stats = cache.getStats()
  stats.entries.forEach(key => {
    if (key.includes(pattern)) {
      const [url] = key.split(':')
      cache.delete(url)
    }
  })
}
