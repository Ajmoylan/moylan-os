import { describe, expect, it } from "vitest";
import { nexMorphModule } from "../../nex/shaders";
import { MORPH_MAIN, pairVertexShader } from "../../core/morph/program";
import { testMorphModule, testPointVertex } from "./shaders";
import { generateTestShape, TEST_BLOCK, TEST_FRAMES } from "./shape";
import { placeTest } from "./placement";

/** The diagnostic TEST shape and its GLSL (2.4b.2 stage D). */

describe("TEST shape", () => {
  it("is deterministic and seeded", () => {
    const a = generateTestShape(2_400);
    const b = generateTestShape(2_400);
    expect(a.positions).toEqual(b.positions);
    expect(a.seeds).toEqual(b.seeds);
    expect(generateTestShape(2_400, 7).seeds).not.toEqual(a.seeds);
  });

  it("alternates its two tori per block, so every prefix samples both evenly", () => {
    const { orbits, seeds } = generateTestShape(1_200);
    for (let i = 0; i < 1_200; i++) {
      expect(orbits[i]).toBe(Math.floor(i / TEST_BLOCK) % TEST_FRAMES);
    }
    for (const n of [64, 320, 1_200]) {
      const ones = Array.from(orbits.subarray(0, n)).filter((o) => o === 1).length;
      expect(Math.abs(ones / n - 0.5)).toBeLessThanOrEqual(0.5 * (TEST_BLOCK / n));
    }
    expect(seeds.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("has a fixed placement right of centre on wide viewports, low and centred on narrow ones", () => {
    const out = { x: 0, y: 0, scale: 0, onScreen: false };
    placeTest({ width: 1200, height: 800 }, 20, out);
    expect(out.x).toBeGreaterThan(0);
    expect(out.y).toBeCloseTo(0, 9);
    expect(out.onScreen).toBe(true);
    placeTest({ width: 390, height: 844 }, 20, out);
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.y).toBeLessThan(0);
  });
});

/** Global identifiers a GLSL source declares (uniforms, attributes, functions, defines). */
function declared(source: string): Set<string> {
  const names = new Set<string>();
  for (const m of source.matchAll(/^\s*(?:uniform|attribute|varying)\s+\w+\s+(\w+)/gm))
    names.add(m[1]!);
  for (const m of source.matchAll(/^\s*(?:float|vec[234]|void|mat[34])\s+(\w+)\s*\(/gm))
    names.add(m[1]!);
  for (const m of source.matchAll(/^#define\s+(\w+)/gm)) names.add(m[1]!);
  for (const m of source.matchAll(/^const\s+\w+\s+(\w+)/gm)) names.add(m[1]!);
  return names;
}

describe("pair program GLSL", () => {
  it("TEST's module declares nothing NEX's slot-A module or the morph main also declares", () => {
    for (const texture of [false, true]) {
      const a = declared(nexMorphModule(texture));
      const b = declared(testMorphModule);
      const main = declared(MORPH_MAIN);
      expect([...b].filter((name) => a.has(name))).toEqual([]);
      expect([...main].filter((name) => a.has(name) || b.has(name))).toEqual([]);
      const shader = pairVertexShader(nexMorphModule(texture), testMorphModule);
      expect(shader.match(/void main\(/g)).toHaveLength(1);
      expect(shader).toContain("void particleA(");
      expect(shader).toContain("void particleB(");
    }
  });

  it("TEST's idle program runs the same module over its own attributes", () => {
    expect(testPointVertex).toContain("#define positionB position");
    expect(testPointVertex).toContain("particleB(clip, size, color, alpha);");
    expect(testMorphModule).toContain("attribute vec3 positionB;");
  });

  it("the morph main draws a particle with nothing moved and no light changed as its slot alone", () => {
    expect(MORPH_MAIN).toMatch(
      /if \(t <= 0\.0 && uLight <= 0\.0\) \{\s*particleA\(clip, size, color, alpha\);/,
    );
    expect(MORPH_MAIN).toMatch(
      /else if \(t >= 1\.0 && uLight >= 1\.0\) \{\s*particleB\(clip, size, color, alpha\);/,
    );
  });

  it("movement follows uMorph (eased); light follows uLight (linear) in linear light; no midpoint boost", () => {
    expect(MORPH_MAIN).toMatch(/float t = clamp\(\(uMorph - delay\) \/ 0\.6, 0\.0, 1\.0\);/);
    expect(MORPH_MAIN).toContain("mix(dot(lightA, Y), dot(lightB, Y), uLight)");
    expect(MORPH_MAIN).toContain("morphToLinear(colorA * alphaA) * (sizeA * sizeA)");
    expect(MORPH_MAIN).not.toMatch(/1\.0 \+ 0\.6 \* arc|1\.0 \+ 0\.35 \* arc/);
  });

  it("refuses modules without their entry points", () => {
    expect(() => pairVertexShader("void main() {}", testMorphModule)).toThrow("particleA");
    expect(() => pairVertexShader(nexMorphModule(false), "void main() {}")).toThrow("particleB");
  });
});
