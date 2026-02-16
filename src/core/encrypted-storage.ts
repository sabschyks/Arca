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
    if (!encryptedEntry) return null;

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
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv) as CipherGCM;
    const encrypted = cipher.update(JSON.stringify(value), "utf8", "hex") + cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");

    await this.wrapped.set(key, { iv: iv.toString("hex"), content: encrypted, tag }, ttl);
  }

  async delete(key: string): Promise<void> {
    await this.wrapped.delete(key);
  }
  async clear(): Promise<void> {
    if (typeof (this.wrapped as any).clear === "function") await (this.wrapped as any).clear();
  }

  // Proxies
  async addKeysToTag(tag: string, keys: string[]) {
    if (typeof (this.wrapped as any).addKeysToTag === "function")
      await (this.wrapped as any).addKeysToTag(tag, keys);
  }
  async getKeysByTag(tag: string) {
    return typeof (this.wrapped as any).getKeysByTag === "function"
      ? (this.wrapped as any).getKeysByTag(tag)
      : [];
  }
  async deleteTag(tag: string) {
    if (typeof (this.wrapped as any).deleteTag === "function")
      await (this.wrapped as any).deleteTag(tag);
  }
  async disconnect() {
    if (typeof (this.wrapped as any).disconnect === "function")
      await (this.wrapped as any).disconnect();
  }
}
