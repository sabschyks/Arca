
import { describe, it, expect, vi } from 'vitest';
import { Arca } from '../src/index';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Arca Observability', () => {
  it('should emit hit, miss, and stale events', async () => {
    // TTL seguro de 200ms
    const arca = new Arca({ defaultTtl: 200 });
    const fetcher = vi.fn(async () => 'data');
    
    const onHit = vi.fn();
    const onMiss = vi.fn();
    const onStale = vi.fn();

    arca.on('hit', onHit);
    arca.on('miss', onMiss);
    arca.on('stale', onStale);

    // 1. First Call: MISS
    await arca.get('key', fetcher);
    expect(onMiss).toHaveBeenCalledWith('key');
    expect(onHit).not.toHaveBeenCalled();

    // 2. Second Call: HIT (Dentro dos 200ms)
    await arca.get('key', fetcher);
    expect(onHit).toHaveBeenCalledWith('key');

    // 3. Wait Expiry
    await sleep(250);

    // 4. Third Call: STALE
    await arca.get('key', fetcher);
    expect(onStale).toHaveBeenCalledWith('key');
  });

  it('should emit error when storage fails', async () => {
    const arca = new Arca();
    const onError = vi.fn();
    arca.on('error', onError);

    // Mock storage to fail hard
    // @ts-ignore
    arca['storage'] = {
      get: async () => { throw new Error('Redis Died'); },
      set: async () => {}, // não importa
    };

    const fetcher = vi.fn(async () => 'fallback');

    // Deve retornar o fallback e emitir erro, sem quebrar a aplicação
    const val = await arca.get('fail-key', fetcher);
    
    expect(val).toBe('fallback');
    expect(onError).toHaveBeenCalled();
  });
});