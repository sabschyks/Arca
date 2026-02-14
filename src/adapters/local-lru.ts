import { LRUCache } from "lru-cache";
import type { CacheEntry, StorageAdapter } from "../types";

export interface LocalCacheOptions {
  max?: number; // Máximo de itens na memória (ex: 5000)
  ttl?: number; // TTL padrão em ms
}

export class LocalLruAdapter implements StorageAdapter {
  private cache: LRUCache<string, CacheEntry<any>>;

  constructor(options: LocalCacheOptions = {}) {
    this.cache = new LRUCache({
      max: options.max || 1000,
      ttl: options.ttl || 1000 * 60,
      // O LRU Cache limpa automaticamente itens expirados
    });
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    // Síncrono e ultra-rápido
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    return entry;
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    const entry: CacheEntry<T> = {
      value,
      createdAt: Date.now(),
      ttl,
    };
    this.cache.set(key, entry, { ttl });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}
