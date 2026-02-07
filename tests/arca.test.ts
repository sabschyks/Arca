import { describe, it, expect, vi, beforeEach } from "vitest";
import { Arca } from "../src/index";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('Arca Integration', () => {
  let arca: Arca;

  beforeEach(() => {
    arca = new Arca({ defaultTtl: 100 }) // TTL curto de 100ms
  });

  it('should return fresh data on first miss', async () => {
    const fetcher = vi.fn(async () => 'fresh-data');

    const result = await arca.get('key1', fetcher);

    expect(result).toBe('fresh-data');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('should serve cached data while valid', async () => {
    const fetcher = vi.fn(async () => 'fresh-data')

    await arca.get('key2', fetcher);
    const result = await arca.get('key2', fetcher); // Hit

    expect(result).toBe('fresh-data');
    expect(fetcher).toHaveBeenCalledTimes(1); // Fetcher não deve ser chamado de novo
  });

  it('should implement State-While-Revalidate correctly', async () => {
    // 1. Setup: Cache Inicial
    let counter = 0;
    const fetcher = vi.fn(async () => {
      await sleep(50); // Simula latência
      counter++;
      return `data-v${counter}`;
    });

    // Primiera chamada: MISS -> Busca v1
    const v1 = await arca.get('swr-key', fetcher);
    expect(v1).toBe('data-v1');

    // Esperar expirar o TTL 
    await sleep(150);

    // Segunda chamada: STALE -> Deve retornar v1 IMEDIATAMENTE, mas disparar update para v2
    const start = Date.now();
    const vStale = await arca.get('swr-key', fetcher);
    const duration = Date.now() - start;

    expect(vStale).toBe('data-v1'); // Retornou o dado velho
    expect(duration).toBeLessThan(10); // Retornou instantâneamente

    // Aguardar o background update terminar
    await sleep(100);

    // Terceira chamada: HIT -> Deve retornar v2 (que foi atualizado em background)
    const v2 = await arca.get('swr-key', fetcher);
    expect(v2).toBe('data-v2');

    // Verificação final: fetcher foi chamado exatamente 2 vezes (v1 e v2)
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('should handle background update failures gracefully', async () => {
    // Espionar o console.error para não poluir o terminal durante o teste
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const fetcher = vi.fn()
      .mockResolvedValueOnce('data-v1') // Primeira chamada: Sucesso
      .mockRejectedValueOnce(new Error('API Down')); // Background update: Falha

    // 1. Popula o cache
    await arca.get('error-key', fetcher);
    
    // 2. Espera expirar
    await sleep(150);

    // 3. Trigger SWR (vai retornar v1 e falhar no background)
    const val = await arca.get('error-key', fetcher);
    
    // Aguarda a promise do background rejeitar (pequeno delay para o event loop processar)
    await sleep(10);

    expect(val).toBe('data-v1'); // O usuário não viu o erro
    expect(consoleSpy).toHaveBeenCalled(); // O erro foi logado
    
    consoleSpy.mockRestore();
  });

  it('should delete keys correctly', async () => {
    const fetcher = vi.fn(async () => 'persistent-data');
    
    // Cache it
    await arca.get('del-key', fetcher);
    
    // Delete it
    await arca.delete('del-key');
    
    // Fetch again -> Should call fetcher again
    await arca.get('del-key', fetcher);
    
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});