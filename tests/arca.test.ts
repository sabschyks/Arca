import { describe, it, expect, vi, beforeEach } from "vitest";
import { Arca } from "../src/index";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Arca Integration", () => {
  let arca: Arca;

  beforeEach(() => {
    // Aumentamos o TTL para 500ms para evitar flakiness nos testes
    arca = new Arca({ defaultTtl: 500 });
  });

  it("should return fresh data on first miss", async () => {
    const fetcher = vi.fn(async () => "fresh-data");

    const result = await arca.get("key1", fetcher);

    expect(result).toBe("fresh-data");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("should serve cached data while valid", async () => {
    const fetcher = vi.fn(async () => "fresh-data");

    await arca.get("key2", fetcher); // Cache it
    const result = await arca.get("key2", fetcher); // Hit

    expect(result).toBe("fresh-data");
    expect(fetcher).toHaveBeenCalledTimes(1); // Fetcher não deve ser chamado de novo
  });

  it("should implement Stale-While-Revalidate correctly", async () => {
    // Setup com TTL curto específico para este teste
    const swrArca = new Arca({ defaultTtl: 100 });
    let counter = 0;

    const fetcher = vi.fn(async () => {
      await sleep(50);
      counter++;
      return `data-v${counter}`;
    });

    // 1. MISS -> Busca v1
    const v1 = await swrArca.get("swr-key", fetcher);
    expect(v1).toBe("data-v1");

    // 2. Esperar expirar
    await sleep(150);

    // 3. STALE -> Retorna v1 imediatamente
    const start = Date.now();
    const vStale = await swrArca.get("swr-key", fetcher);
    const duration = Date.now() - start;

    expect(vStale).toBe("data-v1");
    expect(duration).toBeLessThan(15);

    // 4. Aguardar background update
    await sleep(100);

    // 5. HIT -> Retorna v2
    const v2 = await swrArca.get("swr-key", fetcher);
    expect(v2).toBe("data-v2");

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("should handle background update failures gracefully", async () => {
    // CORREÇÃO: Ouvir o evento 'error' em vez de mockar console.error
    const onError = vi.fn();
    arca.on("error", onError);

    const fetcher = vi
      .fn()
      .mockResolvedValueOnce("data-v1") // Sucesso inicial
      .mockRejectedValueOnce(new Error("API Down")); // Falha no background

    // 1. Popula o cache
    await arca.get("error-key", fetcher);

    // 2. Força expiração manual (hack para teste rápido)
    // @ts-ignore
    const entry = await arca["storage"].get("error-key");
    if (entry && typeof entry === "object" && "value" in entry) {
      // @ts-ignore
      await arca["storage"].set("error-key", entry.value, -1);
    }

    // 3. Trigger SWR (vai retornar v1 e falhar no background)
    const val = await arca.get("error-key", fetcher);

    // Aguarda o event loop processar a rejeição
    await sleep(20);

    expect(val).toBe("data-v1"); // Usuário protegido
    expect(onError).toHaveBeenCalled(); // Evento emitido

    // Verificamos se o erro passado é o correto
    const errorArg = onError.mock.calls[0]?.[0];
    expect(errorArg.message).toBe("API Down");
  });

  it("should delete keys correctly", async () => {
    const fetcher = vi.fn(async () => "persistent-data");
    await arca.get("del-key", fetcher);
    await arca.delete("del-key");
    await arca.get("del-key", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});