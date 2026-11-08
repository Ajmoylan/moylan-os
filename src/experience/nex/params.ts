/**
 * NEX shape parameters: the approved "V3 · Spherical intelligence" form (Milestone 2.3).
 *
 * Derived from a Higgsfield-designed reference model: its composition (nine orbital rings with
 * their band radii and glow levels, tilts, spin speeds and directions, orbiting beads and hubs,
 * core size, breathing and sway) was extracted once and re-proportioned into a contained sphere
 * (outer ring −18%, inner rings re-spaced towards one shell, ring tilts relaxed towards an even
 * spread). The reference model itself is not part of the application: only these numbers are,
 * and everything is rendered procedurally (ARCHITECTURE §6).
 *
 * Units: NEX-local space, ring radius ≈ 0.75. Angles in radians, times in seconds, quaternions as
 * [x, y, z, w]. Ring-local circles lie in the XZ plane (normal +Y) and spin about +Y.
 */

export type Quat = readonly [number, number, number, number];

export interface NexRing {
  /** Ring-plane orientation. */
  q: Quat;
  /** Spin about the ring normal (rad/s at reference timing; signed). */
  spin: number;
  /** Energy-pulse speed around the ring (revolutions/s; signed). */
  flow: number;
  /** Bands: [radius, glow]; glow 0 is the structural band, up to 1 the brightest emissive band. */
  bands: readonly (readonly [number, number])[];
  /** Beads (orbiting particles) and hubs: [angle, radius, size, hub 0|1]. */
  beads: readonly (readonly [number, number, number, number])[];
}

export interface NexFilament {
  q: Quat;
  spin: number;
  flow: number;
  radius: number;
}

export const NEX_PARAMS = {
  coreRadius: 0.155,
  /** Core breathing: scale amplitude and period. */
  breath: { amplitude: 0.055, period: 7.4792 },
  /** Whole-avatar yaw sway: amplitude (rad) and period. */
  sway: { amplitude: 0.0524, period: 14.9583 },
  /** Three-quarter presentation (the reference camera's view), applied as a rotation. */
  view: [0.1316, -0.3224, -0.0453, 0.9363] as Quat,
  /** Vertical field of view of the reference camera (degrees). */
  fov: 20.8617,
  halo: { spin: 0.03, inner: 0.8, span: 0.32 },
  core: { q: [0.1903, 0, 0.0571, 0.9801] as Quat, spin: 0.12 },
  rings: [
    {
      q: [0.0274, -0.0057, 0.2016, 0.9791],
      spin: -0.42,
      flow: -0.09,
      bands: [
        [0.7482, 0],
        [0.7528, 0.6795],
        [0.7359, 1],
      ],
      beads: [
        [0.5236, 0.738, 0.044, 1],
        [2.618, 0.738, 0.044, 1],
        [-1.5708, 0.738, 0.044, 1],
      ],
    },
    {
      q: [0.7159, -0.0053, 0.0053, 0.6981],
      spin: 0.42,
      flow: 0.11,
      bands: [
        [0.4, 0],
        [0.4012, 0.6795],
      ],
      beads: [[0, 0.3871, 0.0209, 0]],
    },
    {
      q: [0.0682, -0.0237, -0.5334, 0.8428],
      spin: -0.42,
      flow: -0.13,
      bands: [
        [0.5238, 0],
        [0.5251, 0.6795],
      ],
      beads: [[3.0543, 0.5108, 0.0171, 0]],
    },
    {
      q: [0.4203, -0.1436, -0.0782, 0.8925],
      spin: 0.8401,
      flow: 0.09,
      bands: [
        [0.5762, 0],
        [0.5775, 0.6795],
      ],
      beads: [[-1.309, 0.5632, 0.0228, 0]],
    },
    {
      q: [0.8655, 0.2381, 0.1846, 0.4002],
      spin: -0.42,
      flow: -0.11,
      bands: [
        [0.616, 0],
        [0.6172, 0.6795],
      ],
      beads: [[2.618, 0.6037, 0.0162, 0]],
    },
    {
      q: [0.2037, 0.1067, 0.5344, 0.8134],
      spin: 0.42,
      flow: 0.13,
      bands: [
        [0.6492, 0],
        [0.6504, 0.6795],
      ],
      beads: [[0.4363, 0.6382, 0.0247, 0]],
    },
    {
      q: [0.4633, -0.1163, -0.4509, 0.754],
      spin: -0.8401,
      flow: -0.09,
      bands: [
        [0.6793, 0],
        [0.6803, 0.6795],
      ],
      beads: [[0.3491, 0.6677, 0.019, 0]],
    },
    {
      q: [0.026, 0.0072, -0.1549, 0.9876],
      spin: 0.42,
      flow: 0.11,
      bands: [
        [0.7061, 0],
        [0.7071, 1],
      ],
      beads: [[1.4835, 0.6946, 0.0152, 0]],
    },
    {
      q: [0.7437, -0.4892, -0.2971, 0.3456],
      spin: -0.42,
      flow: -0.13,
      bands: [
        [0.73, 0],
        [0.731, 0.6795],
      ],
      beads: [[0.0873, 0.7205, 0.0181, 0]],
    },
  ] as readonly NexRing[],
  /** Procedural great-circle filaments close to the outer shell. */
  filaments: [
    { q: [-0.456, 0, 0.7388, 0.4962], spin: -0.1546, flow: -0.052, radius: 0.6184 },
    { q: [0.5192, 0, 0.5281, 0.672], spin: -0.0621, flow: -0.0592, radius: 0.6367 },
    { q: [-0.9152, 0, -0.3263, 0.2366], spin: 0.0667, flow: 0.0404, radius: 0.6694 },
    { q: [0.6206, 0, 0.1991, 0.7584], spin: 0.1501, flow: 0.0444, radius: 0.7187 },
    { q: [-0.1934, 0, 0.6355, 0.7474], spin: -0.1387, flow: -0.0625, radius: 0.715 },
    { q: [0.0371, 0, 0.8717, 0.4886], spin: 0.0807, flow: 0.068, radius: 0.7655 },
    { q: [-0.8418, 0, 0.3163, 0.4374], spin: 0.0827, flow: 0.0362, radius: 0.644 },
    { q: [0.5268, 0, 0.2809, 0.8022], spin: 0.1204, flow: 0.0461, radius: 0.635 },
    { q: [0.3014, 0, -0.8799, 0.3674], spin: 0.1015, flow: 0.0457, radius: 0.6424 },
    { q: [0.8744, 0, -0.3577, 0.3278], spin: -0.0945, flow: -0.0638, radius: 0.7144 },
  ] as readonly NexFilament[],
} as const;

/** Outer extent of the ring cage: the size NEX is fitted to on screen. */
export const NEX_SHELL_RADIUS = 0.76;
