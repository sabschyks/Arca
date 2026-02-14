// biome-ignore assist/source/organizeImports: <Bug?>
import { EventEmitter } from "node:events";
import { MemoryAdapter } from "./adapters/memory";
import { Coalescer } from "./core/coalescer";
import { CircuitBreaker } from "./core/circuit-breaker";
import type {
  ArcaEvents,
  ArcaOptions,
  FetchOptions,
  LockAdapter,
  Logger,
  Metrics,
  StorageAdapter,
} from "./types";
import { createPinoLogger } from "./observability/pino-logger";
import { RedisAdapter } from "./adapters/redis";
import { LocalLruAdapter } from "./adapters/local-lru";
import { TieredStorageAdapter } from "./core/tiered-cache";

export * from "./adapters/memory";
export * from "./adapters/redis";
export * from "./integrations/prisma";
export * from "./integrations/typeorm";
export * from "./observability/pino-logger";
export * from "./observability/prometheus-metrics";
export * from "./core/tiered-cache";
export * from "./adapters/local-lru";
export * from "./types";

export declare interface IArca {
  on<U extends keyof ArcaEvents>(event: U, listener: ArcaEvents[U]): this;
  emit<U extends keyof ArcaEvents>(event: U, ...args: Parameters<ArcaEvents[U]>): boolean;
}

export class Arca extends EventEmitter {
  private cb?: CircuitBreaker;
  private logger: Logger;
  private metrics?: Metrics;
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

    // Default logger é pino, mas pode ser sobrescrito
    this.logger = options.logger || createPinoLogger();
    this.metrics = options.metrics;

    const mainStorage = options.storage || new MemoryAdapter();

    // Verifica se L1 está ativado E se o storage principal é Redis
    // (O Tiered Cache precisa do Redis para Pub/Sub)
    if (options.l1Cache?.enabled && mainStorage instanceof RedisAdapter) {
      this.logger.debug("Initializing Hybrid Cache (L1: LRU + L2: Redis)");
      
      const l1 = new LocalLruAdapter({ 
        max: options.l1Cache.maxSize,
        ttl: this.defaultTtl // Opcional: herdar TTL padrão
      });

      // Envolve o Redis com o Tiered Adapter
      this.storage = new TieredStorageAdapter(l1, mainStorage, this.metrics);;
    } else {
      if (options.l1Cache?.enabled && !(mainStorage instanceof RedisAdapter)) {
        this.logger.warn("L1 Cache was requested but main storage is not Redis. Falling back to single layer.");
      }
      this.storage = mainStorage;
    }

    // Circuit Breaker
    if (options.circuitBreaker) {
      this.cb = new CircuitBreaker({
        threshold: options.circuitBreaker.failureThreshold,
        resetTimeout: options.circuitBreaker.resetTimeout,
      });
    }
  }

  public async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: FetchOptions = {},
  ): Promise<T> {
    const ttl = options.ttl || this.defaultTtl;

    if (this.cb?.isOpen()) {
      this.logger.warn("Circuit is OPEN. Bypassing cache storage.", { key });
      this.metrics?.increment("cache_op", {
        operation: "get",
        status: "bypass",
        key,
      });
      return this.resolveFetch(key, fetcher, ttl);
    }

    if (!options.forceRefresh) {
      try {
        const cached = await this.storage.get<T>(key);
        this.cb?.recordSuccess(); // Operação no storage funcionou

        if (cached) {
          const now = Date.now();
          const isExpired = now - cached.createdAt > cached.ttl;

          if (!isExpired) {
            this.emit("hit", key);
            this.metrics?.increment("cache_op", {
              operation: "get",
              status: "hit",
              key,
            });
            this.logger.debug("Cache hit", { key });
            return cached.value;
          }

          // STALE
          this.emit("stale", key);
          this.metrics?.increment("cache_op", {
            operation: "get",
            status: "stale",
            key,
          });
          this.logger.info("Serving stale data", { key });

          // Background update
          this.backgroundUpdate(key, fetcher, ttl).catch((err) => {
            this.emit("error", err);
            this.logger.error("Background update failed", {
              key,
              error: err.message,
            });
          });

          return cached.value;
        }
      } catch (err) {
        this.cb?.recordFailure(); // Falha no Storage!
        this.logger.error("Storage recording failure", {
          error: (err as Error).message,
        });
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    }

    // MISS
    this.emit("miss", key);
    this.metrics?.increment("cache_op", {
      operation: "get",
      status: "miss",
      key,
    });
    this.logger.debug("Cache miss", { key });

    return this.resolveFetch(key, fetcher, ttl);
  }

  /**
   * Fecha todas as conexões e limpa recursos.
   * Chame isso no 'onClose' do seu servidor (ex: Fastify/Express).
   */
  public async dispose(): Promise<void> {
    this.logger.info("Shutting down Arca...");

    // 1. Se for Tiered, disconecta o subscriber
    if (this.storage instanceof TieredStorageAdapter) {
      await this.storage.disconnect();
    }

    // 2. Se o storage for Redis, fecha a conexão principal
    if (this.storage instanceof RedisAdapter) {
      await this.storage.disconnect();
    }

    // 2. Se o lock for Redis e for diferente do storage, fecha também
    if (this.options.lock instanceof RedisAdapter && this.options.lock !== this.storage) {
      await this.options.lock.disconnect();
    }

    this.emit('error', new Error("Arca instance disposed")); // Sinaliza encerramento
  }

  /**
   * Lógica Central: Coalescing + Distributed Locking
   */
  private async resolveFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number,
  ): Promise<T> {
    const startTime = Date.now();

    return this.coalescer.execute(key, async () => {
      // 1. Verificar suporte a Lock
      // Prioridade: Lock explícito > Storage (se suportar Lock)
      // NOTA: Se usarmos TieredStorage, ele não é um LockAdapter direto, 
      // então dependemos de 'options.lock' ser passado explicitamente.
      const lockAdapter =
        this.options.lock ||
        (this.isLockAdapter(this.storage) ? this.storage : null);

      if (lockAdapter) {
        // Tenta lockar por 5s (tempo seguro para o fetcher rodar)
        const acquired = await lockAdapter.acquire(key, 5000);

        if (!acquired) {
          // "ALGUÉM JÁ PEGOU O LOCK EM OUTRO SERVIDOR".
          // Não rodamos o fetcher. Esperamos o outro servidor atualizar o cache.
          this.logger.debug("Waiting for remote update", { key });
          try {
            return await this.waitForRemoteUpdate<T>(key);
          } catch (_err) {
            // Se timeout, fallback para rodar o fetcher nós mesmos
            // (Melhor duplicar trabalho do que falhar a request)
            this.emit(
              "error",
              new Error(
                `Lock wait timeout for ${key}, falling back to local fetch`,
              ),
            );
          }
        }
      }

      // 2. Executa Fetch (Se pegou lock ou não tem lock)
      try {
        const value = await fetcher();
        const duration = (Date.now() - startTime) / 1000;

        this.metrics?.observe("fetch_duration", duration, { key });
        this.logger.info("Fetch completed succesfully", { key, duration });

        try {
          await this.storage.set(key, value, ttl);
          this.cb?.recordSuccess();
        } catch (err) {
          this.cb?.recordFailure();
          this.logger.error("Storage set failed", {
            key,
            error: (err as Error).message,
          });
        }

        return value;
      } catch (err) {
        this.logger.error("Fetch operation failed", {
          key,
          error: (err as Error).message,
        });
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
  private isLockAdapter(
    adapter: StorageAdapter,
  ): adapter is StorageAdapter & LockAdapter {
    return (
      "acquire" in adapter && typeof (adapter as any).acquire === "function"
    );
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
