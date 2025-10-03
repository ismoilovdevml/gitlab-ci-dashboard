/**
 * API Request Throttling and Rate Limiting
 * Handles GitLab API rate limits and request optimization
 */

interface ThrottleOptions {
  maxRequests: number // Maximum requests per window
  windowMs: number // Time window in milliseconds
  retryAfter?: number // Retry delay in milliseconds
}

interface QueuedRequest {
  id: string
  priority: number // Higher = more important
  execute: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
  timestamp: number
}

class APIThrottler {
  private requestCounts: Map<string, number[]> = new Map()
  private queue: QueuedRequest[] = []
  private processing = false
  private options: ThrottleOptions

  constructor(options: ThrottleOptions) {
    this.options = options
  }

  /**
   * Check if we can make a request without hitting rate limit
   */
  private canMakeRequest(key: string): boolean {
    const now = Date.now()
    const counts = this.requestCounts.get(key) || []

    // Remove old timestamps outside the window
    const validCounts = counts.filter(
      timestamp => now - timestamp < this.options.windowMs
    )

    this.requestCounts.set(key, validCounts)

    return validCounts.length < this.options.maxRequests
  }

  /**
   * Record a request
   */
  private recordRequest(key: string): void {
    const now = Date.now()
    const counts = this.requestCounts.get(key) || []
    counts.push(now)
    this.requestCounts.set(key, counts)
  }

  /**
   * Process the request queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return
    }

    this.processing = true

    while (this.queue.length > 0) {
      // Sort by priority (higher first) and timestamp (older first)
      this.queue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority
        }
        return a.timestamp - b.timestamp
      })

      const request = this.queue[0]

      if (this.canMakeRequest('global')) {
        this.queue.shift() // Remove from queue
        this.recordRequest('global')

        try {
          const result = await request.execute()
          request.resolve(result)
        } catch (error) {
          request.reject(error)
        }
      } else {
        // Wait before trying again
        await new Promise(resolve =>
          setTimeout(resolve, this.options.retryAfter || 1000)
        )
      }
    }

    this.processing = false
  }

  /**
   * Throttle an API request
   */
  async throttle<T>(
    execute: () => Promise<T>,
    priority: number = 5
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: Math.random().toString(36).substring(7),
        priority,
        execute: execute as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        timestamp: Date.now()
      }

      this.queue.push(request)
      this.processQueue()
    })
  }

  /**
   * Get current queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      requestCounts: Object.fromEntries(this.requestCounts)
    }
  }

  /**
   * Clear the queue
   */
  clearQueue() {
    this.queue.forEach(req =>
      req.reject(new Error('Queue cleared'))
    )
    this.queue = []
  }
}

// Singleton instance for GitLab API
// GitLab.com: 300 requests/minute
const gitlabThrottler = new APIThrottler({
  maxRequests: 250, // Conservative limit
  windowMs: 60 * 1000, // 1 minute
  retryAfter: 500 // Wait 500ms before retry
})

export { gitlabThrottler, APIThrottler }

/**
 * Debounce function for search/filter inputs
 */
export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null
      func(...args)
    }

    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(later, wait)
  }
}

/**
 * Batch multiple requests together
 */
export class RequestBatcher<T> {
  private batch: Array<{
    params: unknown
    resolve: (value: T) => void
    reject: (error: unknown) => void
  }> = []
  private timeout: NodeJS.Timeout | null = null
  private batchSize: number
  private waitTime: number

  constructor(batchSize: number = 10, waitTime: number = 100) {
    this.batchSize = batchSize
    this.waitTime = waitTime
  }

  async add(
    params: unknown,
    executor: (params: unknown) => Promise<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.batch.push({ params, resolve, reject })

      if (this.batch.length >= this.batchSize) {
        this.flush(executor)
      } else if (!this.timeout) {
        this.timeout = setTimeout(() => this.flush(executor), this.waitTime)
      }
    })
  }

  private async flush(executor: (params: unknown) => Promise<T>) {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }

    const currentBatch = [...this.batch]
    this.batch = []

    for (const item of currentBatch) {
      try {
        const result = await executor(item.params)
        item.resolve(result)
      } catch (error) {
        item.reject(error)
      }
    }
  }
}
