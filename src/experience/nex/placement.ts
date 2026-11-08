import { NEX_SHELL_RADIUS } from "./params";

/**
 * Where NEX sits on screen (pure, unit-tested). The stage canvas fills the viewport behind the
 * DOM; the page marks NEX's place with a layout-only anchor element (`data-stage-anchor="nex"`).
 * NEX is centred on that box and scaled so its ring cage fills `FILL` of the box's shorter side;
 * its halo and atmosphere extend beyond the box, behind the content.
 */

/** Share of the anchor's shorter side covered by the ring cage. */
export const FILL = 0.88;
/** Camera distance from the plane NEX sits on (NEX-local units at scale 1). */
export const CAMERA_DISTANCE = 7.8;

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Placement {
  /** World position on the z = 0 plane. */
  x: number;
  y: number;
  /** NEX-local → world scale. */
  scale: number;
  /** Whether any part of NEX (including its halo) overlaps the viewport. */
  onScreen: boolean;
}

/** Writes into `out` (preallocated by the caller, so a frame never allocates) and returns it. */
export function placeNex(
  rect: Rect,
  viewport: { width: number; height: number },
  fovDegrees: number,
  out: Placement = { x: 0, y: 0, scale: 0, onScreen: false },
): Placement {
  const unitsPerPixel =
    (2 * CAMERA_DISTANCE * Math.tan((fovDegrees * Math.PI) / 360)) / Math.max(1, viewport.height);
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const radiusPx = (Math.min(rect.width, rect.height) / 2) * FILL;
  // The halo reaches ≈ 1.5 × the ring radius.
  const reach = radiusPx * 1.5;
  out.x = (cx - viewport.width / 2) * unitsPerPixel;
  out.y = (viewport.height / 2 - cy) * unitsPerPixel;
  out.scale = (radiusPx * unitsPerPixel) / NEX_SHELL_RADIUS;
  out.onScreen =
    radiusPx > 0 &&
    cx + reach > 0 &&
    cx - reach < viewport.width &&
    cy + reach > 0 &&
    cy - reach < viewport.height;
  return out;
}
