/**
 * Simple in-memory cache with TTL for npm registry lookups.
 * Avoids rate-limiting npmjs.org on repeated queries.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class DepCache {
  private store = new Map<string, CacheEntry<any>>();
  private defaultTtlMs: number;

  constructor(ttlMs: number = 3_600_000) {
    this.defaultTtlMs = ttlMs;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

export const globalCache = new DepCache();
