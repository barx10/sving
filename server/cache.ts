/**
 * Small in-process TTL cache.
 *
 * Every upstream this app talks to (MET.no, Nominatim, OSRM, the elevation APIs)
 * is a free public service with usage terms that ask callers to cache. Two riders
 * planning the same classic route should not cost MET.no two requests.
 *
 * In-process means it resets on deploy and does not span instances. That is fine
 * for the traffic this app expects; swap in Redis if it ever outgrows one box.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500
  ) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    // Refresh insertion order so the eviction below stays roughly LRU.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Returns the cached value, or computes, stores and returns a fresh one. */
  async wrap(key: string, produce: () => Promise<T>): Promise<T> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;

    const value = await produce();
    this.set(key, value);
    return value;
  }
}
