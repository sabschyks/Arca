import { describe, it, expect, vi } from 'vitest';
import { Coalescer } from '../src/core/coalescer';

// Helper para simular latência
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Coalescer (Singleflight Pattern)', () => {
  it('should deduplicate simultaneous requests', async () => {
    const coalescer = new Coalescer();
    
    // Simula uma chamada cara ao banco de dados (100ms)
    // Usamos vi.fn() para contar quantas vezes ela foi chamada realmente
    const mockDatabaseCall = vi.fn(async () => {
      await sleep(100);
      return 'data-from-db';
    });

    // Dispara 10 requisições SIMULTÂNEAS (Promise.all)
    const promises = Array.from({ length: 10 }).map(() => 
      coalescer.execute('user:123', mockDatabaseCall)
    );

    // Aguarda todas resolverem
    const results = await Promise.all(promises);

    // VERIFICAÇÕES

    // 1. Todas as 10 promessas devem ter retornado o valor correto
    expect(results).toHaveLength(10);
    results.forEach((res) => expect(res).toBe('data-from-db'));

    // 2. A função original deve ter sido chamada APENAS UMA VEZ
    // Isso prova que economizamos 9 chamadas ao banco
    expect(mockDatabaseCall).toHaveBeenCalledTimes(1);
    
    // 3. O mapa de voo deve estar vazio após a execução
    expect(coalescer.getInflightCount()).toBe(0);
  });

  it('should handle errors correctly and clean up', async () => {
    const coalescer = new Coalescer();
    const errorCall = vi.fn(async () => {
      await sleep(50);
      throw new Error('Database connection failed');
    });

    // Dispara 2 chamadas que vão falhar
    const p1 = coalescer.execute('error:key', errorCall);
    const p2 = coalescer.execute('error:key', errorCall);

    // Ambas devem rejeitar com o mesmo erro
    await expect(p1).rejects.toThrow('Database connection failed');
    await expect(p2).rejects.toThrow('Database connection failed');

    // Deve ter tentado apenas 1 vez (mesmo com erro)
    expect(errorCall).toHaveBeenCalledTimes(1);

    // CRUCIAL: Deve ter limpado o mapa para permitir novas tentativas
    expect(coalescer.getInflightCount()).toBe(0);
  });

  it('should execute again for sequential calls (non-overlapping)', async () => {
    const coalescer = new Coalescer();
    const mockCall = vi.fn(async () => 'data');

    // Chamada 1
    await coalescer.execute('key', mockCall);
    
    // Chamada 2 (só ocorre depois da 1 terminar)
    await coalescer.execute('key', mockCall);

    // Como não foram simultâneas, deve ter chamado 2 vezes
    expect(mockCall).toHaveBeenCalledTimes(2);
  });
});
