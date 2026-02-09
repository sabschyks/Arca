import { describe, it, expect, vi } from 'vitest';
import { Arca } from '../src/index';
import { MemoryAdapter } from '../src/adapters/memory';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Distributed Lock', () => {
  it('should prevent concurrent execution across instances using lock', async () => {
    // Shared Memory simulando o Redis compartilhado
    const sharedMemory = new MemoryAdapter();

    // Instância A (Servidor 1)
    const arcaA = new Arca({ storage: sharedMemory, defaultTtl: 1000 });
    
    // Instância B (Servidor 2)
    const arcaB = new Arca({ storage: sharedMemory, defaultTtl: 1000 });

    const fetcher = vi.fn(async () => {
      await sleep(200); // Demora 200ms
      return 'expensive-data';
    });

    // CENÁRIO:
    // A e B pedem o mesmo dado ao mesmo tempo.
    // Como compartilham o "Redis" (sharedMemory), o Lock deve funcionar.

    const [resultA, resultB] = await Promise.all([
      arcaA.get('dist-key', fetcher),
      arcaB.get('dist-key', fetcher),
    ]);

    expect(resultA).toBe('expensive-data');
    expect(resultB).toBe('expensive-data');

    // A PROVA REAL:
    // O fetcher deve ter sido chamado APENAS 1 VEZ.
    // Se fosse apenas Coalescing local, teria sido chamado 2 vezes (1 por instância).
    // O Lock impediu a segunda execução.
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('should wait for remote update via polling', async () => {
    const sharedMemory = new MemoryAdapter();
    const arca = new Arca({ storage: sharedMemory });

    // Simulamos que a chave JÁ ESTÁ lockada por "outro processo"
    await sharedMemory.acquire('poll-key', 500);

    // Simulamos que o "outro processo" escreve no banco depois de 200ms
    setTimeout(async () => {
      await sharedMemory.set('poll-key', 'remote-data', 1000);
      await sharedMemory.release('poll-key');
    }, 200);

    const fetcher = vi.fn(async () => 'local-data');

    // O Arca deve:
    // 1. Tentar pegar lock -> Falhar
    // 2. Entrar em Polling
    // 3. Achar o dado 'remote-data' escrito pelo timeout acima
    const result = await arca.get('poll-key', fetcher);

    expect(result).toBe('remote-data');
    // O nosso fetcher local NUNCA deve rodar, pois pegamos carona no remoto
    expect(fetcher).not.toHaveBeenCalled();
  });
});
