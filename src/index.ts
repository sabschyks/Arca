/**
 * Arca - High Concurrency Cache
 */
import { EventEmitter } from "node:events";
import { MemoryAdapter } from "./adapters/memory";
import { Coalescer } from "./core/coalescer";
import type { ArcaOptions, FetchOptions, StorageAdapter } from "./types";

export * from "./adapters/memory";
export * from "./adapters/redis";
export * from "./types";

export class Arca extends EventEmitter {
  private storage: StorageAdapter;
  private coalescer: Coalescer;
  private defaultTtl: number;

  constructor(options: ArcaOptions = {}) {
    super();
    this.storage = options.storage || new MemoryAdapter();
    this.defaultTtl = options.defaultTtl || 60000; // 1 minuto padrão
    this.coalescer = new Coalescer();
  }

  /**
   * Busca um dado.
   * Estratégia: State-While-Revalidate
   */
  public async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: FetchOptions = {},
  ): Promise<T> {
    const ttl = options.ttl || this.defaultTtl;

    // 1. Tentar pegar do cache (se não forçado a ignorar)
    if (!options.forceRefresh) {
      try {
        const cached = await this.storage.get<T>(key);

        if (cached) {
          const isExpired = Date.now() - cached.createdAt > cached.ttl;

          if (!isExpired) {
            this.emit("hit", key);
            return cached.value;
          }

          // STALE: O dado existe mas venceu.
          // Retornamos o dado velho IMEDIATAMENTE e atualizamos em background.
          // Usamos o coalescer para garantir que apenas UM background update ocorra.
          this.emit("stale", key);
          this.backgroundUpdate(key, fetcher, ttl).catch((err) => {
            this.emit("error", err);
          });

          return cached.value;
        }
      } catch (err) {
        // Se falar o storage (ex: Redis cai), locamos e prosseguimos para o fetcher
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    }

    // MISS: Não tem no cache ou forceRefresh=true
    // Precisamos buscar (e esperar) o dado novo.
    this.emit("miss", key);
    return this.resolveFetch(key, fetcher, ttl);
  }

  /**
   * Executa a busca através do Coalesces e salva no Storage.
   */
  private async resolveFetch<T>(key: string, fetcher: () => Promise<T>, ttl: number): Promise<T> {
    // Verifica se já existe uma promessa em voo antes de executar

    return this.coalescer.execute(key, async () => {
      // Se o contador não mudou, significa que fomos "coalesced" (aproveitamos a carona)
      // Se mudou, nós somos a request original.
      // *Nota: Lógica simplificada. Para precisão exata de "coalesced"
      // precisaríamos modificar o Coalescer para retornar um status.
      // Por hora, vamos emitir 'coalesced' apenas se NÃO formos quem executa o fetch real?
      // Não, melhor: O Coalescer esconde isso.
      // Vamos emitir 'miss' apenas se realmente buscamos no banco.

      const value = await fetcher();
      try {
        await this.storage.set(key, value, ttl);
      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
      return value;
    });
  }

  /**
   * Wrapper para atualização em background que não trava a resposta principal.
   */
  private async backgroundUpdate<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number,
  ): Promise<void> {
    // Apenas chamamos o resolverFetch. O Coalescer cuida de não duplicar.
    await this.resolveFetch(key, fetcher, ttl);
  }

  /**
   * Limpa uma nova chave manualmente
   */
  public async delete(key: string): Promise<void> {
    await this.storage.delete(key);
  }
}
