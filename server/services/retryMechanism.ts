/**
 * Enterprise Retry Mechanism
 * Implements exponential backoff and retry strategies
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  factor?: number;
  jitter?: boolean;
  retryCondition?: (error: any) => boolean;
  onRetry?: (error: any, attempt: number) => void;
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

export class ExponentialBackoff {
  private attempt = 0;
  
  constructor(private readonly options: RetryOptions = {}) {
    this.options = {
      maxAttempts: options.maxAttempts || 3,
      initialDelay: options.initialDelay || 1000,
      maxDelay: options.maxDelay || 30000,
      factor: options.factor || 2,
      jitter: options.jitter !== false,
      ...options
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.attempt = 0;
    
    while (this.attempt < this.options.maxAttempts!) {
      try {
        this.attempt++;
        return await fn();
      } catch (error) {
        if (!this.shouldRetry(error)) {
          throw error;
        }
        
        if (this.attempt >= this.options.maxAttempts!) {
          throw new RetryError(
            `Failed after ${this.attempt} attempts`,
            this.attempt,
            error as Error
          );
        }
        
        if (this.options.onRetry) {
          this.options.onRetry(error, this.attempt);
        }
        
        const delay = this.calculateDelay();
        console.log(`Retry attempt ${this.attempt}/${this.options.maxAttempts} after ${delay}ms`);
        
        await this.sleep(delay);
      }
    }
    
    throw new Error('Unexpected retry loop exit');
  }

  private shouldRetry(error: any): boolean {
    if (this.options.retryCondition) {
      return this.options.retryCondition(error);
    }
    
    // Default retry conditions
    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET' ||
        error.code === 'EPIPE') {
      return true;
    }
    
    // Retry on 5xx errors
    if (error.response?.status >= 500) {
      return true;
    }
    
    // Retry on rate limit errors
    if (error.response?.status === 429) {
      return true;
    }
    
    return false;
  }

  private calculateDelay(): number {
    const exponentialDelay = Math.min(
      this.options.initialDelay! * Math.pow(this.options.factor!, this.attempt - 1),
      this.options.maxDelay!
    );
    
    if (this.options.jitter) {
      // Add random jitter (±25%)
      const jitter = exponentialDelay * 0.25;
      return Math.floor(exponentialDelay + (Math.random() * 2 - 1) * jitter);
    }
    
    return exponentialDelay;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  reset(): void {
    this.attempt = 0;
  }
}

// Retry strategies for different services
export const retryStrategies = {
  database: new ExponentialBackoff({
    maxAttempts: 5,
    initialDelay: 100,
    maxDelay: 5000,
    retryCondition: (error) => {
      // Retry on connection errors
      return error.code === 'ECONNREFUSED' || 
             error.code === 'ETIMEDOUT' ||
             error.message?.includes('connection');
    }
  }),
  
  openai: new ExponentialBackoff({
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    retryCondition: (error) => {
      // Retry on rate limits and server errors
      const status = error.response?.status;
      return status === 429 || status >= 500;
    }
  }),
  
  mastercard: new ExponentialBackoff({
    maxAttempts: 3,
    initialDelay: 2000,
    maxDelay: 15000,
    retryCondition: (error) => {
      // Retry on specific Mastercard errors
      const status = error.response?.status;
      return status === 429 || status === 503 || status >= 500;
    }
  }),
  
  http: new ExponentialBackoff({
    maxAttempts: 3,
    initialDelay: 500,
    maxDelay: 5000
  })
};

// Decorator for automatic retry
export function withRetry(strategy: ExponentialBackoff = retryStrategies.http) {
  return function(target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function(...args: any[]) {
      return strategy.execute(() => originalMethod.apply(this, args));
    };
    
    return descriptor;
  };
}

// Utility function for retrying promises
export async function retry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const backoff = new ExponentialBackoff(options);
  return backoff.execute(fn);
}

// Circuit breaker with retry
export class RetryableCircuitBreaker {
  private retryStrategy: ExponentialBackoff;
  
  constructor(
    private readonly name: string,
    retryOptions?: RetryOptions
  ) {
    this.retryStrategy = new ExponentialBackoff(retryOptions);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await this.retryStrategy.execute(fn);
    } catch (error) {
      console.error(`${this.name} failed after retries:`, error);
      throw error;
    }
  }
}

// Batch retry for multiple operations
export class BatchRetry {
  constructor(private readonly options: RetryOptions = {}) {}

  async executeAll<T>(
    operations: Array<() => Promise<T>>,
    options?: { concurrency?: number }
  ): Promise<Array<{ success: boolean; result?: T; error?: Error }>> {
    const concurrency = options?.concurrency || 5;
    const results: Array<{ success: boolean; result?: T; error?: Error }> = [];
    
    // Process in batches
    for (let i = 0; i < operations.length; i += concurrency) {
      const batch = operations.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(op => retry(op, this.options))
      );
      
      results.push(...batchResults.map(r => {
        if (r.status === 'fulfilled') {
          return { success: true, result: r.value };
        } else {
          return { success: false, error: r.reason };
        }
      }));
    }
    
    return results;
  }
}