/**
 * Enterprise Rate Limiting Service
 * Advanced rate limiting with multiple strategies
 */

import { LRUCache } from 'lru-cache';

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string;
  handler?: (req: any, res: any) => void;
  onLimitReached?: (req: any, res: any, key: string) => void;
}

export interface RateLimitStore {
  increment(key: string): Promise<RateLimitInfo>;
  decrement(key: string): Promise<void>;
  reset(key: string): Promise<void>;
  resetAll(): Promise<void>;
}

export interface RateLimitInfo {
  count: number;
  resetTime: Date;
  remaining: number;
  limit: number;
}

// Token bucket implementation for smooth rate limiting
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number;

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  consume(tokens: number = 1): boolean {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  getTokens(): number {
    this.refill();
    return this.tokens;
  }
}

// Sliding window rate limiter for more accurate limiting
export class SlidingWindowRateLimiter implements RateLimitStore {
  private cache: LRUCache<string, number[]>;
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(options: RateLimitOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    
    this.cache = new LRUCache<string, number[]>({
      max: 10000,
      ttl: this.windowMs
    });
  }

  async increment(key: string): Promise<RateLimitInfo> {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Get existing timestamps
    let timestamps = this.cache.get(key) || [];
    
    // Filter out old timestamps
    timestamps = timestamps.filter(t => t > windowStart);
    
    // Add current timestamp
    timestamps.push(now);
    
    // Update cache
    this.cache.set(key, timestamps);
    
    const count = timestamps.length;
    const remaining = Math.max(0, this.maxRequests - count);
    
    return {
      count,
      resetTime: new Date(now + this.windowMs),
      remaining,
      limit: this.maxRequests
    };
  }

  async decrement(key: string): Promise<void> {
    const timestamps = this.cache.get(key);
    if (timestamps && timestamps.length > 0) {
      timestamps.pop();
      this.cache.set(key, timestamps);
    }
  }

  async reset(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async resetAll(): Promise<void> {
    this.cache.clear();
  }
}

// Distributed rate limiter for multi-instance deployments
export class DistributedRateLimiter implements RateLimitStore {
  private localStore: SlidingWindowRateLimiter;
  
  constructor(options: RateLimitOptions) {
    this.localStore = new SlidingWindowRateLimiter(options);
    // In production, this would sync with Redis or similar
  }

  async increment(key: string): Promise<RateLimitInfo> {
    // In production, this would check Redis first
    return this.localStore.increment(key);
  }

  async decrement(key: string): Promise<void> {
    return this.localStore.decrement(key);
  }

  async reset(key: string): Promise<void> {
    return this.localStore.reset(key);
  }

  async resetAll(): Promise<void> {
    return this.localStore.resetAll();
  }
}

// Rate limiter factory
export class RateLimiterFactory {
  private static limiters: Map<string, RateLimitStore> = new Map();
  
  static create(name: string, options: RateLimitOptions): RateLimitStore {
    if (!this.limiters.has(name)) {
      const limiter = process.env.REDIS_URL 
        ? new DistributedRateLimiter(options)
        : new SlidingWindowRateLimiter(options);
      
      this.limiters.set(name, limiter);
    }
    
    return this.limiters.get(name)!;
  }
  
  static get(name: string): RateLimitStore | undefined {
    return this.limiters.get(name);
  }
  
  static resetAll(): void {
    this.limiters.forEach(limiter => limiter.resetAll());
  }
}

// Express middleware factory
export function createRateLimiter(name: string, options: RateLimitOptions) {
  const store = RateLimiterFactory.create(name, options);
  
  return async (req: any, res: any, next: any) => {
    const key = options.keyGenerator ? options.keyGenerator(req) : req.ip;
    
    try {
      const info = await store.increment(key);
      
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', info.limit);
      res.setHeader('X-RateLimit-Remaining', info.remaining);
      res.setHeader('X-RateLimit-Reset', info.resetTime.toISOString());
      
      if (info.count > info.limit) {
        res.setHeader('Retry-After', Math.ceil((info.resetTime.getTime() - Date.now()) / 1000));
        
        if (options.onLimitReached) {
          options.onLimitReached(req, res, key);
        }
        
        if (options.handler) {
          return options.handler(req, res);
        }
        
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil((info.resetTime.getTime() - Date.now()) / 1000)
        });
      }
      
      // Track response for conditional limiting
      if (options.skipSuccessfulRequests || options.skipFailedRequests) {
        const originalEnd = res.end;
        res.end = function(...args: any[]) {
          if ((options.skipSuccessfulRequests && res.statusCode < 400) ||
              (options.skipFailedRequests && res.statusCode >= 400)) {
            store.decrement(key);
          }
          originalEnd.apply(res, args);
        };
      }
      
      next();
    } catch (error) {
      console.error('Rate limiter error:', error);
      next(); // Fail open
    }
  };
}

// Pre-configured rate limiters
export const rateLimiters = {
  api: createRateLimiter('api', {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100
  }),
  
  classification: createRateLimiter('classification', {
    windowMs: 60 * 1000,
    maxRequests: 30,
    skipFailedRequests: true
  }),
  
  upload: createRateLimiter('upload', {
    windowMs: 60 * 1000,
    maxRequests: 10
  }),
  
  auth: createRateLimiter('auth', {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    skipSuccessfulRequests: true
  }),
  
  expensive: createRateLimiter('expensive', {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50
  })
};

// Export OpenAI rate limiter for classification service
export const openaiRateLimiter = createRateLimiter('openai', {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 50, // Tier 5 limit
  skipFailedRequests: true
});