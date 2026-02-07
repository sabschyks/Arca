import { describe, expect, it } from "vitest";
import { Arca } from "../src/index";

describe("Arca Core", () => {
  it("should initialize correctly", () => {
    const arca = new Arca();
    expect(arca).toBeDefined();
  });

  it("should return pong", () => {
    const arca = new Arca();
    expect(arca.ping()).toBe("pong");
  });
});
