/**
 * Implementação de Coalescência de Requisições.
 * Também conhecido como padrão "SingleFlight".
 * * Objetivo: Eliminar requisições pendentes idênticas duplicadas para evitar
 * problemas de "Thundering Herd" / "Cache Stampede".
 */
export class Coalescer {
  // Armazena as promessas EM VOO (in-flight).
  // Chave -> Promise<Pending>
  private inflight = new Map<string, Promise<unknown>>();

  /**
   * Executa uma função assíncrona garantindo que, para uma mesma chave,
   * apenas uma execução real ocorra simultaneamente.
   * * @param key Identificador único da operação (ex: 'GET:/api/users/1')
   * @param fn A função que busca o dado real (ex: consulta ao DB)
   */
  public async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // 1. Se já existe uma promessa pendente para essa chave, retorne-a.
    // Isso é o "Coalescing" acontecendo.
    const existing = this.inflight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    // 2. Se não existe, criamos a promessa.
    const promise = fn()
      .then((result) => {
        // Sucesso: Retorna o valor.
        return result;
      })
      .catch((error) => {
        // Erro: Propaga o erro.
        throw error;
      })
      .finally(() => {
        // 3. Limpeza.
        // Independente de sucesso ou falha, removemos a promessa do mapa.
        // Se não fizermos isso, futuras chamadas receberiam uma promessa já resolvida (stale)
        // ou nunca mais executariam a função novamente (memory leak/deadlock lógico).
        this.inflight.delete(key);
      });

    this.inflight.set(key, promise);

    return promise as Promise<T>;
  }

  /**
   * Retorna quantas requisições estão pendentes no momento.
   * Útil para métricas e observabilidade.
   */
  public getInflightCount(): number {
    return this.inflight.size;
  }
}
