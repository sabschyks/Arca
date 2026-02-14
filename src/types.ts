export interface CacheEntry<T> {
  value: T;
  createdAt: number; // Timestamp em ms
  ttl: number; // Time to live em ms
}

export interface CircuitBreakerOptions {
  failureThreshold: number; // Quantos erros para abrir o circuito
  resetTimeout: number; // Quanto tempo (ms) esperar para tentar o Redis de novo
}

export interface LockAdapter {
  /**
   * Tenta adquirir o lock.
   * @returns true se conseguiu, false se já estava ocupado.
   */
  acquire(key: string, ttl: number): Promise<boolean>;

  /**
   * Libera o lock.
   */
  release(key: string): Promise<void>;
}

export interface StorageAdapter {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, value: T, ttl: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface Logger {
  info(msg: string, obj?: any): void;
  error(msg: string, obj?: any): void;
  debug(msg: string, obj?: any): void;
  warn(msg: string, obj?: any): void;
}

export interface Metrics {
  increment(name: string, labels?: Record<string, string>): void;
  observe(name: string, value: number, labels?: Record<string, string>): void;
}

export interface ArcaOptions {
  storage?: StorageAdapter;
  lock?: LockAdapter;
  defaultTtl?: number;
  logger?: Logger;
  metrics?: Metrics;
  circuitBreaker?: CircuitBreakerOptions;
  l1Cache?: {
    enabled: boolean,
    maxSize?: number, // Ex: 5000 itens
  }
}

export interface FetchOptions {
  forceRefresh?: boolean;
  ttl?: number; // TTL específico para esta chamada
}

export type ArcaEvents = {
  hit: (key: string) => void;
  miss: (key: string) => void;
  stale: (key: string) => void;
  coalesced: (key: string) => void;
  error: (err: Error) => void;
};
