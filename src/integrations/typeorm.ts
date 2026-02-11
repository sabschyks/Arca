import type { FindManyOptions, FindOneOptions, ObjectLiteral, Repository } from "typeorm";
import type { Arca } from "../index";

// Tipo auxiliar para injetar nossas opções de cache
type ArcaCacheOptions = {
  ttl?: number;
  forceRefresh?: boolean;
};

// Estendemos as opções originais to TypeORM
type CachedFindOneOptions<T> = FindOneOptions<T> & { arca?: ArcaCacheOptions };
type CachedFindManyOptions<T> = FindManyOptions<T> & { arca?: ArcaCacheOptions };

/**
 * Wrapper para Repositórios do TypeORM.
 * Adiciona caching automático métodos de leitura.
 */
export class ArcaTypeORMRepository<Entity extends ObjectLiteral> {
  constructor(
    private readonly repository: Repository<Entity>,
    private readonly arca: Arca,
    private readonly modelName: string,
  ) {}

  /**
   * Wrapper para findOne
   */
  async findOne(options: CachedFindOneOptions<Entity>): Promise<Entity | null> {
    const { arca: cacheOptions, ...queryOptions } = options;

    // Se não passar opções de cache, comporta-se como repositório normal (mas ainda passa pelo Arca?)
    // Decisão de Design: Se usar nossa classe, assume-se que quer cache por Default?
    // Vamos assumirt que sim, usando TTL padrão do Arca.

    const key = `typeorm:${this.modelName}:findOne:${JSON.stringify(queryOptions)}`;

    return this.arca.get(
      key,
      () => this.repository.findOne(queryOptions as FindOneOptions<Entity>),

      {
        ttl: cacheOptions?.ttl,
        forceRefresh: cacheOptions?.forceRefresh,
      },
    );
  }

  /**
   * Wrapper para find (que retorna array - findMany no Prisma)
   */
  async find(options?: CachedFindManyOptions<Entity>): Promise<Entity[]> {
    const { arca: cacheOptions, ...queryOptions } = options || {};

    const key = `typeorm:${this.modelName}:find:${JSON.stringify(queryOptions)}`;

    return this.arca.get(key, () => this.repository.find(queryOptions as FindManyOptions<Entity>), {
      ttl: cacheOptions?.ttl,
      forceRefresh: cacheOptions?.forceRefresh,
    });
  }

  /**
   * Atalho para criar query builder (sem cache automático, pois é complexo)
   * Apenas repassa para o origina.
   */
  createQueryBuilder(alias?: string) {
    return this.repository.createQueryBuilder(alias);
  }
}

/**
 * Helper factory para facilitar a criação
 */
export const createArcaTypeORM = <Entity extends ObjectLiteral>(
  repository: Repository<Entity>,
  arca: Arca,
) => {
  return new ArcaTypeORMRepository(repository, arca, repository.metadata.name);
};
