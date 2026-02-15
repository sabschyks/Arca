import { describe, it, expect, vi } from 'vitest';
import { Arca, MemoryAdapter } from '../src/index';

// Simula espera assíncrona
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('Arca - Predictive Warmup', () => {
  it('should save hot keys on dispose and load them on startup', async () => {
    // Usamos MemoryAdapter compartilhado para simular um "Redis" persistente
    // entre duas instâncias do Arca
    const sharedStorage = new MemoryAdapter();
    const snapshotKey = 'arca:warmup_test';

    // --- FASE 1: Geração de Calor (Instância A) ---
    const arcaA = new Arca({
      storage: sharedStorage,
      warmup: { enabled: true, sourceKey: snapshotKey, limit: 10 }
    });

    // Acessa algumas chaves repetidamente
    await arcaA.get('key:hot', async () => 'data');
    await arcaA.get('key:hot', async () => 'data'); // 2 hits
    await arcaA.get('key:cold', async () => 'data'); // 1 hit

    // Desliga (deve salvar o snapshot)
    await arcaA.dispose();

    // Verifica se salvou no storage compartilhado
    const snapshot = await sharedStorage.get<string[]>(snapshotKey);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.value).toEqual(expect.arrayContaining(['key:hot', 'key:cold']));
    // 'key:hot' deve vir antes de 'key:cold' (ordenação por hits)
    expect(snapshot!.value[0]).toBe('key:hot');


    // --- FASE 2: O Renascimento (Instância B) ---
    
    // Espião para ver se ele realmente tenta buscar as chaves
    const getSpy = vi.spyOn(sharedStorage, 'get');

    const arcaB = new Arca({
      storage: sharedStorage,
      warmup: { enabled: true, sourceKey: snapshotKey }
    });

    // Espera um pouco porque o warmup roda em background no construtor
    await sleep(50);

    // Verifica se o Arca B tentou buscar as chaves 'key:hot' e 'key:cold'
    // O snapshotKey também é buscado, então teremos pelo menos 3 chamadas
    expect(getSpy).toHaveBeenCalledWith(snapshotKey);
    expect(getSpy).toHaveBeenCalledWith('key:hot');
    expect(getSpy).toHaveBeenCalledWith('key:cold');
  });
});