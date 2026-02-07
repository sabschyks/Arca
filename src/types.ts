export interface CacheEntry<T> {
  value: T;
  createdAt: number; // Timestamp em ms
  ttl: number; // Time to live em ms
}

export interface StorageAdapter {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, value: T, ttl: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface ArcaOptions {
  storage?: StorageAdapter;
  defaultTtl?: number;
}

export interface FetchOptions {
  forceRefresh?: boolean;
  ttl?: number; // TTL específico para esta chamada
}
