import { describe, expect, it, vi } from "vitest";
import { nexDefinition } from "../../agents/nex";
import { testDefinition } from "../../agents/test";
import type { AgentRenderDefinition } from "../../agents/types";
import { resolveMorphTransport } from "./transport";

/** The morph program's automatic transport (2.4b.2 stage D; proposal §6.6). */

const query = (
  maxVertexUniforms: number,
  texture = true,
  idle: "uniforms" | "texture" = "uniforms",
) => {
  const probe = vi.fn(() => texture);
  return {
    probe,
    result: resolveMorphTransport({
      slotA: nexDefinition,
      slotB: testDefinition,
      idle,
      maxVertexUniforms,
      textureAvailable: probe,
    }),
  };
};

describe("resolveMorphTransport", () => {
  it("prefers NEX's idle transport when the pair fits with 32 vectors of headroom", () => {
    const fits = query(256); // 114 + 22 + 2 = 138 ≤ 224
    expect(fits.result).toBe("uniforms");
    expect(fits.probe).not.toHaveBeenCalled();
    expect(query(170).result).toBe("uniforms"); // 138 ≤ 138
    expect(query(256, true, "texture").result).toBe("texture");
  });

  it("falls back to the texture transport when the uniform pair doesn't fit and the probe passes", () => {
    expect(query(169).result).toBe("texture"); // 138 > 137; 75 ≤ 137
    expect(query(107).result).toBe("texture"); // 75 ≤ 75
    expect(query(169, false).result).toBeNull(); // the probe failed
  });

  it("nothing fits: null (the change is a swap)", () => {
    const none = query(106);
    expect(none.result).toBeNull();
  });

  it("needs a slot-A and a slot-B module", () => {
    const noMorph = { ...testDefinition, morph: undefined } as AgentRenderDefinition;
    const args = {
      idle: "uniforms" as const,
      maxVertexUniforms: 1024,
      textureAvailable: () => true,
    };
    expect(resolveMorphTransport({ slotA: nexDefinition, slotB: noMorph, ...args })).toBeNull();
    expect(
      resolveMorphTransport({ slotA: testDefinition, slotB: nexDefinition, ...args }),
    ).toBeNull();
  });
});
