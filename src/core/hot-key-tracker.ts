export class HotKeyTracker {
  private stats = new Map<string, number>();
  private readonly MAX_TRACKED_KEYS = 20000; // Proteção de memória

  /**
   * Registra um acesso a uma chave.
   * Se a chave já existe, incrementa.
   * Se não existe e o mapa está cheio, ignora (favorece chaves já conhecidas).
   */
  public record(key: string): void {
    if (Math.random() > 0.1) return; // 90% de chance de ignorar (Custo quase zero)

    const count = this.stats.get(key);

    if (count !== undefined) {
      this.stats.set(key, count + 1);
    } else if (this.stats.size < this.MAX_TRACKED_KEYS) {
      this.stats.set(key, 1);
    }
  }

  /**
   * Retorna as N chaves mais acessadas, ordenadas por frequência.
   */
  public getTopKeys(limit: number): string[] {
    // Converte Map para Array, ordena e fatia
    // Nota: Em cenários de altíssima carga, isso pode ser pesado.
    // Como roda apenas no shutdown (dispose), é aceitável.
    return [...this.stats.entries()]
      .sort((a, b) => b[1] - a[1]) // Ordem decrescente de hits
      .slice(0, limit)
      .map(([key]) => key);
  }

  /**
   * Limpa as estastísticas (útil para testes ou rotação).
   */
  public clear(): void {
    this.stats.clear();
  }
}
