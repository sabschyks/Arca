import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import RedisMock from "ioredis-mock";
import { RedisAdapter } from "../src/index";
import Redis from "ioredis";

describe("RedisAdapter", () => {
  let redis: any;
  let adapter: RedisAdapter;

  beforeEach(() => {
    // Cria um mock fresco para cada teste
    redis = new RedisMock();
    adapter = new RedisAdapter(redis);
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  it("should set and get values correctly", async () => {
    const value = { id: 1, name: "Test" };
    await adapter.set("key1", value, 1000);

    const result = await adapter.get<{ id: Number; name: string }>("key1");

    expect(result).not.toBeNull();
    expect(result?.value).toEqual(value);
    expect(result?.ttl).toBe(1000);
  });

  it("should initialize using connection string", () => {
    const adapter = new RedisAdapter("redis://localhost:6379");
    expect(adapter).toBeDefined();
  });

  it("should return null for missing keys", async () => {
    const result = await adapter.get("no-existent");
    expect(result).toBeNull();
  });

  it("should duplicate using stored options", () => {
    const adapter = new RedisAdapter("redis://localhost:6379");
    const dup = adapter.duplicate();
    expect(dup).toBeDefined();
  });

  it("should publish messages", async () => {
    const redis = new RedisMock();
    const adapter = new RedisAdapter(redis);

    const spy = vi.spyOn(redis, "publish");

    await adapter.publish("channel", "hello");

    expect(spy).toHaveBeenCalledWith("channel", "hello");
  });

  it('should subscribe and receive messages', async () => {
  const base = new RedisMock();
  const baseAdapter = new RedisAdapter(base);

  const subscriber = baseAdapter.duplicate();
  const publisher = baseAdapter;

  const callback = vi.fn();

  await subscriber.subscribe('test-channel', callback);
  await publisher.publish('test-channel', 'msg');

  await new Promise((r) => setTimeout(r, 10));

  expect(callback).toHaveBeenCalledWith('msg');
});

  it("should disconnect properly", async () => {
    const redis = new RedisMock();
    const adapter = new RedisAdapter(redis);

    const spy = vi.spyOn(redis, "quit");

    await adapter.disconnect();

    expect(spy).toHaveBeenCalled();
  });

  it("should handle deletion", async () => {
    await adapter.set("key-del", "data", 100);
    await adapter.delete("key-del");

    const result = await adapter.get("key-del");
    expect(result).toBeNull();
  });

  it("should handle clear (flushdb)", async () => {
    await adapter.set("k1", "v1", 1000);
    await adapter.set("k2", "v2", 1000);

    await adapter.clear();

    const r1 = await adapter.get("k1");
    const r2 = await adapter.get("k2");

    expect(r1).toBeNull();
    expect(r2).toBeNull();
  });

  it("should treat corrupted JSON data as cache miss", async () => {
    await redis.set("corrupted", '{ "invalid": json, }');

    const result = await adapter.get("corrupted");

    expect(result).toBeNull();
  });

  it("should implement distributed lock semantics correctly", async () => {
    const key = "resource-lock";

    // 1. Tenta adquirir lock (Deve conseguir)
    const acquired = await adapter.acquire(key, 1000);
    expect(acquired).toBe(true);

    // 2. Tenta adquirir o MESMO lock imediatamante (Deve falhar - simula outro processo)
    const doubleDip = await adapter.acquire(key, 1000);
    expect(doubleDip).toBe(false);

    // 3. Libera o lock
    await adapter.release(key);

    // 4. Tenta adquirir novamente (Deve conseguir agora)
    const reacquired = await adapter.acquire(key, 1000);
    expect(reacquired).toBe(true);
  });

  it("should initialize correctly when passing an existing Redis client instance", async () => {
    // Mock simples do ioredis para não conectar de verdade
    const mockClient = {
      on: vi.fn(),
      get: vi.fn(),
    } as unknown as Redis;

    const adapter = new RedisAdapter(mockClient);
    expect(adapter).toBeDefined();
  });
});
