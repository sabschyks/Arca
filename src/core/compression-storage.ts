import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import type { CacheEntry, StorageAdapter } from "../types";

const compress = promisify(gzip);
const decompress = promisify(gunzip);

export class CompressionStorageAdapter implements StorageAdapter {
  private wrapped: StorageAdapter;
  private threshold: number;

  constructor(wrapped: StorageAdapter, threshold = 1024) {
    this.wrapped = wrapped;
    this.threshold = threshold;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const entry = await this.wrapped.get<any>(key);
    if (!entry) return null;

    // Verifica se o dado está comprimido (marcado por um Buffer)
    if (Buffer.isBuffer(entry.value)) {
      try {
        const decompressed = await decompress(entry.value);
        return {
          ...entry,
          value: JSON.parse(decompressed.toString()),
        };
      } catch {
        return null; // Falha na compressão
      }
    }

    return entry;
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    const stringData = JSON.stringify(value);

    // Só comprime se for maior que threshold
    if (Buffer.byteLength(stringData) > this.threshold) {
      const compressed = await compress(stringData);
      await this.wrapped.set(key, compressed, ttl);
    } else {
      await this.wrapped.set(key, value, ttl);
    }
  }

  async delete(key: string): Promise<void> {
    await this.wrapped.delete(key);
  }
  async clear(): Promise<void> {
    await this.wrapped.clear();
  }
}
