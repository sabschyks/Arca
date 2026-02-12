import { describe, it, expect, vi } from "vitest";
import { Arca } from "../src/index";
import { PrometheusMetrics } from "../src/observability/prometheus-metrics";

describe('Observability Stack', () => {
  it('should log operations and track metrics', async () => {
    const metrics = new PrometheusMetrics();
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    };

    const arca = new Arca({ metrics, logger })
    const fetcher = async () => 'data';

    // 1. MISS
    await arca.get('test-key', fetcher);

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Fetch completed succesfully'),
      expect.objectContaining({ key: 'test-key' })
    );

    // Verificando Prometheus Registry
    const prometheusData = await metrics.getRegistry().metrics();
    expect(prometheusData).toContain('arca_cache_operations_total{operation="get",status="miss",key="test-key"} 1');
  });
})