import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Arca } from '../src/index';

describe('Arca - Cache Tags Invalidation', () => {
  let mockStorage: any;
  let arca: Arca;

  beforeEach(() => {
    // Mock completo de um storage que suporta Tags (simulando o RedisAdapter)
    mockStorage = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      addKeysToTag: vi.fn(),
      getKeysByTag: vi.fn(),
      deleteTag: vi.fn(),
    };

    arca = new Arca({ storage: mockStorage });
  });

  it('should associate a key with tags during fetch', async () => {
    const fetcher = vi.fn().mockResolvedValue('data');
    const tags = ['user:1', 'profile'];

    await arca.get('key:1', fetcher, { tags });

    // Verifica se salvou o valor
    expect(mockStorage.set).toHaveBeenCalledWith('key:1', 'data', expect.any(Number));

    // Verifica se associou a chave às tags
    expect(mockStorage.addKeysToTag).toHaveBeenCalledWith('user:1', ['key:1']);
    expect(mockStorage.addKeysToTag).toHaveBeenCalledWith('profile', ['key:1']);
  });

  it('should delete all keys associated with a tag when invalidated', async () => {
    // Simula que a tag 'user:1' possui duas chaves vinculadas
    mockStorage.getKeysByTag.mockResolvedValue(['key:1', 'key:2']);

    await arca.invalidateTags(['user:1']);

    // 1. Deve buscar quem são os "filhos" da tag
    expect(mockStorage.getKeysByTag).toHaveBeenCalledWith('user:1');

    // 2. Deve deletar cada chave individualmente
    expect(mockStorage.delete).toHaveBeenCalledWith('key:1');
    expect(mockStorage.delete).toHaveBeenCalledWith('key:2');

    // 3. Deve deletar a própria tag (o set do Redis)
    expect(mockStorage.deleteTag).toHaveBeenCalledWith('user:1');
  });

  it('should emit "invalidated" event with the tags', async () => {
    const eventSpy = vi.fn();
    arca.on('invalidated', eventSpy);

    mockStorage.getKeysByTag.mockResolvedValue([]);

    await arca.invalidateTags(['user:1']);

    expect(eventSpy).toHaveBeenCalledWith(['user:1']);
  });
});