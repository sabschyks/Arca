import { describe, it, expect, beforeEach, afterEach } from "vitest";
import RedisMock from 'ioredis-mock';
import { RedisAdapter } from "../src/index";

describe('RedisAdapter', () => {
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

  it('should set and get values correctly', async () => {
    const value = { id: 1, name: 'Test' }
    await adapter.set('key1', value, 1000);

    const result = await adapter.get<{ id: Number, name: string }>('key1');

    expect(result).not.toBeNull();
    expect(result?.value).toEqual(value);
    expect(result?.ttl).toBe(1000);
  });

  it('should return null for missing keys', async () => {
    const result = await adapter.get('no-existent');
    expect(result).toBeNull();
  });

  it('should handle deletion', async () => {
    await adapter.set('key-del', 'data', 100);
    await adapter.delete('key-del');

    const result = await adapter.get('key-del');
    expect(result).toBeNull();
  });

  it('should handle clear (flushdb)', async () => {
    await adapter.set('k1', 'v1', 1000);
    await adapter.set('k2', 'v2', 1000);

    await adapter.clear();

    const r1 = await adapter.get('k1');
    const r2 = await adapter.get('k2');
    
    expect(r1).toBeNull();
    expect(r2).toBeNull();
  });

  it('should treat corrupted JSON data as cache miss', async () => {
    await redis.set('corrupted', '{ "invalid": json, }'); 

    const result = await adapter.get('corrupted');

    expect(result).toBeNull();
  })
});