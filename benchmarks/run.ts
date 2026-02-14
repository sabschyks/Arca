import { bench, group, run } from "mitata";
import {
  Arca,
  LocalLruAdapter,
  MemoryAdapter,
  RedisAdapter,
  TieredStorageAdapter,
} from "../src/index";

/**
 * Configurado para testar: Latência por Camada, Coalescing e Invalidação.
 * Preparado para futuras implementações (Compression/Encryption).
 */

const setupBenchmark = async () => {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const defaultTtl = 60000;

  // 1. Adapters Setup
  const redis = new RedisAdapter(redisUrl);
  const l1 = new LocalLruAdapter({ max: 5000 });
  const memory = new MemoryAdapter();

  // 2. Arca Instances (Automated Scenarios)
  const engines = {
    database: async () => {
      await new Promise((r) => setTimeout(r, 10));
      return { data: "ok" };
    }, // Simulação DB
    memory: new Arca({ storage: memory, defaultTtl }),
    redis: new Arca({ storage: redis, defaultTtl: defaultTtl }),
    hybrid: new Arca({
      storage: new TieredStorageAdapter(l1, redis),
      l1Cache: { enabled: true, maxSize: 5000 },
    }),
    defaultTtl: defaultTtl,
  };

  const KEY = "bench:universal:key";
  const TAG = "bench:tag";

  // Warm-up
  await engines.redis.get(KEY, engines.database);
  await engines.hybrid.get(KEY, engines.database);

  console.log("Arca Benchmark Starting...\n");

  // --- GRUPO 1: LATÊNCIA BRUTA POR CAMADA ---
  group("Layer Latency (Cold vs Warm)", () => {
    bench("Direct Database (10ms delay)", async () => await engines.database());

    bench("Arca L2 (Redis)", async () => {
      await engines.redis.get(KEY, engines.database);
    });

    bench("Arca L1 (Hybrid RAM)", async () => {
      await engines.hybrid.get(KEY, engines.database);
    });
  });

  // --- GRUPO 2: PROTEÇÃO DE CONCORRÊNCIA (THUNDERING HERD) ---
  group(`Concurrency: 100 simultaneous requests`, () => {
    const CONCURRENCY = 100;

    bench("Without Coalescing (Simulated)", async () => {
      await Promise.all(Array.from({ length: CONCURRENCY }).map(() => engines.database()));
    });

    bench("With Arca Coalescing", async () => {
      await Promise.all(
        Array.from({ length: CONCURRENCY }).map(() =>
          engines.hybrid.get("shared-key", engines.database, { forceRefresh: true }),
        ),
      );
    });
  });

  // --- GRUPO 3: TAGS & INVALIDAÇÃO ---
  group("Bulk Operations", () => {
    bench("Tag Association & Fetch", async () => {
      await engines.hybrid.get(KEY, engines.database, { tags: [TAG] });
    });

    bench("Surgical Invalidation (1 Tag)", async () => {
      await engines.hybrid.invalidateTags([TAG]);
    });
  });

  await run();

  // Cleanup
  await engines.hybrid.dispose();
  await engines.redis.dispose();
};

setupBenchmark().catch(console.error);
