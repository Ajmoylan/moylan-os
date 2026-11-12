import { placeNex, type Placement } from "../../nex/placement";

/**
 * TEST's fixed placement (Milestone 2.4b.2): a deterministic viewport position with no DOM anchor,
 * so no page's layout changes for the diagnostic. Wide viewports: right of centre, beside the
 * page's content column; narrow ones: low and centred. Converted to world units exactly as NEX's
 * anchor box is.
 */
export function placeTest(
  viewport: { width: number; height: number },
  fov: number,
  out: Placement,
): Placement {
  const { width, height } = viewport;
  const wide = width >= 768;
  const side = wide ? Math.min(width, height) * 0.46 : Math.min(width * 0.62, height * 0.4);
  const cx = wide ? width * 0.72 : width * 0.5;
  const cy = wide ? height * 0.5 : height * 0.68;
  return placeNex(
    { left: cx - side / 2, top: cy - side / 2, width: side, height: side },
    viewport,
    fov,
    out,
  );
}
