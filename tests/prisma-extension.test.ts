import { describe, it, expect, vi } from "vitest";
import { Arca } from "../src/index";

// Isso faz o Prisma retornar o objeto de configuração puro, permitindo que o teste acesse .model.$allModels
vi.mock("@prisma/client/extension", () => ({
  Prisma: {
    defineExtension: (obj: any) => obj,
    getExtensionContext: (ctx: any) => ctx,
  },
}));

// Importação DEPOIS do mock
import { arcaPrismaExtension } from "../src/integrations/prisma";

const mockPrismaContext = {
  $name: "User",
  findUnique: vi.fn().mockResolvedValue({ id: 1, name: "Alice" }),
  findMany: vi.fn().mockResolvedValue([{ id: 1, name: "Alice" }]),
};

const createMockExtendedClient = (arca: Arca) => {
  const extension = arcaPrismaExtension(arca);

  // Agora isso funciona porque mockamos o defineExtension para retornar o input
  // @ts-ignore
  const methods = extension.model.$allModels;

  return {
    user: {
      findUniqueCached: methods.findUniqueCached.bind(mockPrismaContext),
      findManyCached: methods.findManyCached.bind(mockPrismaContext), // Corrigido o nome aqui
    },
  };
};

describe("Prisma Extension", () => {
  it("should cache findUnique calls", async () => {
    const arca = new Arca();
    const client = createMockExtendedClient(arca);
    const args = { where: { id: 1 } };

    // 1. Primeira chamada (Miss)
    const result1 = await client.user.findUniqueCached(args);
    expect(result1).toEqual({ id: 1, name: "Alice" });
    expect(mockPrismaContext.findUnique).toHaveBeenCalledTimes(1);

    // 2. Segunda chamada (Hit)
    const result2 = await client.user.findUniqueCached(args);
    expect(result2).toEqual({ id: 1, name: "Alice" });

    // O método original do Prisma NÃO deve ter sido chamado novamente
    expect(mockPrismaContext.findUnique).toHaveBeenCalledTimes(1);
  });

  it("should respect custom TTL in args", async () => {
    const arca = new Arca();
    const client = createMockExtendedClient(arca);

    const spy = vi.spyOn(arca, "get");

    // Testando com findUniqueCached
    await client.user.findUniqueCached({
      where: { active: true },
      cache: { ttl: 5000 },
    });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("prisma:User:findUnique"), // Corrigido para findUnique
      expect.any(Function),
      expect.objectContaining({ ttl: 5000 }), 
    );
  });
});
