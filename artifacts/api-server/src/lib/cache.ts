/**
 * Lightweight in-memory TTL cache — no external dependencies.
 * One instance per resource type keeps eviction bounded and scoped.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class TTLCache<T = unknown> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: T, ttlMs: number): void {
    // Evict the entry expiring soonest when at capacity
    if (this.store.size >= this.maxSize) {
      let minKey: string | undefined;
      let minExp = Infinity;
      for (const [k, v] of this.store) {
        if (v.expiresAt < minExp) { minExp = v.expiresAt; minKey = k; }
      }
      if (minKey) this.store.delete(minKey);
    }
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Diagnostic: count of live (non-expired) entries */
  size(): number {
    return this.store.size;
  }
}

// One cache instance per resource type
export const walletCache = new TTLCache(500);
export const txCache     = new TTLCache(300);
export const connCache   = new TTLCache(500);

// TTLs (milliseconds)
export const WALLET_TTL = 2 * 60 * 1000;  // 2 min — balance + profile data
export const TX_TTL     = 1 * 60 * 1000;  // 1 min — first page of transactions
export const CONN_TTL   = 2 * 60 * 1000;  // 2 min — connection graph
