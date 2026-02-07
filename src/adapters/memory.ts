import type { CacheEntry, StorageAdapter } from "../types";

export class MemoryAdapter implements StorageAdapter {
  private map = new Map<string, CacheEntry<unknown>>();

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const entry = this.map.get(key);
    return (entry as CacheEntry<T>) || null;
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    this.map.set(key, {
      value,
      createdAt: Date.now(),
      ttl,
    });
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  async clear(): Promise<void> {
    this.map.clear();
  }
}
