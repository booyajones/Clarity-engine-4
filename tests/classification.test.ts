import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

let createMock: any;

vi.mock('../server/storage', () => ({
  storage: {
    getClassificationRules: vi.fn().mockResolvedValue([]),
    createClassificationRule: vi.fn().mockResolvedValue(undefined),
    getUserUploadBatches: vi.fn().mockResolvedValue([]),
    getBatchClassifications: vi.fn().mockResolvedValue([]),
    updateUploadBatch: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('openai', () => {
  createMock = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create: createMock } }
    }))
  };
});

let ClassificationService: any;
let RateLimiter: any;
beforeAll(async () => {
  ({ ClassificationService, RateLimiter } = await import('../server/services/classification'));
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ClassificationService', () => {
  it('classifies payee successfully', async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({
        payeeType: 'Business',
        confidence: 0.9,
        sicCode: '1234',
        sicDescription: 'Software',
        reasoning: 'test'
      }) } }]
    });

    const service = new ClassificationService();
    const promise = service.classifyPayee('Acme Inc');
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.payeeType).toBe('Business');
    expect(result.sicCode).toBe('1234');
  });

  it('returns unknown when OpenAI fails', async () => {
    createMock.mockRejectedValueOnce(new Error('OpenAI failure'));

    const service = new ClassificationService();
    const promise = service.classifyPayee('Random Name');
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.payeeType).toBe('Unknown');
    expect(result.confidence).toBeLessThan(0.5);
  });
});

describe('RateLimiter', () => {
  it('waits when limit exceeded', async () => {
    const limiter = new RateLimiter(2, 1000);
    const spy = vi.spyOn(global, 'setTimeout');

    await limiter.waitIfNeeded();
    await limiter.waitIfNeeded();
    const third = limiter.waitIfNeeded();

    expect(spy).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    await third;

    spy.mockRestore();
  });
});
