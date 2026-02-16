import { bench, group, run } from "mitata";
import {
  Arca,
  LocalLruAdapter,
  MemoryAdapter,
  RedisAdapter,
  TieredStorageAdapter,
} from "../src/index";

/**
 * ARCA OFFICIAL BENCHMARK SUITE
 * * Environment: Node.js (V8)
 * * Tooling: Mitata (High-precision timing)
 * * Scenarios:
 * 1. Layer Latency: Comparing Raw DB vs Redis vs Arca L1 (RAM)
 * 2. Concurrency: Simulating Thundering Herd (Stampede)
 * 3. Bulk Ops: Tags and Invalidation performance
 */
const setupBenchmark = async () => {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const defaultTtl = 60000;

  // --- SETUP ADAPTERS ---
  const redisAdapter = new RedisAdapter(redisUrl);
  const l1Adapter = new LocalLruAdapter({ max: 5000 });
  const memoryAdapter = new MemoryAdapter();

  // --- SETUP ENGINES ---
  // Simula um banco de dados com 10ms de latência
  const mockDb = async () => {
    await new Promise((r) => setTimeout(r, 10));
    return { id: 1, name: "John Doe", role: "admin" };
  };

  const engines = {
    // 1. Apenas Memória (Base de comparação)
    memory: new Arca({
      storage: memoryAdapter,
      defaultTtl,
    }),

    // 2. Apenas Redis (L2)
    redis: new Arca({
      storage: redisAdapter,
      defaultTtl,
    }),

    // 3. Híbrido (L1 RAM + L2 Redis + Sync)
    hybrid: new Arca({
      // Injetamos manualmente o TieredStorage para o teste
      storage: new TieredStorageAdapter(l1Adapter, redisAdapter),
      defaultTtl,
    }),
  };

  const KEY = "bench:universal:key";
  const TAG = "bench:tag";

  // --- WARM-UP (Aquecimento) ---
  console.log("Warming up caches...");
  await engines.redis.get(KEY, mockDb);
  await engines.hybrid.get(KEY, mockDb);

  console.log("Starting Benchmark...\n");

  // --- CENÁRIO 1: LATÊNCIA DE LEITURA (READ LATENCY) ---
  // Compara o custo de ir ao DB vs Redis vs Memória Local
  group("1. Layer Latency (Read Operations)", () => {
    bench("Raw Database (Simulated 10ms)", async () => {
      await mockDb();
    });

    bench("Arca L2 (Redis Adapter)", async () => {
      await engines.redis.get(KEY, mockDb);
    });

    bench("Arca L1 (Hybrid RAM)", async () => {
      await engines.hybrid.get(KEY, mockDb);
    });
  });

  // --- CENÁRIO 2: PROTEÇÃO CONTRA STAMPEDE (CONCURRENCY) ---
  // Simula 100 requests batendo ao mesmo tempo numa chave expirada/nova
  group("2. Thundering Herd Protection (100 concurrent reqs)", () => {
    const CONCURRENCY = 100;
    const STAMPEDE_KEY = "bench:stampede:key";

    bench("Without Arca (Direct DB Hits)", async () => {
      // Isso executaria o mockDb 100 vezes reais
      await Promise.all(Array.from({ length: CONCURRENCY }).map(() => mockDb()));
    });

    bench("With Arca Coalescing", async () => {
      // Isso deve executar o mockDb APENAS 1 vez
      await Promise.all(
        Array.from({ length: CONCURRENCY }).map(() =>
          engines.hybrid.get(STAMPEDE_KEY, mockDb, { forceRefresh: true }),
        ),
      );
    });
  });

  // --- CENÁRIO 3: OPERAÇÕES EM MASSA (TAGS) ---
  group("3. Tags & Surgical Invalidation", () => {
    bench("Tag Association overhead", async () => {
      await engines.hybrid.get("bench:tag:key", mockDb, { tags: [TAG] });
    });

    bench("Invalidate Tag (Cluster Broadcast)", async () => {
      await engines.hybrid.invalidateTags([TAG]);
    });
  });

  await run();

  // Cleanup
  await engines.hybrid.dispose();
  await engines.redis.dispose();
  process.exit(0);
};

setupBenchmark().catch(console.error);
