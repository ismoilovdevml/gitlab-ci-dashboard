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
   * UNLIMITED MODE: Always returns true
   */
  private canMakeRequest(): boolean {
    // UNLIMITED: No rate limiting
    return true
  }

  /**
   * Record a request
   * UNLIMITED MODE: No-op
   */
  private recordRequest(): void {
    // UNLIMITED: No tracking needed
  }

  /**
   * Process the request queue
   * UNLIMITED MODE: Execute all requests in parallel, no waiting
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return
    }

    this.processing = true

    // UNLIMITED: Execute ALL requests in parallel immediately
    const currentQueue = [...this.queue]
    this.queue = []

    // Execute all in parallel without waiting
    await Promise.all(
      currentQueue.map(async (request) => {
        try {
          const result = await request.execute()
          request.resolve(result)
        } catch (error) {
          request.reject(error)
        }
      })
    )

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
