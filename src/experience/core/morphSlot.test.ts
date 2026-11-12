import { BufferAttribute, BufferGeometry } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMorphGeometry,
  releaseMorphGeometry,
  validateMorphAttributes,
  type ParticleAttributes,
} from "./morphSlot";

/**
 * The morph geometry's input validation (Codex Low finding, Milestone 2.4b.2 stage D): malformed
 * attribute sets are rejected before any geometry (and so any GPU resource) exists.
 */

const set = (n: number, sizes = { position: 3, orbit: 1, seed: 4 }): ParticleAttributes => ({
  position: new BufferAttribute(new Float32Array(n * sizes.position), sizes.position),
  orbit: new BufferAttribute(new Float32Array(n * sizes.orbit), sizes.orbit),
  seed: new BufferAttribute(new Float32Array(n * sizes.seed), sizes.seed),
});

afterEach(() => vi.restoreAllMocks());

describe("createMorphGeometry validation", () => {
  it("accepts two well-formed sets of N particles and borrows their objects", () => {
    const a = set(64);
    const b = set(64);
    expect(validateMorphAttributes(a, b)).toBe(64);
    const geometry = createMorphGeometry(a, b);
    expect(geometry.getAttribute("position")).toBe(a.position);
    expect(geometry.getAttribute("aSeedB")).toBe(b.seed);
    releaseMorphGeometry(geometry);
  });

  /** Each malformed case is rejected, and no BufferGeometry is constructed. */
  const rejects = (a: ParticleAttributes, b: ParticleAttributes, message: RegExp) => {
    const constructed = vi.spyOn(BufferGeometry.prototype, "setAttribute");
    expect(() => createMorphGeometry(a, b)).toThrow(message);
    expect(constructed).not.toHaveBeenCalled();
  };

  it("rejects different particle counts between source and destination", () => {
    rejects(set(64), set(32), /destination position has 32 particles, expected 64/);
  });

  it("rejects a position attribute whose item size isn't 3 (either slot)", () => {
    rejects(
      set(64, { position: 2, orbit: 1, seed: 4 }),
      set(64),
      /source position has item size 2, expected 3/,
    );
    rejects(
      set(64),
      set(64, { position: 4, orbit: 1, seed: 4 }),
      /destination position has item size 4/,
    );
  });

  it("rejects an orbit attribute whose item size isn't 1", () => {
    rejects(
      set(64, { position: 3, orbit: 2, seed: 4 }),
      set(64),
      /source orbit has item size 2, expected 1/,
    );
  });

  it("rejects a seed attribute whose item size isn't 4", () => {
    rejects(
      set(64),
      set(64, { position: 3, orbit: 1, seed: 3 }),
      /destination seed has item size 3, expected 4/,
    );
  });

  it("rejects attributes of one set that disagree on the particle count", () => {
    const a = set(64);
    a.seed = new BufferAttribute(new Float32Array(32 * 4), 4);
    rejects(a, set(64), /source seed has 32 particles, expected 64/);
    const b = set(64);
    b.orbit = new BufferAttribute(new Float32Array(63), 1);
    rejects(set(64), b, /destination orbit has 63 particles, expected 64/);
  });

  it("rejects a missing or non-BufferAttribute member", () => {
    const a = set(64);
    (a as { orbit: unknown }).orbit = undefined;
    rejects(a, set(64), /source orbit is not a BufferAttribute/);
    const b = set(64);
    (b as { position: unknown }).position = { itemSize: 3, count: 64 };
    rejects(set(64), b, /destination position is not a BufferAttribute/);
  });

  it("rejects empty shapes", () => {
    rejects(set(0), set(0), /empty/);
  });
});
