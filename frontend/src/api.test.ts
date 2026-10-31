import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasMetrics, prefetch } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('API cache', () => {
  it('deduplicates in-flight prefetches and retains successful responses', async () => {
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    vi.stubGlobal('fetch', fetcher);

    const first = prefetch('/test/cache');
    const second = prefetch('/test/cache');
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve(new Response(JSON.stringify({ n: 24 })));
    await Promise.all([first, second]);
    await prefetch('/test/cache');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not cache HTTP failures so the URL can be retried', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Unavailable' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ n: 24 })));
    vi.stubGlobal('fetch', fetcher);

    await expect(prefetch('/test/retry')).rejects.toThrow('Unavailable');
    await expect(prefetch('/test/retry')).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not cache rejected requests or invalid JSON', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(new Response('invalid json'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ n: 24 })));
    vi.stubGlobal('fetch', fetcher);

    await expect(prefetch('/test/network')).rejects.toThrow('Offline');
    await expect(prefetch('/test/network')).rejects.toThrow();
    await expect(prefetch('/test/network')).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('recognizes the empty metrics response', () => {
    expect(hasMetrics({ n: 0 })).toBe(false);
  });
});
