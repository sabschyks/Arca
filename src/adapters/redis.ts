import Redis, { type Redis as RedisClient, type RedisOptions } from "ioredis";
import type { CacheEntry, LockAdapter, StorageAdapter } from "../types";

export class RedisAdapter implements StorageAdapter, LockAdapter {
  private client: RedisClient;
  private options?: RedisOptions; // Guardamos options para poder duplicar

  constructor(
    connectionStringOrClient: string | RedisClient,
    options?: RedisOptions,
  ) {
    const defaultOptions: RedisOptions = {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      showFriendlyErrorStack: false,
    };

    if (typeof connectionStringOrClient === "string") {
      this.options = { ...defaultOptions, ...options };
      this.client = new Redis(connectionStringOrClient, this.options);
    } else {
      this.client = connectionStringOrClient;
      this.options = options; // Pode ser undefined se passou cliente pronto
    }

    this.client.on("error", (err) => {
      // Silencia erros globais para evitar crash do Node
    });
  }

  // Métodos de Storage (Padrão)
  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const res = await this.client.get(key);
    if (!res) return null;

    try {
      return JSON.parse(res);
    } catch (_err) {
      // Se o JSON estiver corrompido, tratamos como MISS.
      // O Arca vai do lado fresco no banco de sobrescrever no Redis.
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    const entry: CacheEntry<T> = { value, createdAt: Date.now(), ttl };
    // 'PX' define TTL em milissegundos
    await this.client.set(key, JSON.stringify(entry), "PX", ttl);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async clear(): Promise<void> {
    await this.client.flushdb();
  }

  // Métodos de Lock
  async acquire(key: string, ttl: number): Promise<boolean> {
    const lockKey = `lock:${key}`;
    const acquired = await this.client.set(lockKey, "1", "PX", ttl, "NX");
    return acquired === "OK";
  }

  async release(key: string): Promise<void> {
    await this.client.del(`lock:${key}`);
  }

  /**
   * Cria uma NOVA conexão (independente) para ser usada como Subscriber.
   * O Redis bloqueia conexões em modo subscribe, então não podemos usar a principal.
   */
  public duplicate(): RedisAdapter {
    // Para o Subscriber, precisamos habilitar a OfflineQueue.
    // Isso evita o erro "Stream isn't writeable" se tentarmos dar .subscribe()
    // enquanto a conexão ainda está sendo estabelecida.
    const overrides = { enableOfflineQueue: true };

    if (this.options) {
      // Se temos as opções originais, criamos um novo cliente com override
      return new RedisAdapter(new Redis({ ...this.options, ...overrides }));
    }

    // Se recebemos uma instância pronta, usamos o duplicate do ioredis com override
    return new RedisAdapter(this.client.duplicate(overrides));
  }

  /**
   * Publica uma mensagem em um canal.
   */
  public async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  /**
   * Entra em modo Subscriber e ouve mensagens.
   * ATENÇÃO: Esta instância ficará bloqueada apenas ouvindo mensagens.
   */
  public async subscribe(
    channel: string,
    onMessage: (message: string) => void,
  ): Promise<void> {
    await this.client.subscribe(channel);

    this.client.on("message", (chn, msg) => {
      if (chn === channel) {
        onMessage(msg);
      }
    });
  }

  /**
   * Encerra a conexão com o Redis de forma limpa.
   */
  public async disconnect(): Promise<void> {
    if (this.client.status !== "end") {
      await this.client.quit();
    }
  }
}
