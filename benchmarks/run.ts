import { add, complete, cycle, save, suite } from "benny";
import { Arca } from "../src/index";

// Simula banco lento (10ms)
const slowDbQuery = async () => {
  await new Promise(r => setTimeout(r, 10));
  return 'data'
}

const arca = new Arca({ defaultTtl: 1000 });

// Simula tráfego intenso: 100 request simultâneas
const CONCURRENCY = 100;

suite(
  'Thudering Herd Scenarios',
  
  // CASO 1: SEM ARCA
  // Cada request bate no banco.
  add('Without Arca (Direct DB)', async () => {
    const promises = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      promises.push(slowDbQuery());
    }
    await Promise.all(promises);
  }),

  // CASO 2: COM ARCA
  add('With Arca (Coalescing)', async () => {
    const promises = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      promises.push(arca.get('bench-key', slowDbQuery));
    }
    await Promise.all(promises);
  }),

  cycle(),
  complete(),
  save({ file: 'arca-bench', version: '1.0.0', folder: 'benchmarks/results' }),
)