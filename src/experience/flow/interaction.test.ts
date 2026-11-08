import { Texture } from "three";
import { describe, expect, it } from "vitest";
import { particleVertexShader } from "../ambient/shaders";
import { nexLineVertex, nexPointVertex } from "../nex/shaders";
import { FLOW_RANGE } from "./FlowField";
import {
  FLOW_GLSL,
  clearInteraction,
  createInteraction,
  interactionUniforms,
  syncInteraction,
} from "./interaction";

/**
 * The stage's single cursor substrate (ADR-004). Regression for the Milestone 2.3 review: NEX
 * computed its own analytic attraction instead of sampling the shared flow map. Every consumer
 * now copies the same interaction object with `syncInteraction` and samples it with FLOW_GLSL.
 */

describe("syncInteraction", () => {
  const texture = new Texture();

  it("passes the half-float flow map through, unencoded", () => {
    const interaction = createInteraction(0.09);
    interaction.mode = "half-float";
    interaction.texture = texture;
    const u = interactionUniforms();
    syncInteraction(u, interaction, 1.6);
    expect(u.uFlowMode.value).toBe(1);
    expect(u.uFlow.value).toBe(texture);
    expect(u.uFlowEncoded.value).toBe(0);
    expect(u.uFlowRange.value).toBe(FLOW_RANGE);
    expect(u.uAspect.value).toBe(1.6);
  });

  it("marks the RGBA8 flow map as encoded", () => {
    const interaction = createInteraction(0.09);
    interaction.mode = "rgba8";
    interaction.texture = texture;
    const u = interactionUniforms();
    syncInteraction(u, interaction, 1);
    expect(u.uFlowMode.value).toBe(1);
    expect(u.uFlow.value).toBe(texture);
    expect(u.uFlowEncoded.value).toBe(1);
  });

  it("uses the shared analytic fallback when no render target is available", () => {
    const interaction = createInteraction(0.12);
    interaction.mode = "analytic";
    interaction.pointer.set(0.25, -0.5);
    interaction.velocity.set(1.5, 0.75);
    const u = interactionUniforms();
    syncInteraction(u, interaction, 1);
    expect(u.uFlowMode.value).toBe(2);
    expect(u.uFlow.value).toBeNull();
    expect(u.uPointer.value.toArray()).toEqual([0.25, -0.5]);
    expect(u.uPointerVelocity.value.toArray()).toEqual([1.5, 0.75]);
    expect(u.uPointerRadius.value).toBe(0.12);
  });

  it("zeroes every pointer uniform when interaction is off (reduced or off motion)", () => {
    const interaction = createInteraction(0.09);
    interaction.mode = "analytic";
    interaction.velocity.set(2, 2);
    const u = interactionUniforms();
    syncInteraction(u, interaction, 1);
    clearInteraction(interaction);
    syncInteraction(u, interaction, 1);
    expect(u.uFlowMode.value).toBe(0);
    expect(u.uFlow.value).toBeNull();
    expect(u.uPointer.value.toArray()).toEqual([0, 0]);
    expect(u.uPointerVelocity.value.toArray()).toEqual([0, 0]);
  });

  it("never samples a flow-map mode that has no texture yet", () => {
    const interaction = createInteraction(0.09);
    interaction.mode = "half-float";
    const u = interactionUniforms();
    syncInteraction(u, interaction, 1);
    expect(u.uFlowMode.value).toBe(0);
  });
});

describe("one sampling path for every consumer", () => {
  it("the ambient field and NEX both sample the shared flow, and nothing else reads it", () => {
    for (const shader of [particleVertexShader, nexPointVertex]) {
      expect(shader).toContain(FLOW_GLSL);
      expect(shader).toMatch(/sampleFlow\(/);
      // The flow texture is read only inside the shared sampleFlow().
      expect(shader.split("texture2D(uFlow").length - 1).toBe(1);
    }
    // NEX no longer has a private pointer model.
    expect(nexPointVertex).not.toMatch(/uPointerStrength|toPointer/);
    // Ring hairlines don't react to the cursor (as approved).
    expect(nexLineVertex).not.toContain("sampleFlow");
  });
});
