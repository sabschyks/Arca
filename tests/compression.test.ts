import { describe, it, expect, vi } from 'vitest';
import { Arca, MemoryAdapter } from '../src/index';
import { CompressionStorageAdapter } from '../src/core/compression-storage';

describe('Arca - CompressionStorageAdapter Coverage', () => {
  
  it('should skip compression if data is smaller than threshold (Line 45)', async () => {
    const storage = new MemoryAdapter();
    const setSpy = vi.spyOn(storage, 'set');
    
    const arca = new Arca({
      storage,
      compression: { 
        enabled: true, 
        threshold: 1000 // Threshold alto
      }
    });

    // Dado pequeno (menor que 1kb)
    const smallData = { msg: "oi" };
    await arca.get('key:small', async () => smallData);

    // Verifica se o 'set' foi chamado com o objeto puro, não um Buffer
    // Isso garante que passou pelo 'else' (Linha 45)
    expect(setSpy).toHaveBeenCalledWith('key:small', smallData, 60000);
    
    const result = await arca.get('key:small', async () => smallData);
    expect(result).toEqual(smallData);
  });

  it('should handle decompression failure gracefully (Line 30-31)', async () => {
    const storage = new MemoryAdapter();
    const arca = new Arca({
      storage,
      compression: { enabled: true }
    });

    // Simulamos um dado corrompido: um Buffer que não é um Gzip válido
    const corruptedBuffer = Buffer.from("invalid-gzip-data");
    await storage.set('key:corrupted', corruptedBuffer, 60000);

    // Ao tentar ler, a descompressão vai falhar e entrar no catch (Linha 30)
    const result = await arca.get('key:corrupted', async () => ({ data: 'new' }));
    
    // O comportamento esperado do catch no código é retornar null, 
    // o que força o Arca a executar o fetcher
    expect(result).toEqual({ data: 'new' });
  });

  it('should call delete and clear through the proxy (Lines 49-50)', async () => {
    const storage = new MemoryAdapter();
    const deleteSpy = vi.spyOn(storage, 'delete');
    const clearSpy = vi.spyOn(storage, 'clear');
    
    const adapter = new CompressionStorageAdapter(storage);

    await adapter.delete('some-key');
    expect(deleteSpy).toHaveBeenCalledWith('some-key');

    await adapter.clear();
    expect(clearSpy).toHaveBeenCalled();
  });

  it('should return original value if it is not a Buffer (Line 34)', async () => {
    const storage = new MemoryAdapter();
    const adapter = new CompressionStorageAdapter(storage);

    // Salva um dado que não é Buffer diretamente no storage
    await storage.set('key:plain', { foo: 'bar' }, 60000);

    // O adapter deve identificar que não é Buffer e retornar o dado puro (Linha 34)
    const result = await adapter.get('key:plain');
    expect(result?.value).toEqual({ foo: 'bar' });
  });
});
