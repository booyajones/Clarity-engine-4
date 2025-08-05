export interface RateLimiterOptions {
  tokensPerInterval: number;
  interval: number; // milliseconds
  fireImmediately?: boolean;
}

export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private readonly interval: number;
  private queue: Array<() => void> = [];

  constructor(options: RateLimiterOptions) {
    this.maxTokens = options.tokensPerInterval;
    this.tokens = options.fireImmediately ? this.maxTokens : 0;
    this.interval = options.interval;
    this.refillRate = this.maxTokens / this.interval;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = Math.floor(timePassed * this.refillRate);
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.tokens + tokensToAdd, this.maxTokens);
      this.lastRefill = now;
    }
  }

  private processQueue(): void {
    while (this.queue.length > 0 && this.tokens > 0) {
      const resolve = this.queue.shift()!;
      this.tokens--;
      resolve();
    }
  }

  async acquire(): Promise<void> {
    this.refill();
    
    if (this.tokens > 0) {
      this.tokens--;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      
      // Schedule periodic checks to process the queue
      const checkInterval = setInterval(() => {
        this.refill();
        this.processQueue();
        
        if (!this.queue.includes(resolve)) {
          clearInterval(checkInterval);
        }
      }, Math.min(100, this.interval / 10));
    });
  }

  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }
}

// Pre-configured rate limiters for different APIs
export const apiRateLimiters = {
  mastercard: new TokenBucketRateLimiter({
    tokensPerInterval: 5,
    interval: 1000, // 5 requests per second
    fireImmediately: true
  }),
  
  openai: new TokenBucketRateLimiter({
    tokensPerInterval: 500,
    interval: 60000, // 500 requests per minute
    fireImmediately: true
  }),
  
  googleMaps: new TokenBucketRateLimiter({
    tokensPerInterval: 50,
    interval: 1000, // 50 requests per second
    fireImmediately: true
  }),
  
  bigQuery: new TokenBucketRateLimiter({
    tokensPerInterval: 100,
    interval: 1000, // 100 requests per second
    fireImmediately: true
  })
};