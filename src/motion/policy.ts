/**
 * Motion preference policy (ARCHITECTURE §10). Pure and dependency-free so it can be shared by
 * the DOM shell, the composition root and (from Milestone 2.2) the WebGL stage.
 *
 *   Site setting   Effective motion                                   OS preference changes
 *   System         "reduced" if prefers-reduced-motion, else "full"   followed live
 *   Full           "full"                                             ignored (explicit choice)
 *   Reduced        "reduced"                                          ignored (explicit choice)
 *   Off            "off"                                              ignored (explicit choice)
 */

/** What the visitor chose in the motion control. "system" is the default and stores nothing. */
export type MotionSetting = "system" | "full" | "reduced" | "off";

/**
 * What actually applies:
 * - full: all motion the device's quality tier allows, including pointer-driven effects.
 * - reduced: minimal decorative movement, no pointer-driven effects, cross-fades instead of morphs.
 * - off: no decorative animation at all; the static design is shown and no 3D work happens.
 */
export type EffectiveMotion = "full" | "reduced" | "off";

/** Display order of the motion control's options. */
export const motionSettings: readonly MotionSetting[] = ["system", "full", "reduced", "off"];

export function resolveMotion(
  setting: MotionSetting,
  systemPrefersReduced: boolean,
): EffectiveMotion {
  if (setting === "system") return systemPrefersReduced ? "reduced" : "full";
  return setting;
}
