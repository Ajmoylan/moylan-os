import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GLSL hygiene for every shader in the 3D layer. Regression for the Milestone 2.3 review:
 * `smoothstep(edge0, edge1, x)` is undefined when edge0 >= edge1 (GLSL ES 3.00 §8.3), so the
 * inverse ramps are written as `1.0 - smoothstep(low, high, x)`.
 */

// Vitest runs from the repository root (jsdom gives import.meta.url a non-file scheme).
const root = join(process.cwd(), "src", "experience");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("GLSL in src/experience", () => {
  it("never calls smoothstep with reversed or equal literal edges", () => {
    const literal = /smoothstep\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,/g;
    const offenders: string[] = [];
    let checked = 0;
    for (const file of sources(root)) {
      for (const match of readFileSync(file, "utf8").matchAll(literal)) {
        checked++;
        if (Number(match[1]) >= Number(match[2])) offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(checked).toBeGreaterThan(5);
    expect(offenders).toEqual([]);
  });
});
