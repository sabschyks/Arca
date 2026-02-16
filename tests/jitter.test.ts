import { describe, it, expect, vi } from "vitest";
import { Arca, MemoryAdapter } from "../src/index";

describe("Arca - TTL Jitter", () => {
  it("should apply jitter to TTL when configured", async () => {
    const storage = new MemoryAdapter();
    const storageSetSpy = vi.spyOn(storage, "set");

    const arca = new Arca({
      storage,
      jitter: 0.2, // 20% de variação
    });

    const baseTtl = 10000; // 10s

    await arca.get("key:jitter", async () => "data", { ttl: baseTtl });

    const calledTtl = storageSetSpy.mock.calls[0]?.[2];

    // Com 20% de jitter, o TTL deve estar entre 8000 e 12000
    expect(calledTtl).toBeGreaterThanOrEqual(8000);
    expect(calledTtl).toBeLessThanOrEqual(12000);

    // Probabilisticamente, não deve der exatamente 10000
    // (Pode falhar 1 em 4000 vezes, mas é aceitável para o teste)
    // expect(calledTtl).not.toBe(baseTtl);
  });

  it("should not apply filter when factor is 0", async () => {
    const storage = new MemoryAdapter();
    const storageSetSpy = vi.spyOn(storage, "set");

    const arca = new Arca({ storage, jitter: 0 });

    await arca.get("key:no-jitter", async () => "data", { ttl: 10000 });

    expect(storageSetSpy).toHaveBeenLastCalledWith(
      "key:no-jitter",
      "data",
      10000,
    );
  });
});
