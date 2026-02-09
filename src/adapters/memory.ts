import type { CacheEntry, LockAdapter, StorageAdapter } from "../types";

export class MemoryAdapter implements StorageAdapter, LockAdapter {
  private map = new Map<string, CacheEntry<unknown>>();
  private locks = new Set<string>();

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

  async acquire(key: string, ttl: number): Promise<boolean> {
    if (this.locks.has(key)) {
      return false; // Já está lockando
    }

    this.locks.add(key);

    setTimeout(() => {
      this.locks.delete(key);
    }, ttl);

    return true;
  }

  async release(key: string): Promise<void> {
    this.locks.delete(key);
  }
}
