import { describe, it, expect, vi } from "vitest";
import { Arca } from "../src/index";
import { MemoryAdapter } from "../src/adapters/memory";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Distributed Lock", () => {
  it("should prevent concurrent execution across instances using lock", async () => {
    // Shared Memory simulando o Redis compartilhado
    const sharedMemory = new MemoryAdapter();

    // Instância A (Servidor 1)
    const arcaA = new Arca({ storage: sharedMemory, defaultTtl: 1000 });

    // Instância B (Servidor 2)
    const arcaB = new Arca({ storage: sharedMemory, defaultTtl: 1000 });

    const fetcher = vi.fn(async () => {
      await sleep(200); // Demora 200ms
      return "expensive-data";
    });

    // CENÁRIO:
    // A e B pedem o mesmo dado ao mesmo tempo.
    // Como compartilham o "Redis" (sharedMemory), o Lock deve funcionar.

    const [resultA, resultB] = await Promise.all([
      arcaA.get("dist-key", fetcher),
      arcaB.get("dist-key", fetcher),
    ]);

    expect(resultA).toBe("expensive-data");
    expect(resultB).toBe("expensive-data");

    // A PROVA REAL:
    // O fetcher deve ter sido chamado APENAS 1 VEZ.
    // Se fosse apenas Coalescing local, teria sido chamado 2 vezes (1 por instância).
    // O Lock impediu a segunda execução.
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("should wait for remote update via polling", async () => {
    const sharedMemory = new MemoryAdapter();
    const arca = new Arca({ storage: sharedMemory });

    // Simulamos que a chave JÁ ESTÁ lockada por "outro processo"
    await sharedMemory.acquire("poll-key", 500);

    // Simulamos que o "outro processo" escreve no banco depois de 200ms
    setTimeout(async () => {
      await sharedMemory.set("poll-key", "remote-data", 1000);
      await sharedMemory.release("poll-key");
    }, 200);

    const fetcher = vi.fn(async () => "local-data");

    // O Arca deve:
    // 1. Tentar pegar lock -> Falhar
    // 2. Entrar em Polling
    // 3. Achar o dado 'remote-data' escrito pelo timeout acima
    const result = await arca.get("poll-key", fetcher);

    expect(result).toBe("remote-data");
    // O nosso fetcher local NUNCA deve rodar, pois pegamos carona no remoto
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('should timeout and throw error if remote update never happens', async () => {
    vi.useFakeTimers(); // Usar Fake Timers para não esperar 3 segundos reais

    // Mock de Lock que diz "Ocupado" (false) sempre
    const busyLockAdapter = {
      get: vi.fn().mockResolvedValue(null), // Cache vazio
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      acquire: vi.fn().mockResolvedValue(false), // Sempre ocupado
      release: vi.fn(),
    };

    const arca = new Arca({ storage: busyLockAdapter, lock: busyLockAdapter });
    const errorSpy = vi.fn();
    arca.on("error", errorSpy);

    // Criamos a promise mas NÃO damos await nela ainda
    const promise = arca.get("key", async () => "data");

    // Loop para avançar os timers 30 vezes (o maxRetries do polling)
    for (let i = 0; i < 35; i++) {
      vi.advanceTimersByTime(100);
      // IMPORTANTE: Isso permite que as promessas internas do 'waitForRemoteUpdate' resolvam
      await vi.advanceTimersByTimeAsync(0);
    }

    await promise;

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Lock wait timeout"),
      }),
    );

    vi.useRealTimers();
  });

});
