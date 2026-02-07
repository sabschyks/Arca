/**
 * Arca - High Concurrency Cache
 */
import { MemoryAdapter } from "./adapters/memory";
import { Coalescer } from "./core/coalescer";
import type { ArcaOptions, FetchOptions, StorageAdapter } from "./types";

export * from "./adapters/memory";
export * from "./types";

export class Arca {
  private storage: StorageAdapter;
  private coalescer: Coalescer;
  private defaultTtl: number;

  constructor(options: ArcaOptions = {}) {
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
      const cached = await this.storage.get<T>(key);

      if (cached) {
        const isExpired = Date.now() - cached.createdAt > cached.ttl;

        if (!isExpired) {
          // HIT: Retorna dado fresco
          return cached.value;
        }

        // STALE: O dado existe mas venceu.
        // Retornamos o dado velho IMEDIATAMENTE e atualizamos em background.
        // Usamos o coalescer para garantir que apenas UM background update ocorra.
        this.backgroundUpdate(key, fetcher, ttl).catch((err) => {
          console.error(`[Arca] Background update failed for key: ${key}`, err);
        });

        return cached.value;
      }
    }

    // MISS: Não tem no cache ou forceRefresh=true
    // Precisamos buscar (e esperar) o dado novo.
    return this.resolveFetch(key, fetcher, ttl);
  }

  /**
   * Executa a busca através do Coalesces e salva no Storage.
   */
  private async resolveFetch<T>(key: string, fetcher: () => Promise<T>, ttl: number): Promise<T> {
    return this.coalescer.execute(key, async () => {
      const value = await fetcher();
      await this.storage.set(key, value, ttl);
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
