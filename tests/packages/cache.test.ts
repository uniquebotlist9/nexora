import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCache, MemoryCache } from '../../packages/cache/src/index';

describe('MemoryCache (fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and returns values without a TTL', async () => {
    const cache = new MemoryCache();
    await cache.set('guild:1:settings', 'payload');
    expect(await cache.get('guild:1:settings')).toBe('payload');
  });

  it('returns null for missing keys', async () => {
    const cache = new MemoryCache();
    expect(await cache.get('nope')).toBeNull();
  });

  it('expires values after the TTL', async () => {
    const cache = new MemoryCache();
    await cache.set('cooldown:user:1', '1', 60);

    vi.advanceTimersByTime(59_999);
    expect(await cache.get('cooldown:user:1')).toBe('1'); // still within the window

    vi.advanceTimersByTime(1);
    expect(await cache.get('cooldown:user:1')).toBeNull(); // expired
  });

  it('reports the remaining TTL in seconds', async () => {
    const cache = new MemoryCache();
    await cache.set('k', 'v', 60);
    expect(await cache.ttl('k')).toBe(60);

    vi.advanceTimersByTime(30_000);
    expect(await cache.ttl('k')).toBe(30);

    vi.advanceTimersByTime(30_000);
    expect(await cache.ttl('k')).toBe(0);
  });

  it('returns -1 for keys without a TTL, missing keys and expired keys', async () => {
    const cache = new MemoryCache();
    await cache.set('persistent', 'v'); // no TTL
    expect(await cache.ttl('persistent')).toBe(-1);
    expect(await cache.ttl('missing')).toBe(-1);

    await cache.set('short-lived', 'v', 1);
    vi.advanceTimersByTime(1001);
    // A get() sweeps the expired entry away...
    expect(await cache.get('short-lived')).toBeNull();
    // ...after which ttl() reports the key as gone.
    expect(await cache.ttl('short-lived')).toBe(-1);
  });

  it('overwriting a value replaces the TTL', async () => {
    const cache = new MemoryCache();
    await cache.set('k', 'first', 60);
    await cache.set('k', 'second'); // overwrite without TTL
    expect(await cache.get('k')).toBe('second');
    expect(await cache.ttl('k')).toBe(-1);
  });

  it('deletes one or many keys', async () => {
    const cache = new MemoryCache();
    await cache.set('a', '1');
    await cache.set('b', '2');
    await cache.set('c', '3');

    await cache.del('a');
    expect(await cache.get('a')).toBeNull();
    expect(await cache.get('b')).toBe('2');

    await cache.del('b', 'c');
    expect(await cache.get('b')).toBeNull();
    expect(await cache.get('c')).toBeNull();

    // Deleting missing keys must not throw.
    await expect(cache.del('missing')).resolves.toBeUndefined();
  });

  it('incrTtl counts up inside the window and resets after it expires', async () => {
    const cache = new MemoryCache();

    // Spam detection: 3 messages inside a 10s window.
    expect(await cache.incrTtl('spam:user:1', 10)).toBe(1);
    vi.advanceTimersByTime(3_000);
    expect(await cache.incrTtl('spam:user:1', 10)).toBe(2);
    vi.advanceTimersByTime(3_000);
    expect(await cache.incrTtl('spam:user:1', 10)).toBe(3);

    // Window elapses → the counter resets.
    vi.advanceTimersByTime(4_001);
    expect(await cache.incrTtl('spam:user:1', 10)).toBe(1);
  });

  it('incrTtl uses a fixed window (does not extend on each increment)', async () => {
    const cache = new MemoryCache();
    await cache.incrTtl('ratelimit:key', 60); // window starts now

    vi.advanceTimersByTime(30_000);
    expect(await cache.incrTtl('ratelimit:key', 60)).toBe(2);
    // 30s have passed inside a 60s window started at t0 → 30s remain, not 60.
    expect(await cache.ttl('ratelimit:key')).toBe(30);
  });

  it('reports healthy and clears the store on close', async () => {
    const cache = new MemoryCache();
    expect(await cache.healthy()).toBe(true);

    await cache.set('k', 'v');
    await cache.close();
    expect(await cache.get('k')).toBeNull();
  });
});

describe('createCache (real timers)', () => {
  it('falls back to the in-memory cache when no Redis URL is given', async () => {
    const cache = await createCache(undefined);
    expect(cache).toBeInstanceOf(MemoryCache);
    await cache.set('k', 'v');
    expect(await cache.get('k')).toBe('v');
    await cache.close();
  });

  it('falls back to the in-memory cache when Redis is unreachable', async () => {
    // Port 1 on localhost refuses connections instantly; the factory must
    // degrade gracefully instead of throwing (Redis is an optimization,
    // not a hard dependency).
    const cache = await Promise.race([
      createCache('redis://127.0.0.1:1'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('createCache fallback took too long')), 5_000),
      ),
    ]);
    expect(cache).toBeInstanceOf(MemoryCache);
    await cache.set('k', 'v');
    expect(await cache.get('k')).toBe('v');
    await cache.close();
  });
});
