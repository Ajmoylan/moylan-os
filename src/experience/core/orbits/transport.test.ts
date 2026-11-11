import { describe, expect, it, vi } from "vitest";
import type { AgentTransports } from "../../agents/types";
import { DEFAULT_ORBIT_TRANSPORT, orbitPreferenceFrom, selectOrbitTransport } from "./transport";

/** Orbit transport selection (Milestone 2.4b.1b): the default, the switch and the fallback. */

const both: AgentTransports = { idle: ["uniforms", "texture"], uniformVectors: {} };
const uniformsOnly: AgentTransports = { idle: ["uniforms"], uniformVectors: {} };
const textureOnly: AgentTransports = { idle: ["texture"], uniformVectors: {} };

describe("orbitPreferenceFrom", () => {
  it("defaults to the approved uniform transport", () => {
    expect(DEFAULT_ORBIT_TRANSPORT).toBe("uniforms");
    expect(orbitPreferenceFrom("")).toBe("uniforms");
    expect(orbitPreferenceFrom("?ref=home")).toBe("uniforms");
    expect(orbitPreferenceFrom("?orbits=TEXTURE")).toBe("uniforms");
    expect(orbitPreferenceFrom("?orbits=<script>")).toBe("uniforms");
  });

  it("reads the comparison switch", () => {
    expect(orbitPreferenceFrom("?orbits=texture")).toBe("texture");
    expect(orbitPreferenceFrom("?a=1&orbits=uniforms")).toBe("uniforms");
  });
});

describe("selectOrbitTransport", () => {
  it("uses the texture only when wanted, supported by the agent and probed on this context", () => {
    expect(selectOrbitTransport("texture", both, () => true)).toBe("texture");
  });

  it("falls back to uniforms when the probe fails", () => {
    expect(selectOrbitTransport("texture", both, () => false)).toBe("uniforms");
  });

  it("never probes when the texture is not wanted or the agent doesn't support it", () => {
    const probe = vi.fn(() => true);
    expect(selectOrbitTransport("uniforms", both, probe)).toBe("uniforms");
    expect(selectOrbitTransport("texture", uniformsOnly, probe)).toBe("uniforms");
    expect(probe).not.toHaveBeenCalled();
  });

  it("refuses an agent with no viable transport (the unsupported path arrives with specialists)", () => {
    expect(() => selectOrbitTransport("texture", textureOnly, () => false)).toThrow(/transport/);
    expect(selectOrbitTransport("texture", textureOnly, () => true)).toBe("texture");
  });
});
