import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';

process.env.MASTERCARD_CONSUMER_KEY = 'key!id';
process.env.MASTERCARD_KEY = 'private-key';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
// use real timers; spy per test

vi.mock('mastercard-oauth1-signer', () => ({
  default: { getAuthorizationHeader: vi.fn().mockReturnValue('oauth') }
}));

vi.mock('../server/db', () => ({ db: {} }));

let MastercardApiService: any;
beforeAll(async () => {
  ({ MastercardApiService } = await import('../server/services/mastercardApi'));
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe('MastercardApiService', () => {
  it('submits bulk search successfully', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ bulkSearchId: '123' })
    });

    const service = new MastercardApiService();
    const result = await service.submitBulkSearch({ lookupType: 'SUPPLIERS', searches: [{ searchRequestId: '1', businessName: 'Test' }] });

    expect(result.bulkSearchId).toBe('123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws error on authentication failure', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'error',
      headers: { entries: () => [] }
    });

    const service = new MastercardApiService();
    await expect(service.submitBulkSearch({ lookupType: 'SUPPLIERS', searches: [{ searchRequestId: '1', businessName: 'Test' }] }))
      .rejects.toThrow('Authentication failed');
  });

  it('waits between retries when rate limited', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'limit',
        headers: { entries: () => [] }
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ bulkSearchId: 'xyz' })
      });

    const service = new MastercardApiService();
    const spy = vi.spyOn(global, 'setTimeout');
    const result = await service.submitBulkSearch({ lookupType: 'SUPPLIERS', searches: [{ searchRequestId: '1', businessName: 'Test' }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith(expect.any(Function), 2000);
    expect(result.bulkSearchId).toBe('xyz');
    spy.mockRestore();
  });
});
