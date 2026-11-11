import { Vector3 } from "three";
import { NEX_HOT, registryPalette } from "../agents/palette";
import type { QualityTier } from "../capabilities";

/**
 * Ambient particle environment: tier settings and the visual parameters that can be tuned
 * (ARCHITECTURE §7, §9.2). Everything visual lives here so art direction can be adjusted in one
 * place without touching shaders or lifecycle code.
 */

export interface TierSettings {
  /** Rendered particle count (one draw call regardless of count). */
  particles: number;
  /** Device-pixel-ratio cap. */
  dprCap: number;
  /** Pointer flow-map resolution (square, ADR-004). */
  flowSize: number;
  /**
   * Backing-pixel limit for the drawing buffer (CSS width × height × DPR²). On very large or
   * HiDPI displays the DPR is lowered until the buffer fits, independently of the DPR cap.
   */
  maxPixels: number;
  /**
   * NEX (Milestone 2.3): particle count N (the fixed AgentCore count for the tier) and whether the
   * faint duplicate glow layer (ARCHITECTURE §6.3 "fake glow", in place of a bloom pass) is drawn.
   */
  nex: { particles: number; glowLayer: boolean };
}

/**
 * Ambient counts follow the §9.2 tier table. Tier 0 never renders. Pixel limits: 1080p, 1440p and
 * 4K-equivalent buffers, so typical laptops and phones keep their full DPR cap.
 */
export const tierSettings: Record<Exclude<QualityTier, 0>, TierSettings> = {
  1: {
    particles: 2_000,
    dprCap: 1,
    flowSize: 64,
    maxPixels: 1920 * 1080,
    nex: { particles: 12_000, glowLayer: false },
  },
  2: {
    particles: 6_000,
    dprCap: 1.5,
    flowSize: 128,
    maxPixels: 2560 * 1440,
    nex: { particles: 30_000, glowLayer: false },
  },
  3: {
    particles: 12_000,
    dprCap: 2,
    flowSize: 256,
    maxPixels: 3840 * 2160,
    nex: { particles: 30_000, glowLayer: true },
  },
};

export function settingsForTier(tier: QualityTier): TierSettings {
  return tierSettings[tier === 0 ? 1 : tier];
}

/** A three-colour palette: base and accent tones plus a rare, brighter "hot" highlight. */
export interface Palette {
  base: string;
  accent: string;
  hot: string;
}

/** sRGB hex → raw RGB vector (bypasses colour management: shaders output these values as-is). */
export function rgb(hex: string): Vector3 {
  const value = Number.parseInt(hex.slice(1), 16);
  return new Vector3(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

/** NEX cyan/teal (DESIGN-BRIEF §2): nex-deep, nex and a pale cyan highlight. */
/** NEX's palette, from the agent registry plus its WebGL-only highlight (Milestone 2.4b.1a). */
export const nexPalette: Palette = registryPalette("nex", NEX_HOT);

/**
 * Tunable look of the ambient field. Values are deliberately restrained: the field should feel
 * alive without competing with the portfolio content in front of it.
 */
export const ambientLook = {
  palette: nexPalette,
  /** Share of particles drawn in the brighter highlight colour (0–1). */
  hotFraction: 0.035,
  /** Overall brightness multiplier (0–1+). */
  brightness: 0.62,
  /** Base point size in CSS pixels for a mid-depth particle (scaled by depth and DPR). */
  size: 2.4,
  /** Global speed multiplier for drift and meander (1 = designed pace). */
  speed: 1,
  /** Horizontal current strength: how fast the field flows left to right. */
  drift: 1,
  /** Amplitude of the slow, wave-like meander (fraction of the viewport height). */
  meander: 0.055,
  /** Gentle brightness shimmer per particle (0 = none). */
  twinkle: 0.18,
  /**
   * Legibility: dim particles behind the main text column. On wide screens content sits on the
   * left, so the dimming fades in from the left edge; on narrow screens it is applied evenly.
   */
  textDimWide: 0.55,
  textDimNarrow: 0.4,
  /** Pointer interaction (ADR-004 flow map). */
  cursor: {
    /** How far particles are pushed by the flow (viewport fraction per unit of flow). */
    influence: 0.045,
    /** Splat radius in UV units (fraction of the viewport height). */
    radius: 0.09,
    /** Per-frame dissipation at 60 fps; normalised by frame time as pow(d, Δt·60). */
    dissipation: 0.955,
    /** How strongly the flow carries itself along (semi-Lagrangian advection scale). */
    advection: 0.5,
    /** Brightness boost for particles stirred by the cursor. */
    glow: 0.6,
  },
} as const;
