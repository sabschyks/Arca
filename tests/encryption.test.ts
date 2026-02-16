import { describe, it, expect, vi } from "vitest";
import { Arca, MemoryAdapter } from "../src/index";
import { EncryptedStorageAdapter } from "../src/core/encrypted-storage";

describe("Arca - Encryption Layer", () => {
  // --- Testes de Lógica de Criptografia (Existentes) ---

  it("should encrypt data in storage but return decrypted data", async () => {
    const rawStorage = new MemoryAdapter();
    const storageSpy = vi.spyOn(rawStorage, "set");

    const arca = new Arca({
      storage: rawStorage,
      encryption: {
        enabled: true,
        secret: "my-super-secret-password-123",
      },
    });

    const sensitiveData = { creditCard: "4111-xxxx-xxxx-1234", cvV: 123 };
    const key = "user:billing";

    await arca.get(key, async () => sensitiveData);

    const [[, storedValue]] = storageSpy.mock.calls as [
      [string, { iv: string; content: string; tag: string }, number],
    ];

    expect(storedValue).not.toEqual(sensitiveData);
    expect(storedValue).toHaveProperty("iv");
    expect(storedValue).toHaveProperty("tag");
    expect(storedValue).toHaveProperty("content");
    expect(typeof storedValue.content).toBe("string");

    const retrieved = await arca.get(key, async () => ({ creditCard: "fail" }));
    expect(retrieved).toEqual(sensitiveData);
  });

  it("should return null (Miss) if decryption fails", async () => {
    const rawStorage = new MemoryAdapter();
    const arcaA = new Arca({
      storage: rawStorage,
      encryption: { enabled: true, secret: "key-X" },
    });
    await arcaA.get("key", async () => "secret-data");

    const arcaB = new Arca({
      storage: rawStorage,
      encryption: { enabled: true, secret: "key-Y" },
    });

    const fetcherSpy = vi.fn().mockResolvedValue("new-data");
    const result = await arcaB.get("key", fetcherSpy);

    expect(result).toBe("new-data");
  });

  // --- NOVOS TESTES DE COBERTURA (Proxy & Edge Cases) ---

  it("should return null directly if key does not exist (Coverage for line 28)", async () => {
    const rawStorage = new MemoryAdapter();
    const adapter = new EncryptedStorageAdapter(rawStorage, "secret");
    
    // Chama o get diretamente no adaptador para garantir que retorna null
    const result = await adapter.get("non-existent-key");
    expect(result).toBeNull();
  });

  it("should proxy auxiliary methods to wrapped storage (Coverage for lines 88-118)", async () => {
    // Mock de um storage completo (como o RedisAdapter)
    const mockWrapped = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      disconnect: vi.fn(),
      addKeysToTag: vi.fn(),
      getKeysByTag: vi.fn().mockResolvedValue(["k1"]),
      deleteTag: vi.fn(),
    };

    const adapter = new EncryptedStorageAdapter(
      mockWrapped as any,
      "secret-key"
    );

    // 1. Tags
    await adapter.addKeysToTag("tag1", ["key1"]);
    expect(mockWrapped.addKeysToTag).toHaveBeenCalledWith("tag1", ["key1"]);

    const keys = await adapter.getKeysByTag("tag1");
    expect(mockWrapped.getKeysByTag).toHaveBeenCalledWith("tag1");
    expect(keys).toEqual(["k1"]);

    await adapter.deleteTag("tag1");
    expect(mockWrapped.deleteTag).toHaveBeenCalledWith("tag1");

    // 2. Lifecycle
    await adapter.disconnect();
    expect(mockWrapped.disconnect).toHaveBeenCalled();

    await adapter.clear();
    expect(mockWrapped.clear).toHaveBeenCalled();
  });

  it("should handle missing proxy methods gracefully", async () => {
    // Storage simples que NÃO tem métodos de tag/disconnect
    const minimalStorage = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
    };

    const adapter = new EncryptedStorageAdapter(
      minimalStorage as any,
      "secret-key"
    );

    // Não deve quebrar se o método não existir
    await adapter.addKeysToTag("t", ["k"]);
    await adapter.getKeysByTag("t");
    await adapter.deleteTag("t");
    await adapter.disconnect(); // Safe check test
  });
});