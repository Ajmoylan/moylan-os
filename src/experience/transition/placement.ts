import type { Placement } from "../nex/placement";
import { easeInOutCubic } from "./machine";
import type { StagePlacement } from "./StageTransition";

/**
 * Placement continuity during transitions (proposal §8.4), pure and allocation-free.
 *
 * Placement interpolates along *segments*, independent of the shape morph: a segment starts from
 * the transform drawn last frame (`displayed`, retained in memory, so a source anchor that vanished
 * with the old route can't move or zero the source), runs towards `to` with its own progress, and a
 * new segment starts when the destination's target arrives or moves substantially. Scale is
 * interpolated in log space. Outside a transition the drawn placement is the target itself.
 */

/** A target that moved by more than this (CSS px, or relative scale) starts a new segment. */
export const SEGMENT_MOVE_PX = 4;
export const SEGMENT_SCALE = 0.02;
/** Shortest placement segment (s). */
export const SEGMENT_MIN_SECONDS = 0.25;

export function copyPlacement(out: Placement, from: Placement): Placement {
  out.x = from.x;
  out.y = from.y;
  out.scale = from.scale;
  out.onScreen = from.onScreen;
  return out;
}

/** Has the target moved enough to start a new segment? (`unitsPerPixel`: world units per CSS px.) */
export function movedSubstantially(a: Placement, b: Placement, unitsPerPixel: number): boolean {
  const px = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(unitsPerPixel, Number.EPSILON);
  const scale = a.scale > 0 ? Math.abs(b.scale / a.scale - 1) : b.scale > 0 ? Infinity : 0;
  return px > SEGMENT_MOVE_PX || scale > SEGMENT_SCALE;
}

/** Starts a segment from the transform on screen now towards `target`. */
export function startSegment(p: StagePlacement, target: Placement): void {
  copyPlacement(p.from, p.displayed);
  copyPlacement(p.to, target);
  p.progress = 0;
  p.segment++;
}

/** Advances the segment by `step` seconds of `duration` and writes the drawn transform. */
export function advanceSegment(p: StagePlacement, step: number, duration: number): void {
  p.progress = Math.min(1, p.progress + step / Math.max(duration, Number.EPSILON));
  const t = easeInOutCubic(p.progress);
  const { from, to, displayed } = p;
  displayed.x = from.x + (to.x - from.x) * t;
  displayed.y = from.y + (to.y - from.y) * t;
  displayed.scale =
    from.scale > 0 && to.scale > 0
      ? Math.exp(Math.log(from.scale) + (Math.log(to.scale) - Math.log(from.scale)) * t)
      : from.scale + (to.scale - from.scale) * t;
  displayed.onScreen = from.onScreen || to.onScreen;
  if (p.progress >= 1) copyPlacement(displayed, to);
}
