import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Arca, MemoryAdapter } from '../src/index';

// Helper para esperar operações async de background (como o warmup inicial)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('Arca - Predictive Warmup & Sampling', () => {
  let sharedStorage: MemoryAdapter;
  const snapshotKey = 'arca:warmup_test';

  beforeEach(() => {
    sharedStorage = new MemoryAdapter();
    // Reseta todos os mocks antes de cada teste
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should save hot keys on dispose and load them on startup', async () => {
    // --- MOCK DO SAMPLING ---
    // Forçamos Math.random a retornar 0 para garantir que SEMPRE grave.
    // Assim testamos a funcionalidade de Warmup sem interferência da amostragem.
    vi.spyOn(Math, 'random').mockReturnValue(0.05);

    // --- FASE 1: INSTÂNCIA A (Gera o calor) ---
    const arcaA = new Arca({
      storage: sharedStorage,
      warmup: { enabled: true, sourceKey: snapshotKey, limit: 10 }
    });

    // Acessa keys (hot: 2x, cold: 1x)
    await arcaA.get('key:hot', async () => 'data');
    await arcaA.get('key:hot', async () => 'data');
    await arcaA.get('key:cold', async () => 'data');

    // Ao morrer, deve salvar o snapshot
    await arcaA.dispose();

    // Verificação: O snapshot foi salvo no storage?
    const snapshot = await sharedStorage.get<string[]>(snapshotKey);
    expect(snapshot?.value).toEqual(expect.arrayContaining(['key:hot', 'key:cold']));
    expect(snapshot?.value[0]).toBe('key:hot'); // A mais usada deve vir primeiro


    // --- FASE 2: INSTÂNCIA B (O Renascimento) ---
    const getSpy = vi.spyOn(sharedStorage, 'get');

    const arcaB = new Arca({
      storage: sharedStorage,
      warmup: { enabled: true, sourceKey: snapshotKey }
    });

    // Espera o processo de background do warmup rodar
    await sleep(50);

    // Verifica se o Arca B tentou buscar as chaves automaticamente no storage
    expect(getSpy).toHaveBeenCalledWith('key:hot');
    expect(getSpy).toHaveBeenCalledWith('key:cold');
  });

  it('should respect sampling rate (ignore ~90% of requests)', async () => {
    // --- TESTE DE SAMPLING ---
    // Vamos simular 10 requests.
    // 9 devem ser ignorados (random > 0.1)
    // 1 deve ser registrado (random < 0.1)
    
    const randomSpy = vi.spyOn(Math, 'random');
    
    // Configuramos o mock para retornar valores altos (ignorar) e um baixo (gravar)
    randomSpy
      .mockReturnValueOnce(0.5) // Ignora
      .mockReturnValueOnce(0.9) // Ignora
      .mockReturnValueOnce(0.05) // GRAVA!
      .mockReturnValue(0.8);    // Resto ignora

    const arca = new Arca({
      storage: sharedStorage,
      warmup: { enabled: true, sourceKey: 'arca:sampling_test' }
    });

    // Dispara 10 acessos na mesma chave
    for (let i = 0; i < 10; i++) {
      await arca.get('key:sampled', async () => 'data');
    }

    await arca.dispose();

    // Como acessamos 10 vezes, se não houvesse sampling, teríamos 10 hits.
    // Mas manipulamos o Random para gravar apenas UMA vez.
    // Porém, o HotKeyTracker conta *frequência*. Se ele gravou apenas 1 vez, a frequência será 1.
    // O teste aqui é indireto: garantimos que o Math.random foi chamado 10 vezes.
    expect(randomSpy).toHaveBeenCalledTimes(10);
    
    // Para verificar se GRAVOU mesmo, olhamos o snapshot.
    // Se o sampling tivesse ignorado TUDO (ex: random sempre 0.9), o snapshot estaria vazio ou a chave não existiria.
    const snapshot = await sharedStorage.get<string[]>('arca:sampling_test');
    expect(snapshot?.value).toContain('key:sampled');
  });
});