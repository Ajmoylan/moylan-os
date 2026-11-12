import { beforeAll, describe, expect, it, vi } from "vitest";
import { registerDiagnosticDefinition } from "../agents/definitions";
import { testDefinition } from "../agents/test";
import { AgentCapabilities, rendererLimits, VERTEX_UNIFORM_HEADROOM } from "./capabilities";

/** Device-specific agent viability (2.4b.2 remediation, Codex finding 1; proposal §6.6). */

beforeAll(() => registerDiagnosticDefinition(testDefinition));

function assess(
  max: number,
  floatTextures = true,
  preference: "uniforms" | "texture" = "uniforms",
) {
  const probe = vi.fn(() => floatTextures);
  return {
    probe,
    capabilities: new AgentCapabilities(
      { maxVertexUniforms: () => max, floatTextures: probe },
      preference,
      3,
    ),
  };
}

describe("AgentCapabilities", () => {
  it("keeps 32 vectors of headroom below the device limit", () => {
    expect(VERTEX_UNIFORM_HEADROOM).toBe(32);
    expect(assess(256).capabilities.budget).toBe(224);
    expect(assess(144).capabilities.budget).toBe(112);
  });

  it("NEX: uniforms by default, never probing when they fit (NEX 112 ≤ 256 − 32)", () => {
    const { capabilities, probe } = assess(256);
    expect(capabilities.transport("nex")).toBe("uniforms");
    expect(capabilities.supported("test")).toBe(true);
    expect(probe).not.toHaveBeenCalled();
  });

  it("uniforms that don't fit fall back to the texture transport only if the probe passes", () => {
    expect(assess(143).capabilities.transport("nex")).toBe("texture"); // 112 > 111; 49 fits
    const failed = assess(143, false);
    expect(failed.capabilities.transport("nex")).toBeNull(); // unsupported on this context
    expect(failed.capabilities.supported("nex")).toBe(false);
    expect(failed.probe).toHaveBeenCalledTimes(1);
    expect(assess(80, true).capabilities.transport("nex")).toBeNull(); // even 49 > 48
  });

  it("the ?orbits=texture preference goes first when viable, else the declared order", () => {
    expect(assess(256, true, "texture").capabilities.transport("nex")).toBe("texture");
    expect(assess(256, false, "texture").capabilities.transport("nex")).toBe("uniforms");
    // TEST declares uniforms only: the preference doesn't apply.
    expect(assess(256, true, "texture").capabilities.transport("test")).toBe("uniforms");
  });

  it("TEST (uniforms only, 22 vectors) is unsupported below 54", () => {
    expect(assess(54).capabilities.supported("test")).toBe(true);
    expect(assess(53).capabilities.supported("test")).toBe(false);
  });

  it("a rejected transport (its idle program failed to link) is never chosen again; one fallback", () => {
    const { capabilities } = assess(256);
    expect(capabilities.reject("nex", "uniforms")).toBe("texture");
    expect(capabilities.transport("nex")).toBe("texture");
    expect(capabilities.viable(testDefinition, "uniforms")).toBe(true); // per agent
    expect(capabilities.reject("nex", "texture")).toBeNull();
    expect(capabilities.supported("nex")).toBe(false); // cached for this context
    expect(capabilities.reject("test", "uniforms")).toBeNull();
    expect(capabilities.supported("test")).toBe(false);
  });

  it("an agent without a definition is unsupported; verdicts are cached (the probe asked once)", () => {
    const { capabilities, probe } = assess(143);
    expect(capabilities.supported("syn")).toBe(false);
    capabilities.transport("nex");
    capabilities.transport("nex");
    capabilities.supported("nex");
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("belongs to one context generation; a probe that can't restore the renderer still throws", () => {
    expect(assess(256).capabilities.epoch).toBe(3);
    const unsafe = new AgentCapabilities(
      {
        maxVertexUniforms: () => 100,
        floatTextures: () => {
          throw new Error("probe could not restore the renderer");
        },
      },
      "uniforms",
      0,
    );
    expect(() => unsafe.transport("nex")).toThrow("probe could not restore");
  });

  it("reads the renderer's limit, or WebGL2's guaranteed 256 when it reports none", () => {
    expect(
      rendererLimits({ capabilities: { maxVertexUniforms: 1024 } }, () => true).maxVertexUniforms(),
    ).toBe(1024);
    expect(rendererLimits({}, () => true).maxVertexUniforms()).toBe(256);
  });
});
