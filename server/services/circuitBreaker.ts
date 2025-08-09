/**
 * Enterprise-grade Circuit Breaker Pattern Implementation
 * Prevents cascading failures in distributed systems
 */

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  monitoringWindow: number;
  halfOpenRequests: number;
}

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number | null = null;
  private halfOpenRequests: number = 0;
  private readonly options: CircuitBreakerOptions;
  private readonly name: string;
  private metrics: {
    totalRequests: number;
    totalFailures: number;
    totalSuccesses: number;
    lastStateChange: Date;
    stateChanges: Array<{ from: CircuitState; to: CircuitState; timestamp: Date }>;
  };

  constructor(name: string, options: Partial<CircuitBreakerOptions> = {}) {
    this.name = name;
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      resetTimeout: options.resetTimeout || 60000, // 1 minute
      monitoringWindow: options.monitoringWindow || 10000, // 10 seconds
      halfOpenRequests: options.halfOpenRequests || 3
    };
    
    this.metrics = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      lastStateChange: new Date(),
      stateChanges: []
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.metrics.totalRequests++;
    
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new Error(`Circuit breaker is OPEN for ${this.name}`);
      }
    }

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenRequests >= this.options.halfOpenRequests) {
        throw new Error(`Circuit breaker is testing with limited requests for ${this.name}`);
      }
      this.halfOpenRequests++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.metrics.totalSuccesses++;
    this.failureCount = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.halfOpenRequests) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  private onFailure(): void {
    this.metrics.totalFailures++;
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private shouldAttemptReset(): boolean {
    return this.lastFailureTime !== null &&
           Date.now() - this.lastFailureTime >= this.options.resetTimeout;
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.metrics.lastStateChange = new Date();
    this.metrics.stateChanges.push({
      from: oldState,
      to: newState,
      timestamp: new Date()
    });
    
    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
      this.halfOpenRequests = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.halfOpenRequests = 0;
      this.successCount = 0;
    }
    
    console.log(`Circuit breaker ${this.name}: ${oldState} -> ${newState}`);
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics() {
    return {
      ...this.metrics,
      currentState: this.state,
      failureCount: this.failureCount,
      successRate: this.metrics.totalRequests > 0 
        ? (this.metrics.totalSuccesses / this.metrics.totalRequests * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }
}

// Circuit breaker instances for different services
export const circuitBreakers = {
  openai: new CircuitBreaker('OpenAI', { 
    failureThreshold: 3, 
    resetTimeout: 30000 
  }),
  mastercard: new CircuitBreaker('Mastercard', { 
    failureThreshold: 5, 
    resetTimeout: 60000 
  }),
  database: new CircuitBreaker('Database', { 
    failureThreshold: 10, 
    resetTimeout: 10000 
  }),
  finexio: new CircuitBreaker('Finexio', { 
    failureThreshold: 5, 
    resetTimeout: 20000 
  })
};

// Health check for all circuit breakers
export function getCircuitBreakerHealth() {
  const health: Record<string, any> = {};
  
  for (const [name, breaker] of Object.entries(circuitBreakers)) {
    health[name] = {
      state: breaker.getState(),
      metrics: breaker.getMetrics()
    };
  }
  
  return health;
}