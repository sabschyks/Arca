import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Arca } from '../src/index';

describe('Circuit Breaker Resilience', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle the full lifecycle: Closed -> Open -> Half-Open -> Closed', async () => {
    // 1. Setup: Storage que falha
    const failingStorage = {
      get: vi.fn().mockRejectedValue(new Error('Redis Down')),
      set: vi.fn().mockRejectedValue(new Error('Redis Down')), 
      delete: vi.fn(),
      clear: vi.fn(),
    };

    const arca = new Arca({
      storage: failingStorage,
      // AUMENTAMOS PARA 3: 
      // Req 1 falha Get + Set (2 erros). Circuito ainda fecha.
      // Req 2 falha Get (3 erros). Circuito abre.
      circuitBreaker: { failureThreshold: 3, resetTimeout: 1000 },
      logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }
    });

    arca.on('error', () => {});

    const fetcher = vi.fn().mockResolvedValue('db-data');

    // --- FASE 1: FALHAS (Circuit CLOSED -> OPEN) ---
    
    // Erro 1 (Get falha + Set falha = 2 Failures)
    await arca.get('key', fetcher);
    
    // Erro 2 (Get falha = 3 Failures -> OPEN)
    await arca.get('key', fetcher);
    
    expect(failingStorage.get).toHaveBeenCalledTimes(2);

    // Tentativa 3: O Circuito deve estar ABERTO. Não chama o storage.
    await arca.get('key', fetcher);
    expect(failingStorage.get).toHaveBeenCalledTimes(2); // Mantém 2 (Bypass)
    expect(fetcher).toHaveBeenCalledTimes(3); 

    // --- FASE 2: RECUPERAÇÃO (Circuit OPEN -> HALF-OPEN) ---

    // Avançamos o tempo em 1.1 segundos
    vi.advanceTimersByTime(1100);

    // Configura o mock para voltar a funcionar AGORA
    // Importante: mockamos o set também para sucesso, para fechar o circuito depois
    failingStorage.get.mockResolvedValueOnce({ value: 'cached-data', createdAt: Date.now(), ttl: 5000 });
    failingStorage.set.mockResolvedValue(undefined); 

    const result = await arca.get('key', fetcher);
    
    // Deve ter tentado ir ao storage (Probe request)
    expect(failingStorage.get).toHaveBeenCalledTimes(3); 
    expect(result).toBe('cached-data');

    // --- FASE 3: ESTABILIDADE (Circuit HALF-OPEN -> CLOSED) ---
    
    // Como a operação acima teve sucesso (Get ok), o circuito deve ter fechado.
    // Próxima chamada deve ir ao storage normalmente.
    await arca.get('key', fetcher);
    expect(failingStorage.get).toHaveBeenCalledTimes(4);
  });
});