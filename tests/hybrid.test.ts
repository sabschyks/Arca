import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TieredStorageAdapter } from '../src/core/tiered-cache';
import { LocalLruAdapter } from '../src/adapters/local-lru';
import { RedisAdapter } from '../src/adapters/redis';

// Mock do Redis (Simula um Cluster)
// Precisamos de um Redis falso que suporte Pub/Sub em memória
// para que a Instância A consiga conversar com a Instância B no teste.

class MockRedisBus {
  private subscribers = new Map<string, Array<(msg: string) => void>>();
  private data = new Map<string, string>();

  async get(key: string) { return this.data.get(key) ? JSON.parse(this.data.get(key)!) : null; }
  async set(key: string, value: string) { this.data.set(key, value); }
  async del(key: string) { this.data.delete(key); }

  // Pub/Sub
  subscribe(channel: string, cb: (msg: string) => void) {
    if (!this.subscribers.has(channel)) this.subscribers.set(channel, []);
    this.subscribers.get(channel)!.push(cb);
  }

  publish(channel: string, msg: string) {
    // Simula rede: entrega assíncrona para não bloquear o loop atual
    setImmediate(() => {
      this.subscribers.get(channel)?.forEach(cb => cb(msg));
    });
  }
}

const createMockRedisAdapter = (bus: MockRedisBus): RedisAdapter => {
  return {
    get: async (key: string) => bus.get(key),
    set: async (key: string, value: any, ttl: number) => bus.set(key, JSON.stringify({ value, createdAt: Date.now(), ttl })),
    delete: async (key: string) => bus.del(key),
    clear: async () => {},
    acquire: async () => true,
    release: async () => {},
    duplicate: () => createMockRedisAdapter(bus),
    // CORREÇÃO: Publish agora recebe 2 argumentos conforme ioredis
    publish: async (channel: string, msg: string) => {
      bus.publish(channel, msg);
      return 1;
    },
    // CORREÇÃO: Subscribe agora recebe 2 argumentos (channel e callback)
    subscribe: async (channel: string, onMessage: (msg: string) => void) => {
      bus.subscribe(channel, onMessage);
    },
    disconnect: async () => {},
  } as unknown as RedisAdapter;
};

describe('Hybrid Cache (L1 + L2) Invalidation', () => {
  let bus: MockRedisBus;

  beforeEach(() => {
    bus = new MockRedisBus();
  });

  it('should invalidate Instance B L1 when Instance A updates', async () => {
    const instanceA_L1 = new LocalLruAdapter();
    const instanceB_L1 = new LocalLruAdapter();

    const instanceA = new TieredStorageAdapter(instanceA_L1, createMockRedisAdapter(bus));
    const instanceB = new TieredStorageAdapter(instanceB_L1, createMockRedisAdapter(bus));

    // Aguarda um pouco para garantir que as subscrições foram feitas
    await new Promise(r => setImmediate(r));

    const KEY = 'shared-key';

    // 1. Popula L1 de ambos com lixo/velho
    await instanceA_L1.set(KEY, 'old-data', 5000);
    await instanceB_L1.set(KEY, 'old-data', 5000);

    // 2. AÇÃO: Instance A atualiza o dado
    // Isso deve publicar a mensagem no bus
    await instanceA.set(KEY, 'new-data', 5000);

    // 3. ESPERA: Como o Mock usa setImmediate, precisamos esperar o próximo tick
    await new Promise(r => setTimeout(r, 50));

    // 4. VERIFICAÇÃO: L1 da Instance B deve estar limpo agora
    const valB_L1 = await instanceB_L1.get(KEY);
    expect(valB_L1).toBeNull(); 
  });
  
  // Adicione este para cobrir o ignore de SELF
  it('should ignore messages from SELF', async () => {
    const l1 = new LocalLruAdapter();
    const tiered = new TieredStorageAdapter(l1, createMockRedisAdapter(bus));
    const spyL1 = vi.spyOn(l1, 'delete');

    await tiered.delete('my-key');
    
    await new Promise(r => setTimeout(r, 50));

    // Deve ter sido chamado apenas 1 vez (pelo comando direto, não pelo PubSub loopback)
    expect(spyL1).toHaveBeenCalledTimes(1);
  });
});