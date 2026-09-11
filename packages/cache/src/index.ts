import { Redis } from 'ioredis';

/**
 * Cache abstraction: Redis when available, in-memory fallback otherwise.
 * Used for guild settings caching, cooldowns, anti-spam windows and
 * dashboard response caching. The in-memory fallback keeps local development
 * and single-instance deployments dependency-free.
 */
export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /**
   * Atomically increment a counter and reset its TTL window.
   * Returns the current count — the core primitive for rate limiting and
   * spam/flood detection.
   */
  incrTtl(key: string, windowSeconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  healthy(): Promise<boolean>;
  close(): Promise<void>;
}

class MemoryCache implements Cache {
  private store = new Map<string, { value: string; expiresAt: number | null }>();

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) this.store.delete(key);
    }
  }

  async get(key: string): Promise<string | null> {
    this.sweep();
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) this.store.delete(key);
  }

  async incrTtl(key: string, windowSeconds: number): Promise<number> {
    this.sweep();
    const existing = this.store.get(key);
    const now = Date.now();
    if (!existing || (existing.expiresAt !== null && existing.expiresAt <= now)) {
      this.store.set(key, { value: '1', expiresAt: now + windowSeconds * 1000 });
      return 1;
    }
    const next = Number.parseInt(existing.value, 10) + 1;
    existing.value = String(next);
    return next;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt === null) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  async healthy(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    this.store.clear();
  }
}

class RedisCache implements Cache {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await this.redis.del(...keys);
  }

  async incrTtl(key: string, windowSeconds: number): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    } else {
      // Extend safety: if the TTL was lost (e.g. between incr and expire),
      // re-apply the window so counters can never live forever.
      if ((await this.redis.ttl(key)) < 0) await this.redis.expire(key, windowSeconds);
    }
    return count;
  }

  async ttl(key: string): Promise<number> {
    return this.redis.ttl(key);
  }

  async healthy(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}

export async function createCache(redisUrl?: string): Promise<Cache> {
  if (redisUrl) {
    try {
      const redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        connectTimeout: 5000,
        enableOfflineQueue: false,
      });
      await redis.connect();
      await redis.ping();
      return new RedisCache(redis);
    } catch {
      // Fall through to memory cache — Redis is an optimization, not a hard dependency.
    }
  }
  return new MemoryCache();
}

export { MemoryCache, RedisCache };
