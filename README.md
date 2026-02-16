<div align="center">

![Arca Banner](https://placehold.co/1200x300/1a1a1a/ffffff?text=ARCA&font=montserrat)

**The High-Performance Availability Engine for Node.js**

Hybrid Tiered Caching (L1/L2) • Thundering Herd Protection • AES-256 Encryption • Predictive Warmup

[![CI](https://github.com/sabschyks/Arca/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/sabschyks/Arca/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-94%25-brightgreen)](https://github.com/sabschyks/Arca)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## 🚀 Why Arca?

Arca is not just a cache client; it is a **concurrency shield** designed for high-scale distributed systems. It sits between your application and your data sources to guarantee sub-millisecond latency and absolute data consistency.

### The "Staff Engineer" Features:

1.  **🏎️ Hybrid Tiered Caching (L1 + L2):**
    * **L1 (Local RAM):** Ultra-fast LRU cache (**~370ns** latency).
    * **L2 (Redis):** Distributed persistence.
    * **Real-time Sync:** Automatic L1 invalidation across the cluster via Redis Pub/Sub.

2.  **🛡️ Security First (AES-256-GCM):**
    * Transparently encrypts sensitive data (PII, tokens) before it touches Redis.
    * Even if your Redis is compromised, the data remains unreadable.

3.  **🔥 Predictive Warm-up:**
    * Eliminates "Cold Starts". Arca tracks your most accessed keys (using smart sampling) and automatically pre-loads them from Redis to RAM upon server restart.

4.  **⚡ Thundering Herd Protection:**
    * Uses **Request Coalescing (Singleflight)**. If 10,000 requests hit the same expired key, Arca executes the database query **only once**.
    * Includes a **Circuit Breaker** to fail fast if the database goes down, preventing cascading failures.

5.  **🏷️ Surgical Invalidation:**
    * Group keys by **Tags** (e.g., `user:1`, `dashboard:admin`) and invalidate millions of keys in a single operation.

---

## 📦 Installation

```bash
pnpm add @sabschyks/arca
# or
npm install @sabschyks/arca

```

---

## ⚡ Quick Start: The Hybrid Engine

To enable the full power of Arca (RAM + Redis + Sync), configure it with the `l1Cache` option.

```typescript
import { Arca, RedisAdapter } from '@sabschyks/arca';

const arca = new Arca({
  // L2: Distributed Storage (Redis)
  storage: new RedisAdapter('redis://localhost:6379'),
  
  // L1: Local Memory (The Speed Layer)
  l1Cache: {
    enabled: true,
    maxSize: 5000, // Top 5000 items kept in RAM
  },

  defaultTtl: 60000, // 1 minute
});

async function getUser(id: string) {
  // If 1000 requests hit this line at once, only 1 DB query runs.
  return arca.get(`user:${id}`, async () => {
    console.log('Fetching from DB...'); 
    return db.users.find(id);
  });
}

```

---

## 🛡️ Security: Encrypted Storage

Compliance ready. Enable **AES-256-GCM** encryption with zero code changes in your business logic.

```typescript
const arca = new Arca({
  storage: new RedisAdapter(process.env.REDIS_URL),
  encryption: {
    enabled: true,
    // MUST be a strong secret (32+ chars)
    secret: process.env.ARCA_ENCRYPTION_SECRET, 
  },
});

// Data in Redis will look like: { iv: '...', content: 'a8f3...', tag: '...' }
// Your app receives decrypted objects: { id: 1, email: 'ceo@company.com' }

```

---

## 🔥 Performance: Predictive Warm-up

Don't let your first users face high latency after a deploy. Arca remembers what was hot.

1. **Runtime:** Tracks key frequency (with 10% sampling to save CPU).
2. **Shutdown:** Saves the "Top N" keys snapshot to Redis.
3. **Startup:** Automatically hydrates L1 memory from the snapshot.

```typescript
const arca = new Arca({
  // ... storage config
  warmup: {
    enabled: true,
    limit: 1000, // Pre-load the top 1000 keys
  }
});

// Ensure you call dispose on shutdown to save the snapshot!
process.on('SIGTERM', async () => {
  await arca.dispose();
  process.exit(0);
});

```

---

## 🏷️ Tags & Bulk Invalidation

Invalidate entire groups of cache keys without knowing their specific IDs.

```typescript
// 1. Associate tags during fetch
await arca.get(
  'dashboard:report:2024', 
  fetchReport, 
  { tags: ['reports', 'user:admin'] }
);

// 2. Surgical Invalidation
// Removes ALL keys associated with 'reports' across L1 and L2 in the entire cluster.
await arca.invalidateTags(['reports']);

```

---

## 🔌 Integrations

### Prisma ORM

Arca provides a seamless extension for Prisma that adds explicitly cached methods.

> **Note:** Caching is **opt-in** via `findUniqueCached` and `findManyCached` to prevent accidental stale data.

```typescript
import { PrismaClient } from '@prisma/client';
import { arcaPrismaExtension } from '@sabschyks/arca';

const prisma = new PrismaClient().$extends(arcaPrismaExtension(arca));

// ❌ Standard call (No Cache)
// const user = await prisma.user.findUnique({ where: { id: 1 } });

// ✅ Cached call (L1 -> L2 -> DB)
const user = await prisma.user.findUniqueCached({
  where: { id: 1 },
  // Optional cache config per query
  cache: { ttl: 5000, force: false } 
});

```

### TypeORM

For TypeORM, use the `withCache` helper wrapper.

```typescript
import { withCache } from '@sabschyks/arca';

const users = await withCache(
  arca, 
  'all-users', 
  () => userRepository.find(), 
  { ttl: 30000 }
);

```

---

## 📊 Observability

Arca exposes internal metrics for Prometheus and logs via Pino.

```typescript
import { Arca, PrometheusMetrics } from '@sabschyks/arca';

const metrics = new PrometheusMetrics(); // Uses prom-client
const arca = new Arca({ 
  metrics,
  // ...
});

// In your metrics endpoint
app.get('/metrics', async (req, res) => {
  res.send(await metrics.register.metrics());
});

```

**Key Metrics:**

* `arca_cache_ops_total`: Hits, Misses, Stales.
* `arca_hybrid_op_total`: L1 vs L2 efficiency.
* `arca_fetch_duration_seconds`: Upstream latency.
* `arca_sync_messages_total`: Cluster synchronization traffic.

---

## ⚙️ Configuration Reference

```typescript
interface ArcaOptions {
  storage?: StorageAdapter;      // Default: MemoryAdapter
  defaultTtl?: number;           // Default: 60000ms
  
  l1Cache?: {
    enabled: boolean;
    maxSize: number;             // Max items in RAM
  };

  encryption?: {
    enabled: boolean;
    secret: string;              // 32-byte key
  };

  warmup?: {
    enabled: boolean;
    limit?: number;              // Keys to restore
  };

  circuitBreaker?: {
    failureThreshold: number;    // Errors before opening circuit
    resetTimeout: number;        // Time to retry
  };
}

```

---

## 🧪 Benchmarks

We don't guess; we measure. Arca is built for speed and validated using **[Mitata](https://github.com/evanwashere/mitata)**.

### Official Results (Ryzen 5 5500)

| Layer / Scenario | Latency (Avg) | Speedup vs DB |
| --- | --- | --- |
| **Raw Database** (Simulated 10ms) | 10.13 ms | 1x (Baseline) |
| **Arca L2** (Redis) | 48.14 µs | **200x faster** |
| **Arca L1** (Hybrid RAM) | **369.68 ns** | **27,000x faster** |

#### 🛡️ Thundering Herd Protection

Simulating **100 concurrent requests** hitting the same expired key:

* **Without Arca:** 100 DB queries executed.
* **With Arca:** **1 DB query executed.** The other 99 requests await the first one (coalesced).

### Run it yourself

```bash
# Requires a running Redis instance on localhost:6379
pnpm bench

```

---

## 👨‍💻 Maintainer

Built with ❤️ (and caffeine) by **Sabrinna Guimarães** (@sabschyks).

Licensed under **MIT**.
