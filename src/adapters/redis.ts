import Redis, { type Redis as RedisClient } from "ioredis";
import type { CacheEntry, LockAdapter, StorageAdapter } from "../types";

export class RedisAdapter implements StorageAdapter, LockAdapter {
  private client: RedisClient;

  constructor(connectionStringOrClient: string | RedisClient) {
    if (typeof connectionStringOrClient === "string") {
      this.client = new Redis(connectionStringOrClient);
    } else {
      this.client = connectionStringOrClient;
    }
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const data = await this.client.get(key);

    if (!data) return null;

    try {
      // O Redis retorna string, precisamos recompor o objeto CacheEntry
      return JSON.parse(data) as CacheEntry<T>;
    } catch {
      // Se o JSON estiver corrompido, tratamos como miss
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    const entry: CacheEntry<T> = {
      value,
      createdAt: Date.now(),
      ttl,
    };

    // 'PX' define o TTL em milissegundos nativamente no Redis
    await this.client.set(key, JSON.stringify(entry), "PX", ttl);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async clear(): Promise<void> {
    await this.client.flushdb();
  }

  /**
   * Método útil para fechar conexão em testes ou shutdown gracioso
   */
  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  async acquire(key: string, ttl: number): Promise<boolean> {
    // Prefixo para não colidir com dados reais
    const lockKey = `lock:${key}`;

    // NX: Só define se não existir
    // PX: Expira em ms
    const result = await this.client.set(lockKey, "LOCKED", "PX", ttl, "NX");

    return result === "OK";
  }

  async release(key: string): Promise<void> {
    const lockKey = `lock:${key}`;
    await this.client.del(lockKey);
  }
}
