import { Prisma } from "@prisma/client/extension";
import type { Arca } from "../index";

/**
 * Cria uma extensão do Prisma que usa o Arca para caching automático.
 */
export const arcaPrismaExtension = (arca: Arca) => {
  return Prisma.defineExtension({
    name: "arca-cache",
    model: {
      $allModels: {
        /**
         * Método injetado em todos os models (ex: prisma.user.findUniqueCached)
         * Usamos um nome explícito para evitar conflitos e deixar claro que é cacheado.
         */
        async findUniqueCached<T, A>(
          this: T,
          args: Prisma.Exact<A, Prisma.Args<T, "findUnique">> & {
            cache?: { ttl?: number; force?: boolean };
          },
        ): Promise<Prisma.Result<T, A, "findUnique"> | null> {
          const context = Prisma.getExtensionContext(this);
          const modelName = (context as any).$name; // Ex: 'User'

          // Separa opções de cache dos argumentos do Prisma
          const { cache, ...queryArgs } = args as any;
          const ttl = cache?.ttl;
          const force = cache?.force;

          // Gera uma chave determinística: "prisma:Model:findUnique:JSON_ARGS"
          // NOTA: Em produção real, idealmente usaríamos 'fast-json-stable-stringfy'
          // para garantir que {a:1, b:2} gere a mesma string que {b:2, a:1}
          const key = `prisma:${modelName}:findUnique:${JSON.stringify(queryArgs)}`;

          // Usa o Arca para envolver a chamada original
          return arca.get(
            key,
            async () => {
              // Chama o findUnique original do contexto do Prisma
              return (context as any).findUnique(queryArgs);
            },
            { ttl, forceRefresh: force },
          );
        },

        // Podemos adicionar findFirstCached, findManyCached, etc.
        // Por brevidade, implementaremos o findMany também.
        async findManyCached<T, A>(
          this: T,
          args: Prisma.Exact<A, Prisma.Args<T, "findMany">> & {
            cache?: { ttl?: number; force?: boolean };
          },
        ): Promise<Prisma.Result<T, A, "findMany">> {
          const context = Prisma.getExtensionContext(this);
          const modelName = (context as any).$name;
          const { cache, ...queryArgs } = args as any;
          const ttl = cache?.ttl;
          const force = cache?.force;

          const key = `prisma:${modelName}:findMany:${JSON.stringify(queryArgs)}`;

          return arca.get(
            key,
            async () => {
              return (context as any).findMany(queryArgs);
            },
            { ttl, forceRefresh: force },
          );
        },
      },
    },
  });
};
