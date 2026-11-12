import { describe, expect, it } from "vitest";
import type { Placement } from "../nex/placement";
import { easeInOutCubic } from "./machine";
import {
  advanceSegment,
  copyPlacement,
  movedSubstantially,
  SEGMENT_MOVE_PX,
  startSegment,
} from "./placement";
import { createTransition } from "./StageTransition";

/**
 * Placement continuity (proposal §8.4): segments start from the transform drawn last frame,
 * interpolate with their own progress (scale in log space), and a target that moves substantially
 * starts a new segment without a jump. Wired into the morph in stage D; pure here.
 */

const at = (x: number, y: number, scale: number, onScreen = true): Placement => ({
  x,
  y,
  scale,
  onScreen,
});

describe("placement segments", () => {
  it("start from the displayed transform and end exactly on the target", () => {
    const p = createTransition().placement;
    copyPlacement(p.displayed, at(-1, 0.5, 0.4));
    startSegment(p, at(2, -1, 1.6));
    expect(p.from).toEqual(at(-1, 0.5, 0.4));
    expect(p.segment).toBe(1);
    advanceSegment(p, 0.5, 1);
    const t = easeInOutCubic(0.5);
    expect(p.displayed.x).toBeCloseTo(-1 + 3 * t, 12);
    // Log-space scale: halfway between 0.4 and 1.6 is their geometric mean.
    expect(p.displayed.scale).toBeCloseTo(Math.sqrt(0.4 * 1.6), 12);
    advanceSegment(p, 0.6, 1);
    expect(p.progress).toBe(1);
    expect(p.displayed).toEqual(at(2, -1, 1.6));
  });

  it("a new segment mid-way starts from the transform on screen: no jump", () => {
    const p = createTransition().placement;
    copyPlacement(p.displayed, at(0, 0, 1));
    startSegment(p, at(4, 0, 1));
    advanceSegment(p, 0.3, 1);
    const onScreen = { ...p.displayed };
    startSegment(p, at(-2, 1, 1)); // the destination anchor moved
    expect(p.from).toEqual(onScreen);
    expect(p.displayed).toEqual(onScreen);
    expect(p.segment).toBe(2);
    advanceSegment(p, 0.001, 1);
    expect(Math.abs(p.displayed.x - onScreen.x)).toBeLessThan(1e-6);
  });

  it("only substantial moves start a segment (> 4 CSS px or > 2 % scale)", () => {
    const unitsPerPixel = 0.01;
    const a = at(0, 0, 1);
    expect(
      movedSubstantially(a, at((SEGMENT_MOVE_PX - 1) * unitsPerPixel, 0, 1), unitsPerPixel),
    ).toBe(false);
    expect(
      movedSubstantially(a, at((SEGMENT_MOVE_PX + 1) * unitsPerPixel, 0, 1), unitsPerPixel),
    ).toBe(true);
    expect(movedSubstantially(a, at(0, 0, 1.01), unitsPerPixel)).toBe(false);
    expect(movedSubstantially(a, at(0, 0, 1.03), unitsPerPixel)).toBe(true);
    expect(movedSubstantially(at(0, 0, 0), at(0, 0, 1), unitsPerPixel)).toBe(true);
  });

  it("allocates nothing and is visible while either end is on screen", () => {
    const p = createTransition().placement;
    const { displayed, from, to } = p;
    copyPlacement(p.displayed, at(0, 0, 1, false));
    startSegment(p, at(1, 1, 1, true));
    advanceSegment(p, 0.1, 1);
    expect(p.displayed.onScreen).toBe(true);
    expect([p.displayed, p.from, p.to]).toEqual([displayed, from, to]);
    expect(p.displayed).toBe(displayed);
  });
});
