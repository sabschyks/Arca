import type { LocalLruAdapter } from "../adapters/local-lru";
import type { RedisAdapter } from "../adapters/redis";
import type { CacheEntry, Metrics, StorageAdapter } from "../types";

export class TieredStorageAdapter implements StorageAdapter {
  private l1: LocalLruAdapter;
  private l2: RedisAdapter;
  private subscriber?: RedisAdapter;
  private channelName = "arca:sync:invalidate";
  private instanceId: string;
  private metrics?: Metrics;

  constructor(l1: LocalLruAdapter, l2: RedisAdapter, metrics?: Metrics) {
    this.l1 = l1;
    this.l2 = l2;
    this.instanceId = Math.random().toString(36).substring(7);
    this.metrics = metrics;

    // Inicia a sincronização
    this.setupPubSub().catch(console.error);
  }

  private async setupPubSub() {
    // Cria uma conexão dedicada para ouvir eventos de invalidação
    this.subscriber = this.l2.duplicate();

    await this.subscriber.subscribe(this.channelName, (msg) => {
      this.metrics?.increment('arca_sync_messages_total', { direction: 'received' });

      try {
        const payload = JSON.parse(msg);

        if (payload.originId === this.instanceId) return;

        // Se a mensagem veio de outra instância, limpamos o L1
        if (payload.origin !== this.instanceId) {
          if (payload.action === "delete") {
            this.l1.delete(payload.key).catch(console.error);
          } else if (payload.action === "clear") {
            this.l1.clear().catch(console.error);
          }
        }
      } catch (_err) {}
    });
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    // 1. Tenta L1 (Memória - Nanossegundos)
    const local = await this.l1.get<T>(key);
    if (local) { 
      return local; // Retorno imediato
    }
    
    // 2. Tenta L2 (Redis - Milissegundos)
    const remote = await this.l2.get<T>(key);
    if (remote) {
      this.metrics?.increment('arca_hybric_op_total', { layer: 'l1', status: 'hit' })

      // "Cache Fill": Se achou no Redis, salva na memória local
      const age = Date.now() - remote.createdAt;
      const remainingTtl = remote.ttl - age;

      // Só salva no L1 se ainda tiver tempo de vida útil
      if (remainingTtl > 0) {
        // Limitamos o TTL do L1 para não ser maior que o do Redis
        await this.l1.set(key, remote.value, remainingTtl);
      }
      return remote;
    }
    this.metrics?.increment('arca_hybric_op_total', { layer: 'l1', status: 'miss' })

    return null;
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    // Salva em ambos
    // O L1 é síncrono, então é instantâneo. O L2 é async.
    await Promise.all([this.l1.set(key, value, ttl), this.l2.set(key, value, ttl)]);

    // Avisa o cluster para limpar seus L1s
    this.publishInvalidation("delete", key);
  }

  async delete(key: string): Promise<void> {
    await Promise.all([this.l1.delete(key), this.l2.delete(key)]);
    this.publishInvalidation("delete", key);
  }

  async clear(): Promise<void> {
    await Promise.all([this.l1.clear(), this.l2.clear()]);
    this.publishInvalidation("clear", "");
  }

  private publishInvalidation(action: "delete" | "clear", key: string) {
    this.metrics?.increment('arca_async_messages_total', { direction: 'sent' });

    const payload = JSON.stringify({
      action,
      key,
      originId: this.instanceId,
    });

    // Fire and Forget: não esperamos a pubilcação para retornar
    this.l2.publish(this.channelName, payload).catch((err) => {
      this.metrics?.increment('arca_sync_errors_total', { op: 'publish' });
    });
  }

  // Método auxiliar para fechar conexões (importante para testes)
  public async disconnect(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.disconnect();
    }
  }
}
