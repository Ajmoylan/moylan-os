import { describe, expect, it } from "vitest";
import { planStage, probeWebGL2, type CapabilitySignals } from "./capabilities";

const capable: CapabilitySignals = {
  webgl2: true,
  saveData: false,
  coarsePointer: false,
  deviceMemory: 8,
  hardwareConcurrency: 8,
};

describe("planStage", () => {
  it("gives capable desktops the high tier with full motion and pointer effects", () => {
    expect(planStage(capable, "full")).toEqual({
      tier: 3,
      motion: "full",
      pointerEffects: true,
      reason: "capable",
    });
  });

  it("never downloads 3D with Save-Data, even on capable hardware", () => {
    expect(planStage({ ...capable, saveData: true }, "full")).toMatchObject({
      tier: 0,
      pointerEffects: false,
      reason: "save-data",
    });
  });

  it("falls back to static without WebGL2", () => {
    expect(planStage({ ...capable, webgl2: false }, "full")).toMatchObject({
      tier: 0,
      reason: "no-webgl2",
    });
  });

  it("uses the low tier with no pointer effects when motion is reduced", () => {
    expect(planStage(capable, "reduced")).toEqual({
      tier: 1,
      motion: "reduced",
      pointerEffects: false,
      reason: "reduced-motion",
    });
  });

  it("does no 3D work at all when motion is off, on any device", () => {
    for (const signals of [capable, { ...capable, coarsePointer: true }]) {
      expect(planStage(signals, "off")).toEqual({
        tier: 0,
        motion: "off",
        pointerEffects: false,
        reason: "motion-off",
      });
    }
  });

  it("lets an explicit Full choice use the device's tier, but never overrides device limits", () => {
    expect(planStage(capable, "full").tier).toBe(3);
    expect(planStage({ ...capable, saveData: true }, "full").tier).toBe(0);
    expect(planStage({ ...capable, deviceMemory: 2 }, "full").tier).toBe(1);
  });

  it("uses the low tier on low-memory or low-core devices", () => {
    expect(planStage({ ...capable, deviceMemory: 2 }, "full")).toMatchObject({
      tier: 1,
      pointerEffects: true,
      reason: "low-end-device",
    });
    expect(planStage({ ...capable, hardwareConcurrency: 2 }, "full").tier).toBe(1);
    expect(planStage({ ...capable, deviceMemory: 2 }, "reduced").pointerEffects).toBe(false);
  });

  it("uses the medium tier for touch devices and mid-range memory", () => {
    expect(planStage({ ...capable, coarsePointer: true }, "full").tier).toBe(2);
    expect(planStage({ ...capable, deviceMemory: 4 }, "full").tier).toBe(2);
  });

  it("treats unknown memory/cores (non-Chromium browsers) as capable", () => {
    expect(
      planStage({ ...capable, deviceMemory: undefined, hardwareConcurrency: undefined }, "full")
        .tier,
    ).toBe(3);
  });
});

describe("probeWebGL2", () => {
  const docWith = (getContext: () => unknown) =>
    ({ createElement: () => ({ getContext }) }) as unknown as Document;

  it("returns false when context creation fails or throws", () => {
    expect(probeWebGL2(docWith(() => null))).toBe(false);
    expect(
      probeWebGL2(
        docWith(() => {
          throw new Error("blocked");
        }),
      ),
    ).toBe(false);
  });

  it("returns true and releases the probe context when WebGL2 is available", () => {
    let released = false;
    const gl = { getExtension: () => ({ loseContext: () => (released = true) }) };
    expect(probeWebGL2(docWith(() => gl))).toBe(true);
    expect(released).toBe(true);
  });
});
