<div align="center">

![Arca Banner](https://placehold.co/1200x300/1a1a1a/ffffff?text=ARCA&font=montserrat)

**High-Concurrency Cache Coalescing & State Management for Node.js**

Prevent cache stampedes, eliminate duplicated fetches, and keep your APIs fast under extreme load.

[![CI](https://github.com/sabschyks/Arca/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/sabschyks/Arca/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## 🚨 The Problem: Cache Stampede

In high-scale systems, when a popular cache key expires, **hundreds or thousands of concurrent requests** may hit your database at the same time before the cache is repopulated.

This phenomenon is known as the **Cache Stampede** or **Thundering Herd** problem.

Most traditional caching libraries (e.g. simple Redis wrappers):

- Only store values
- Do not coordinate concurrent requests
- Do not protect your database under high contention

---

## 🛡️ The Solution: Arca

**Arca** is more than a cache client — it’s a **concurrency shield** for Node.js applications.

### Core Features

1. **Request Coalescing (Singleflight)**  
   If 1,000 requests ask for the same key simultaneously, Arca executes the fetcher **only once**.  
   All requests await the same Promise.

2. **Stale-While-Revalidate (SWR)**  
   Serve stale data instantly (near-zero latency) while refreshing the cache in the background.

3. **Adapter-Agnostic Storage**  
   Works out of the box with:
   - In-Memory storage (default)
   - Redis (for distributed systems)

---

## 📦 Installation

```bash
# Using pnpm (recommended)
pnpm add @sabschyks/arca

# Using npm
npm install @sabschyks/arca

# Using yarn
yarn add @sabschyks/arca
````

---

## ⚡ Quick Start

```ts
import { Arca } from '@sabschyks/arca';

// 1. Initialize Arca (defaults to in-memory storage)
const arca = new Arca({ defaultTtl: 60000 }); // 1 minute

async function getUserProfile(userId: string) {
  // 2. Wrap your expensive operation
  return arca.get(`user:${userId}`, async () => {
    console.log('Fetching from database...');
    return db.query('SELECT * FROM users WHERE id = ?', [userId]);
  });
}

// 3. Simulate concurrent traffic
Promise.all([
  getUserProfile('123'),
  getUserProfile('123'),
  getUserProfile('123'),
]);

// ✅ Result:
// The database is hit only once.
// All requests resolve with the same data.
```

---

## 🔄 Stale-While-Revalidate (SWR) Explained

Arca implements **SWR** to keep your application fast even when cached data expires.

**Example timeline:**

1. **Time 0s**
   Data is cached with a TTL of 60s.

2. **Time 61s**
   A request arrives. The cache entry is expired.

3. **Arca behavior**

   * Immediately returns the stale value (latency ≈ 0ms)
   * Triggers a background refresh (singleflight-protected)

4. **Next request**

   * Receives the fresh data

This guarantees:

* Low latency
* No traffic spikes
* No duplicated fetches

---

## 🌐 Redis Adapter (Production Ready)

For distributed environments such as **Kubernetes**, **Serverless**, or **multi-instance APIs**, Arca supports Redis.

### Install Redis client

```bash
pnpm add ioredis
```

### Configure Arca with Redis

```ts
import { Arca, RedisAdapter } from 'arca';

const arca = new Arca({
  storage: new RedisAdapter('redis://localhost:6379'),
  defaultTtl: 1000 * 60 * 5, // 5 minutes
});
```

---

## 📚 API Reference

### `new Arca(options)`

| Option       | Type             | Description                                  |
| ------------ | ---------------- | -------------------------------------------- |
| `storage`    | `StorageAdapter` | Cache backend (default: `MemoryAdapter`).     |
| `defaultTtl` | `number`         | Default TTL in milliseconds (default: 60000). |

---

### `arca.get<T>(key, fetcher, options?)`

Retrieve a value from cache or compute it safely under concurrency.

**Parameters:**

* `key: string`
  Unique cache identifier.

* `fetcher: () => Promise<T>`
  Function executed when the value is missing or stale.

* `options?:`

  * `ttl?: number` – Override TTL for this key.
  * `forceRefresh?: boolean` – Bypass cache and fetch fresh data.

---

### `arca.delete(key)`

Manually invalidate a cache entry.

```ts
arca.delete('user:123');
```

---

## 🧠 When Should You Use Arca?

Arca shines when:

* You have **high-traffic endpoints**.
* Requests often target the **same resources**.
* Cache expiration causes **database spikes**.
* You want **zero-config protection** against stampedes.

---

> Project maintained by Sabrinna Guimarães (sabschyks).