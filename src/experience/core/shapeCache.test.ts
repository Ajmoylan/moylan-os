import { describe, expect, it, vi } from "vitest";
import type { AgentId } from "~/agents/registry";
import type { AgentRenderDefinition, AgentShape } from "../agents/types";
import { ShapeCache, SHAPE_CACHE_CAPACITY } from "./shapeCache";

/** The Stage-lifetime shape cache (Milestone 2.4b.1a, proposal §5.3). */

function definition(id: AgentId, overrides: Partial<AgentRenderDefinition> = {}) {
  const generate = vi.fn((count: number): AgentShape => ({
    positions: new Float32Array(count * 3),
    orbits: new Float32Array(count),
    seeds: new Float32Array(count * 4),
  }));
  return {
    id,
    version: 1,
    seed: 7,
    generate,
    transports: { idle: ["uniforms"], uniformVectors: {} },
    hotOverride: "#ffffff",
    createView: () => {
      throw new Error("not used");
    },
    ...overrides,
  } as AgentRenderDefinition & { generate: typeof generate };
}

describe("ShapeCache", () => {
  it("generates once per (agent, N, seed, version) and returns the same arrays after", () => {
    const cache = new ShapeCache();
    const nex = definition("nex");
    const first = cache.get(nex, 100);
    expect(cache.get(nex, 100)).toBe(first);
    expect(nex.generate).toHaveBeenCalledTimes(1);
    expect(nex.generate).toHaveBeenCalledWith(100, 7);
    expect(cache.generated).toBe(1);
  });

  it("never reuses a shape from another seed or definition version", () => {
    const cache = new ShapeCache();
    const v1 = definition("nex");
    const v2 = definition("nex", { version: 2 });
    const reseeded = definition("nex", { seed: 8 });
    const a = cache.get(v1, 100);
    expect(cache.get(v2, 100)).not.toBe(a);
    expect(cache.get(reseeded, 100)).not.toBe(a);
    expect(cache.generated).toBe(3);
  });

  it("keeps one N per agent: a tier change evicts the agent's old shape", () => {
    const cache = new ShapeCache();
    const nex = definition("nex");
    const big = cache.get(nex, 300);
    cache.get(nex, 100);
    expect(cache.size).toBe(1);
    expect(cache.get(nex, 300)).not.toBe(big);
  });

  it("holds at most the capacity, dropping the least recently used", () => {
    const cache = new ShapeCache();
    const ids: AgentId[] = ["nex", "forge", "syn", "atlas"];
    const defs = ids.map((id) => definition(id));
    const nexShape = cache.get(defs[0]!, 10);
    cache.get(defs[1]!, 10);
    cache.get(defs[2]!, 10);
    cache.get(defs[0]!, 10); // NEX used again: forge is now the oldest
    cache.get(defs[3]!, 10);
    expect(cache.size).toBe(SHAPE_CACHE_CAPACITY);
    expect(cache.get(defs[0]!, 10)).toBe(nexShape);
    cache.get(defs[1]!, 10);
    expect(defs[1]!.generate).toHaveBeenCalledTimes(2);
  });

  it("a throwing generator leaves the cache unchanged", () => {
    const cache = new ShapeCache();
    const nex = definition("nex");
    const shape = cache.get(nex, 100);
    nex.generate.mockImplementationOnce(() => {
      throw new Error("shape");
    });
    expect(() => cache.get(nex, 200)).toThrow("shape");
    expect(cache.size).toBe(1);
    expect(cache.get(nex, 100)).toBe(shape);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
