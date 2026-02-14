import { describe, it, expect, vi } from "vitest";
import { Arca } from "../src/index";
import { PrometheusMetrics } from "../src/observability/prometheus-metrics";

describe("Observability Stack", () => {
  it("should log operations and track metrics", async () => {
    const metrics = new PrometheusMetrics();
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    };

    const arca = new Arca({ metrics, logger });
    const fetcher = async () => "data";

    // 1. MISS
    await arca.get("test-key", fetcher);

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining("Fetch completed succesfully"),
      expect.objectContaining({ key: "test-key" }),
    );

    // Verificando Prometheus Registry
    const prometheusData = await metrics.getRegistry().metrics();
    expect(prometheusData).toContain(
      'arca_cache_operations_total{operation="get",status="miss",key="test-key"} 1',
    );
  });

  it("should auto-create a new counter metric", async () => {
    const metrics = new PrometheusMetrics();

    metrics.increment("arca_async_messages_total", {
      direction: "sent",
    });

    const data = await metrics.getRegistry().metrics();

    expect(data).toContain('arca_async_messages_total{direction="sent"} 1');
  });

  it("should auto-create a new histogram metric", async () => {
    const metrics = new PrometheusMetrics();

    metrics.observe("arca_job_duration_seconds", 0.5, {
      job: "email",
    });

    const data = await metrics.getRegistry().metrics();

    expect(data).toContain("arca_job_duration_seconds_bucket");
  });

  it("should not recreate metric if already registered", async () => {
    const metrics = new PrometheusMetrics();

    metrics.increment("arca_async_messages_total", { direction: "sent" });
    metrics.increment("arca_async_messages_total", { direction: "sent" });

    const data = await metrics.getRegistry().metrics();

    expect(data).toContain('arca_async_messages_total{direction="sent"} 2');
  });
});
