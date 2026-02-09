import { EventEmitter } from "node:events";
import { MemoryAdapter } from "./adapters/memory";
import { Coalescer } from "./core/coalescer";
import type { ArcaEvents, ArcaOptions, FetchOptions, LockAdapter, StorageAdapter } from "./types";

export * from "./adapters/memory";
export * from "./adapters/redis";
export * from "./types";

export declare interface IArca {
  on<U extends keyof ArcaEvents>(event: U, listener: ArcaEvents[U]): this;
  emit<U extends keyof ArcaEvents>(event: U, ...args: Parameters<ArcaEvents[U]>): boolean;
}

export class Arca extends EventEmitter {
  private storage: StorageAdapter;
  private coalescer: Coalescer;
  private defaultTtl: number;
  private options: ArcaOptions; // Guardamos options para acessar o lock

  constructor(options: ArcaOptions = {}) {
    super();
    this.options = options;
    this.storage = options.storage || new MemoryAdapter();
    this.defaultTtl = options.defaultTtl || 60000;
    this.coalescer = new Coalescer();
  }

  public async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: FetchOptions = {},
  ): Promise<T> {
    const ttl = options.ttl || this.defaultTtl;

    if (!options.forceRefresh) {
      try {
        const cached = await this.storage.get<T>(key);

        if (cached) {
          const isExpired = Date.now() - cached.createdAt > cached.ttl;

          if (!isExpired) {
            this.emit("hit", key);
            return cached.value;
          }

          // STALE
          this.emit("stale", key);
          this.backgroundUpdate(key, fetcher, ttl).catch((err) => {
            this.emit("error", err);
          });

          return cached.value;
        }
      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    }

    // MISS
    this.emit("miss", key);
    return this.resolveFetch(key, fetcher, ttl);
  }

  /**
   * Lógica Central: Coalescing + Distributed Locking
   */
  private async resolveFetch<T>(key: string, fetcher: () => Promise<T>, ttl: number): Promise<T> {
    return this.coalescer.execute(key, async () => {
      // 1. Verificar suporte a Lock
      // Prioridade: Lock explícito > Storage (se suportar Lock)
      const lockAdapter =
        this.options.lock || (this.isLockAdapter(this.storage) ? this.storage : null);

      if (lockAdapter) {
        // Tenta lockar por 5s (tempo seguro para o fetcher rodar)
        const acquired = await lockAdapter.acquire(key, 5000);

        if (!acquired) {
          // ALGUÉM JÁ PEGOU O LOCK EM OUTRO SERVIDOR.
          // Não rodamos o fetcher. Esperamos o outro servidor atualizar o cache.
          try {
            return await this.waitForRemoteUpdate<T>(key);
          } catch (_err) {
            // Se timeout, fallback para rodar o fetcher nós mesmos
            // (Melhor duplicar trabalho do que falhar a request)
            this.emit(
              "error",
              new Error(`Lock wait timeout for ${key}, falling back to local fetch`),
            );
          }
        }
      }

      // 2. Executa Fetch (Se pegou lock ou não tem lock)
      try {
        const value = await fetcher();
        await this.storage.set(key, value, ttl);
        return value;
      } catch (err) {
        throw err;
      } finally {
        // Sempre liberar o lock
        if (lockAdapter) {
          await lockAdapter.release(key);
        }
      }
    });
  }

  private async backgroundUpdate<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number,
  ): Promise<void> {
    await this.resolveFetch(key, fetcher, ttl);
  }

  public async delete(key: string): Promise<void> {
    await this.storage.delete(key);
  }

  /**
   * Type Guard para verificar se o Storage suporta Lock
   */
  private isLockAdapter(adapter: StorageAdapter): adapter is StorageAdapter & LockAdapter {
    return "acquire" in adapter && typeof (adapter as any).acquire === "function";
  }

  /**
   * Polling: Espera o dado aparecer no cache
   */
  private async waitForRemoteUpdate<T>(key: string): Promise<T> {
    const pollInterval = 100; // 100ms
    const maxRetries = 30; // 3 segundos de espera máxima

    for (let i = 0; i < maxRetries; i++) {
      await new Promise((r) => setTimeout(r, pollInterval));

      const cached = await this.storage.get<T>(key);
      // Se achou e é válido (ou aceitamos stale aqui também? Melhor ser fresco)
      if (cached) {
        return cached.value;
      }
    }
    throw new Error("Distributed lock timeout: Data did not appear in cache");
  }
}
