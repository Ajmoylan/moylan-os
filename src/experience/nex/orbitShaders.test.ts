import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import * as shaders from "./shaders";
import { nexLineVertex, nexPointVertex, withOrbitTexture } from "./shaders";

/**
 * NEX shaders and the orbit-texture transport (Milestone 2.4b.1b). The approved uniform-transport
 * sources must stay byte-identical to 26aaa52, and the texture variants must differ from them
 * only in how orbit frames are read (declarations and the two accessor substitutions).
 */

/** SHA-256 of every NEX shader source at 26aaa52 (Milestone 2.4b.1a, merged). */
const APPROVED: Record<string, string> = {
  nexPointVertex: "c1aad5a05b4adfc89c5ff0c428f9b49bbd95c4593b1ba9276a39cf0c822f41fd",
  nexLineVertex: "68934ea1ceb55490c869e16dd2d705b58a6ffb9dff934b06427a5fff0191d010",
  nexSolidFragment: "0e876d8ff414e9e7c6f0e55a8628ea6db464312cd85d9fa578a80f89da2f8b1e",
  nexBillboardVertex: "f9b0a4cf267d6208f7f2fd98f53facffdfaaa5654ee52d4eba5db0a398ee6b6a",
  nexGlowFragment: "5d8d245ed129b6dc167575c09cd0958bf997a5f54e0820307ff489f325c13679",
  nexAtmosphereFragment: "6b0034a13d8d1cc891979e962cd6223037c7df28a2920e534c1b08ec089cc54b",
  nexShellVertex: "185d6f4a01f48b13b4bd61849bacfa6d937db8e755ec35833748971e66c209ce",
  nexShellFragment: "5881b4041349525759c611f2bf099534e83699867a6aa723158490bd04d3b559",
};

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/** Undo the transport substitution: must give back the approved source exactly. */
function toUniforms(source: string): string {
  const start = source.indexOf("uniform highp sampler2D uOrbitTable;");
  const end = source.indexOf("}", source.indexOf("mat3 orbitFrame(int k)")) + 1;
  return (
    source.slice(0, start) +
    "uniform mat3 uFrames[FRAMES];\nuniform float uOrbitFlow[FRAMES];" +
    source.slice(end)
  ).replaceAll("orbitFrame(frame)", "uFrames[frame]");
}

describe("NEX shader sources", () => {
  it("the approved uniform-transport sources are byte-identical to 26aaa52", () => {
    for (const [name, hash] of Object.entries(APPROVED)) {
      expect(sha((shaders as unknown as Record<string, string>)[name]!), name).toBe(hash);
    }
  });

  it("the texture variants change only the orbit transport", () => {
    for (const [approved, texture] of [
      [nexPointVertex, shaders.nexPointVertexTexture],
      [nexLineVertex, shaders.nexLineVertexTexture],
    ] as const) {
      expect(texture).not.toMatch(/uFrames/);
      // The constant flow speeds stay the approved uniform array (identical code on Metal).
      expect(texture).toContain("uniform float uOrbitFlow[FRAMES];");
      expect(texture).toContain("uniform highp sampler2D uOrbitTable;");
      expect(texture).toContain("orbitFrame(frame)");
      expect(toUniforms(texture)).toBe(approved);
    }
    // Every matrix access was converted; the flow reads are untouched.
    const count = (text: string, needle: string) => text.split(needle).length - 1;
    expect(count(shaders.nexPointVertexTexture, "orbitFrame(frame)")).toBe(1);
    expect(count(shaders.nexLineVertexTexture, "orbitFrame(frame)")).toBe(1);
    expect(count(shaders.nexPointVertexTexture, "uOrbitFlow[frame]")).toBe(3);
    expect(count(shaders.nexLineVertexTexture, "uOrbitFlow[frame]")).toBe(1);
  });

  it("reads matrix columns in the uniform upload's column-major order (texels 0–2)", () => {
    const texture = shaders.nexPointVertexTexture;
    expect(texture).toMatch(
      /mat3\(\s*texelFetch\(uOrbitTable, ivec2\(0, k\), 0\)\.xyz,\s*texelFetch\(uOrbitTable, ivec2\(1, k\), 0\)\.xyz,\s*texelFetch\(uOrbitTable, ivec2\(2, k\), 0\)\.xyz\)/,
    );
  });

  it("refuses a source that no longer has the uniform transport's shape", () => {
    expect(() => withOrbitTexture("void main() {}")).toThrow(/uniform orbit frames/);
    expect(() =>
      withOrbitTexture(
        "uniform mat3 uFrames[FRAMES];\nuniform float uOrbitFlow[FRAMES];\nvec3 a = uFrames[0] * v;",
      ),
    ).toThrow(/unconverted/);
  });
});
