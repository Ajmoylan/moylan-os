import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AmbientFieldProps } from "./ambient/AmbientField";
import type { StagePlan } from "./capabilities";
import { MIN_PARTICLE_SHARE, type Quality } from "./performance/quality";
import Stage from "./Stage";

/**
 * Stage quality state (regression for the adaptive-quality desynchronisation).
 *
 * R3F's Canvas re-applies its `dpr` prop on every render, so the Stage must pass the *adapted*
 * range. jsdom has no WebGL, so Canvas and the field are replaced by recorders: the test sees
 * exactly the props R3F and the field would receive across re-renders and tier changes. The
 * real renderer is covered by tests/e2e/quality.spec.ts.
 */

const seen = vi.hoisted(() => ({
  canvas: [] as { dpr: [number, number] }[],
  field: [] as Pick<AmbientFieldProps, "settings" | "particleShare" | "onQualityStep">[],
}));

vi.mock("@react-three/fiber", () => ({
  Canvas: (props: { dpr: [number, number]; children: ReactNode }) => {
    seen.canvas.push({ dpr: props.dpr });
    return <div>{props.children}</div>;
  },
}));

vi.mock("./ambient/AmbientField", () => ({
  AmbientField: (props: AmbientFieldProps) => {
    seen.field.push(props);
    return null;
  },
}));

const full: StagePlan = { tier: 3, motion: "full", pointerEffects: true, reason: "capable" };
const reduced: StagePlan = { tier: 1, motion: "reduced", pointerEffects: false, reason: "capable" };

const lastCanvas = () => seen.canvas.at(-1)!;
const lastField = () => seen.field.at(-1)!;
const step = (next: Quality) => act(() => lastField().onQualityStep(next));

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  act(() => window.dispatchEvent(new Event("resize")));
}

beforeEach(() => {
  seen.canvas.length = 0;
  seen.field.length = 0;
  setViewport(1280, 720);
});

afterEach(() => vi.restoreAllMocks());

describe("Stage adaptive quality", () => {
  it("starts at the tier defaults", () => {
    render(<Stage agent="nex" plan={full} />);
    expect(lastCanvas().dpr).toEqual([1, 2]);
    expect(lastField().particleShare).toBe(1);
    expect(lastField().settings.particles).toBe(12_000);
  });

  it("passes the adapted DPR to the Canvas, so a re-render can't restore the original cap", () => {
    const { rerender } = render(<Stage agent="nex" plan={full} />);
    step({ dprCap: 1.5, particleShare: 1 });
    expect(lastCanvas().dpr).toEqual([1, 1.5]);

    rerender(<Stage agent="forge" plan={full} />); // route change: a new agent
    expect(lastCanvas().dpr).toEqual([1, 1.5]);
  });

  it("keeps the lowest quality across re-renders, tier changes and stale steps", () => {
    const { rerender } = render(<Stage agent="nex" plan={full} />);
    step({ dprCap: 1.5, particleShare: 1 });
    step({ dprCap: 1, particleShare: 1 });
    step({ dprCap: Infinity, particleShare: 0.5 });
    step({ dprCap: Infinity, particleShare: MIN_PARTICLE_SHARE });
    expect(lastCanvas().dpr).toEqual([1, 1]);
    expect(lastField().particleShare).toBe(MIN_PARTICLE_SHARE);

    rerender(<Stage agent="forge" plan={full} />);
    rerender(<Stage agent="forge" plan={reduced} />); // tier 3 → 1
    expect(lastField().settings.particles).toBe(2_000);
    expect(lastField().particleShare).toBe(MIN_PARTICLE_SHARE);
    expect(lastCanvas().dpr).toEqual([1, 1]);

    rerender(<Stage agent="forge" plan={full} />); // tier 1 → 3: new geometry, same share
    expect(lastField().settings.particles).toBe(12_000);
    expect(lastField().particleShare).toBe(MIN_PARTICLE_SHARE);
    expect(lastCanvas().dpr).toEqual([1, 1]);

    step({ dprCap: 2, particleShare: 1 }); // a stale step never raises quality
    expect(lastCanvas().dpr).toEqual([1, 1]);
    expect(lastField().particleShare).toBe(MIN_PARTICLE_SHARE);
  });

  it("keeps quality across visibility changes", () => {
    render(<Stage agent="nex" plan={full} />);
    step({ dprCap: 1.5, particleShare: 0.5 });
    for (const hidden of [true, false]) {
      vi.spyOn(document, "hidden", "get").mockReturnValue(hidden);
      act(() => document.dispatchEvent(new Event("visibilitychange")));
    }
    expect(lastCanvas().dpr).toEqual([1, 1.5]);
    expect(lastField().particleShare).toBe(0.5);
  });

  it("applies the backing-pixel limit on large viewports, together with the adaptation", () => {
    render(<Stage agent="nex" plan={full} />);
    setViewport(2560, 1440); // limit 1.5 for the tier-3 4K-equivalent budget
    expect(lastCanvas().dpr).toEqual([1, 1.5]);
    step({ dprCap: 1, particleShare: 1 });
    expect(lastCanvas().dpr).toEqual([1, 1]);
    setViewport(1280, 720); // a smaller window never undoes the adaptation
    expect(lastCanvas().dpr).toEqual([1, 1]);
  });
});
