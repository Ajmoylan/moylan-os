import { describe, expect, it } from "vitest";
import { planStage, probeWebGL2, type CapabilitySignals } from "./capabilities";

const capable: CapabilitySignals = {
  webgl2: true,
  reducedMotion: false,
  saveData: false,
  coarsePointer: false,
  deviceMemory: 8,
  hardwareConcurrency: 8,
};

describe("planStage", () => {
  it("gives capable desktops the high tier with full motion", () => {
    expect(planStage(capable)).toEqual({ tier: 3, motion: "full", reason: "capable" });
  });

  it("never downloads 3D with Save-Data, even on capable hardware", () => {
    expect(planStage({ ...capable, saveData: true })).toMatchObject({
      tier: 0,
      reason: "save-data",
    });
  });

  it("falls back to static without WebGL2", () => {
    expect(planStage({ ...capable, webgl2: false })).toMatchObject({
      tier: 0,
      reason: "no-webgl2",
    });
  });

  it("respects reduced motion with the low tier and reduced motion mode", () => {
    expect(planStage({ ...capable, reducedMotion: true })).toEqual({
      tier: 1,
      motion: "reduced",
      reason: "reduced-motion",
    });
  });

  it("uses the low tier on low-memory or low-core devices", () => {
    expect(planStage({ ...capable, deviceMemory: 2 }).tier).toBe(1);
    expect(planStage({ ...capable, hardwareConcurrency: 2 }).tier).toBe(1);
  });

  it("uses the medium tier for touch devices and mid-range memory", () => {
    expect(planStage({ ...capable, coarsePointer: true }).tier).toBe(2);
    expect(planStage({ ...capable, deviceMemory: 4 }).tier).toBe(2);
  });

  it("treats unknown memory/cores (non-Chromium browsers) as capable", () => {
    expect(
      planStage({ ...capable, deviceMemory: undefined, hardwareConcurrency: undefined }).tier,
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
