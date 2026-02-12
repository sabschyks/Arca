import { Counter, Histogram, Registry } from "prom-client";
import type { Metrics } from "../types";

export class PrometheusMetrics implements Metrics {
  private registry: Registry;
  private cacheCounter: Counter;
  private fetchDuration: Histogram;

  constructor(registry?: Registry) {
    this.registry = registry || new Registry();

    this.cacheCounter = new Counter({
      name: "arca_cache_operations_total",
      help: "Total number of cache operations",
      labelNames: ["operation", "key", "status"], // optration: get, status: hit/miss/stale
      registers: [this.registry],
    });

    this.fetchDuration = new Histogram({
      name: "arca_fetch_duration_seconds",
      help: "Duration of fetch operations in seconds",
      labelNames: ["key"],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });
  }

  increment(name: string, labels?: Record<string, string>): void {
    if (name === "cache_op") {
      this.cacheCounter.inc(labels || {});
    }
  }

  observe(name: string, value: number, labels?: Record<string, string>): void {
    if (name === "fetch_duration") {
      this.fetchDuration.observe(labels || {}, value);
    }
  }

  getRegistry(): Registry {
    return this.registry;
  }
}
