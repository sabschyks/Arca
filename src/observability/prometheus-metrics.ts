import { Counter, Histogram, Registry, Metric } from "prom-client";
import type { Metrics } from "../types";

export class PrometheusMetrics implements Metrics {
  private registry: Registry;

  // Métricas core (legado)
  private cacheCounter: Counter<string>;
  private fetchDuration: Histogram<string>;

  // Métricas dinâmicas novas
  private metricsMap = new Map<string, Metric<string>>();

  constructor(registry?: Registry) {
    this.registry = registry || new Registry();

    // Métricas antigas explícitas (compatibilidade total)
    this.cacheCounter = new Counter({
      name: "arca_cache_operations_total",
      help: "Total number of cache operations",
      labelNames: ["operation", "key", "status"],
      registers: [this.registry],
    });

    this.fetchDuration = new Histogram({
      name: "arca_fetch_duration_seconds",
      help: "Duration of fetch operations in seconds",
      labelNames: ["key"],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    // Registrar no map para evitar recriação
    this.metricsMap.set(
      "arca_cache_operations_total",
      this.cacheCounter
    );
    this.metricsMap.set(
      "arca_fetch_duration_seconds",
      this.fetchDuration
    );
  }

  public increment(name: string, labels: Record<string, string> = {}): void {
    // 🔹 Compatibilidade legado
    if (name === "cache_op") {
      this.cacheCounter.inc(labels);
      return;
    }

    // 🔹 Se já existir (core ou dinâmica)
    if (this.metricsMap.has(name)) {
      const metric = this.metricsMap.get(name) as Counter<string>;
      metric.inc(labels);
      return;
    }

    // 🔹 Nova métrica dinâmica
    const counter = new Counter({
      name,
      help: `Total counter for ${name}`,
      labelNames: Object.keys(labels),
      registers: [this.registry],
    });

    this.metricsMap.set(name, counter);
    counter.inc(labels);
  }

  public observe(
    name: string,
    value: number,
    labels: Record<string, string> = {}
  ): void {
    // 🔹 Compatibilidade legado
    if (name === "fetch_duration") {
      this.fetchDuration.observe(labels, value);
      return;
    }

    // 🔹 Se já existir
    if (this.metricsMap.has(name)) {
      const metric = this.metricsMap.get(name) as Histogram<string>;
      metric.observe(labels, value);
      return;
    }

    // 🔹 Nova métrica dinâmica
    const histogram = new Histogram({
      name,
      help: `Histogram for ${name}`,
      labelNames: Object.keys(labels),
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.metricsMap.set(name, histogram);
    histogram.observe(labels, value);
  }

  public getRegistry(): Registry {
    return this.registry;
  }
}
