/**
 * Client-side rate limiter for crawl requests
 */

interface RateLimitConfig {
  requestsPerMinute: number;
  maxConcurrent: number;
}

interface QueuedRequest {
  id: string;
  url: string;
  resolve: () => void;
  addedAt: number;
}

/**
 * Rate limiter for managing crawl request frequency
 */
export class RateLimiter {
  private requestsPerMinute: number;
  private maxConcurrent: number;
  private requestTimestamps: number[] = [];
  private activeRequests = 0;
  private queue: QueuedRequest[] = [];
  private processing = false;

  constructor(config: RateLimitConfig) {
    this.requestsPerMinute = config.requestsPerMinute;
    this.maxConcurrent = config.maxConcurrent;
  }

  /**
   * Acquire permission to make a request
   * Will wait if rate limit or concurrent limit is reached
   */
  async acquire(url: string): Promise<void> {
    return new Promise((resolve) => {
      const request: QueuedRequest = {
        id: Math.random().toString(36).slice(2),
        url,
        resolve,
        addedAt: Date.now(),
      };

      this.queue.push(request);
      this.processQueue();
    });
  }

  /**
   * Release a concurrent request slot
   */
  release(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    this.processQueue();
  }

  /**
   * Process the queue of pending requests
   */
  private processQueue(): void {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      // Check concurrent limit
      if (this.activeRequests >= this.maxConcurrent) {
        break;
      }

      // Clean old timestamps
      this.cleanOldTimestamps();

      // Check rate limit
      if (this.requestTimestamps.length >= this.requestsPerMinute) {
        // Schedule retry
        const oldestTimestamp = this.requestTimestamps[0];
        const waitTime = 60000 - (Date.now() - oldestTimestamp) + 100;

        if (waitTime > 0) {
          setTimeout(() => {
            this.processing = false;
            this.processQueue();
          }, waitTime);
          break;
        }
      }

      // Process next request
      const request = this.queue.shift();
      if (request) {
        this.activeRequests++;
        this.requestTimestamps.push(Date.now());
        request.resolve();
      }
    }

    this.processing = false;
  }

  /**
   * Remove timestamps older than 1 minute
   */
  private cleanOldTimestamps(): void {
    const oneMinuteAgo = Date.now() - 60000;
    while (this.requestTimestamps.length > 0 && this.requestTimestamps[0] < oneMinuteAgo) {
      this.requestTimestamps.shift();
    }
  }

  /**
   * Get current queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Get active request count
   */
  getActiveRequests(): number {
    return this.activeRequests;
  }

  /**
   * Check if rate limited
   */
  isRateLimited(): boolean {
    this.cleanOldTimestamps();
    return this.requestTimestamps.length >= this.requestsPerMinute;
  }

  /**
   * Get time until next available slot (in ms)
   */
  getWaitTime(): number {
    if (!this.isRateLimited()) return 0;

    const oldestTimestamp = this.requestTimestamps[0];
    return Math.max(0, 60000 - (Date.now() - oldestTimestamp));
  }
}

// Default rate limiter instance
let defaultRateLimiter: RateLimiter | null = null;

/**
 * Get or create the default rate limiter
 */
export function getDefaultRateLimiter(): RateLimiter {
  if (!defaultRateLimiter) {
    defaultRateLimiter = new RateLimiter({
      requestsPerMinute: parseInt(process.env.CRAWL_REQUESTS_PER_MINUTE || '30', 10),
      maxConcurrent: parseInt(process.env.CRAWL_MAX_CONCURRENT || '5', 10),
    });
  }
  return defaultRateLimiter;
}

/**
 * Wrapper to rate-limit a function call
 */
export async function rateLimited<T>(
  url: string,
  fn: () => Promise<T>
): Promise<T> {
  const limiter = getDefaultRateLimiter();

  await limiter.acquire(url);

  try {
    return await fn();
  } finally {
    limiter.release();
  }
}
