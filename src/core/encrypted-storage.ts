import crypto, { type CipherGCM, type DecipherGCM } from "node:crypto";
import type { CacheEntry, StorageAdapter } from "../types";

export class EncryptedStorageAdapter implements StorageAdapter {
  private wrapped: StorageAdapter;
  private key: Buffer;
  private readonly algorithm: crypto.CipherGCMTypes = "aes-256-gcm";

  constructor(wrapped: StorageAdapter, secret: string) {
    this.wrapped = wrapped;
    // Garante que a chave semrpe tem 32 bytes (256 bits) usando SHA-256
    this.key = crypto.createHash("sha256").update(secret).digest();
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    // 1. Busca o dado encriptado no storage real
    const encryptedEntry = await this.wrapped.get<any>(key);

    if (!encryptedEntry) {
      return null;
    }

    try {
      // O valor salvo seve ser um objeto com { iv, content, tag }
      const { value } = encryptedEntry;

      if (!value || !value.iv || !value.content || !value.tag) {
        return null; // Formato inválido ou dado não encriptado
      }

      // 2. Decriptação
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.key,
        Buffer.from(value.iv, "hex"),
      ) as DecipherGCM;

      decipher.setAuthTag(Buffer.from(value.tag, "hex"));

      let decrypted = decipher.update(value.content, "hex", "utf8");
      decrypted += decipher.final("utf8");

      // 3. Reconstrói o CacheEntry original
      const originalValue = JSON.parse(decrypted) as T;

      return {
        value: originalValue,
        createdAt: encryptedEntry.createdAt, // Metadados mantêm-se em claro
        ttl: encryptedEntry.ttl,
      };
    } catch (_err) {
      // Se a decriptação falhar (chave errada ou dado corrompido), tratamos como MISS
      // Isso evita crashar a aplicação se o segredo mudar.
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    // 1. Encriptação
    const iv = crypto.randomBytes(16); // Vetor de Inicialização único por escrita
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv) as CipherGCM;

    // Serializamos o valor para string antes de encriptar
    const stringValue = JSON.stringify(value);

    let encrypted = cipher.update(stringValue, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag().toString("hex");

    // 2. Cria o payload seguro
    const payload = {
      iv: iv.toString("hex"),
      content: encrypted,
      tag: authTag,
    };

    // 3. Salva no storage real
    // Nota: O 'value' salvo no Redis será nosso payload criptografado
    await this.wrapped.set(key, payload, ttl);
  }

  async delete(key: string): Promise<void> {
    await this.wrapped.delete(key);
  }

  // Se o adapter encapsulado tiver suporte a tags, repassamos as chamadas
  async addKeysToTag(tag: string, key: string[]): Promise<void> {
    if (typeof (this.wrapped as any).addKeysToTag === "function") {
      await (this.wrapped as any).addKeysToTag(tag, key);
    }
  }

  async getKeysByTag(tag: string): Promise<string[]> {
    if (typeof (this.wrapped as any).getKeysByTag === "function") {
      return (this.wrapped as any).getKeysByTag(tag);
    }
    return [];
  }

  async deleteTag(tag: string): Promise<void> {
    if (typeof (this.wrapped as any).deleteTag === "function") {
      await (this.wrapped as any).deleteTag(tag);
    }
  }

  async disconnect(): Promise<void> {
    if (typeof (this.wrapped as any).disconnect === "function") {
      await (this.wrapped as any).disconnect();
    }
  }

  async clear(): Promise<void> {
    await this.wrapped.clear();
  }
}
