import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Arca } from '../src/index';
import { createArcaTypeORM } from '../src/integrations/typeorm';

describe('TypeORM Integration', () => {
  // Declaramos a variável aqui para ser acessível nos testes
  let mockRepo: any;
  let arca: Arca;

  beforeEach(() => {
    arca = new Arca();
    
    // Mock do Repositório TypeORM
    mockRepo = {
      metadata: { name: 'User' }, // Necessário para nosso wrapper
      findOne: vi.fn().mockResolvedValue({ id: 1, name: 'Bob' }),
      find: vi.fn().mockResolvedValue([{ id: 1, name: 'Bob' }]),
      createQueryBuilder: vi.fn(),
    };
  });

  it('should cache findOne calls', async () => {
    // @ts-ignore - Mocking complex TypeORM types
    const userRepo = createArcaTypeORM(mockRepo, arca);
    
    const options = { where: { id: 1 } };

    // 1. MISS
    const res1 = await userRepo.findOne(options);
    expect(res1).toEqual({ id: 1, name: "Bob" });
    expect(mockRepo.findOne).toHaveBeenCalledTimes(1);

    // 2. HIT
    const res2 = await userRepo.findOne(options);
    expect(res2).toEqual({ id: 1, name: 'Bob' });
    
    // Repositório original protegido
    expect(mockRepo.findOne).toHaveBeenCalledTimes(1);
  });

  it('should cache find calls (arrays)', async () => {
    // @ts-ignore
    const userRepo = createArcaTypeORM(mockRepo, arca);
    
    const options = { where: { active: true }, arca: { ttl: 5000 } };

    // 1. MISS com TTL customizado
    await userRepo.find(options);
    expect(mockRepo.find).toHaveBeenCalledTimes(1);

    // 2. HIT
    await userRepo.find(options);
    expect(mockRepo.find).toHaveBeenCalledTimes(1);
  });

  it('should generate different keys for different queries', async () => {
    // @ts-ignore
    const userRepo = createArcaTypeORM(mockRepo, arca);

    await userRepo.findOne({ where: { id: 1 } });
    await userRepo.findOne({ where: { id: 2 } });

    expect(mockRepo.findOne).toHaveBeenCalledTimes(2);
  });
});
