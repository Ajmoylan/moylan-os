import { createRandom } from "../ambient/particles";
import { NEX_PARAMS } from "./params";

/**
 * NEX shape generator (ARCHITECTURE §6.1): pure and seeded, no Three.js. Produces N particle
 * targets for the approved V3 form, in the shared AgentCore layout:
 *
 *   positions  N × 3  target in the particle's orbit frame
 *   orbits     N × 1  role × 32 + orbit-frame index (rings and filaments spin as whole frames)
 *   seeds      N × 4  phase, speed, size, intensity, each in [0, 1)
 *
 * Ordering: particles are shuffled within each role, cut into blocks of BLOCK particles, and the
 * blocks of all roles are interleaved in proportion. So any prefix is a representative sample (the
 * adaptive-quality draw range thins every part of NEX evenly instead of dropping whole layers),
 * while consecutive particles share a role, so GPU warps run one role's shader branch, not all
 * five. A future morph pairs particle i of one agent with particle i of the next; every generator
 * only has to produce the same N.
 */

export const NEX_ROLE = { core: 0, ring: 1, bead: 2, filament: 3, halo: 4 } as const;
type Role = (typeof NEX_ROLE)[keyof typeof NEX_ROLE];

/** Orbit frames: 0 halo, 1 core, then the rings, then the filaments. */
export const NEX_FIRST_RING = 2;
export const NEX_FIRST_FILAMENT = NEX_FIRST_RING + NEX_PARAMS.rings.length;
export const NEX_FRAMES = NEX_FIRST_FILAMENT + NEX_PARAMS.filaments.length;
/** Packing factor for role and frame in one float attribute. */
export const ORBIT_STRIDE = 32;

export interface NexShape {
  count: number;
  positions: Float32Array;
  orbits: Float32Array;
  seeds: Float32Array;
}

const SHARE = { core: 0.1, rings: 0.52, beads: 0.03, filaments: 0.2 };

/** Particles per role-coherent block (a GPU warp on most hardware). */
export const BLOCK = 32;

function gaussian(random: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(1e-7, random()))) * Math.cos(2 * Math.PI * random());
}

export function generateNexShape(count: number, seed = 0x6e6578): NexShape {
  const random = createRandom(seed);
  const positions = new Float32Array(count * 3);
  const orbits = new Float32Array(count);
  const seeds = new Float32Array(count * 4);
  let i = 0;

  const put = (x: number, y: number, z: number, frame: number, role: Role, intensity: number) => {
    if (i >= count) return;
    positions.set([x, y, z], i * 3);
    orbits[i] = role * ORBIT_STRIDE + frame;
    seeds.set([random(), random(), random(), Math.min(1, Math.max(0, intensity))], i * 4);
    i++;
  };
  // A point on a ring-local circle (XZ plane), with radial and vertical spread.
  const circle = (frame: number, role: Role, intensity: number, r: number, a: number, dy = 0) =>
    put(r * Math.cos(a), dy, -r * Math.sin(a), frame, role, intensity);
  const sphere = (r: number, squash: number, frame: number, role: Role, intensity: number) => {
    const u = random() * 2 - 1;
    const a = random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    put(s * Math.cos(a) * r, u * r * squash, s * Math.sin(a) * r, frame, role, intensity);
  };

  // Core: dense and Gaussian; the shader arranges it into the layered "living" core.
  const { coreRadius, rings, filaments, halo } = NEX_PARAMS;
  for (let k = Math.round(count * SHARE.core); k > 0; k--) {
    const r = Math.min(1.25, Math.abs(gaussian(random)) * 0.5) * coreRadius;
    sphere(r, 1, 1, NEX_ROLE.core, 1 - r / coreRadius / 2);
  }

  // Rings: share by circumference (outer ring weighted up). Bright, tight particles on the
  // emissive bands; a dimmer, softer body on the structural band.
  const weights = rings.map((ring, index) => (ring.bands[0]?.[0] ?? 0.5) * (index === 0 ? 1.6 : 1));
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  rings.forEach((ring, index) => {
    const frame = NEX_FIRST_RING + index;
    const glowing = ring.bands.filter(([, glow]) => glow > 0);
    const body = ring.bands.find(([, glow]) => glow === 0) ?? ring.bands[0];
    for (let k = Math.round((count * SHARE.rings * weights[index]!) / weightSum); k > 0; k--) {
      const bright = glowing.length > 0 && random() < 0.8;
      const band = bright ? glowing[Math.floor(random() * glowing.length)] : body;
      if (!band) continue;
      const [radius, glow] = band;
      const spread = bright ? 0.0022 : 0.011;
      circle(
        frame,
        NEX_ROLE.ring,
        bright ? glow * (0.7 + 0.3 * random()) : 0.08 + 0.25 * random(),
        radius + gaussian(random) * spread,
        random() * Math.PI * 2,
        gaussian(random) * spread * 0.6,
      );
    }
  });

  // Beads with comet trails (inner rings) and hubs (outer ring).
  const beadCount = rings.reduce((n, ring) => n + ring.beads.length, 0);
  const perBead = Math.max(1, Math.floor((count * SHARE.beads) / beadCount));
  rings.forEach((ring, index) => {
    const frame = NEX_FIRST_RING + index;
    const direction = Math.sign(ring.spin) || 1;
    for (const [angle, radius, size, hub] of ring.beads) {
      for (let k = 0; k < perBead; k++) {
        if (hub || random() < 0.55) {
          const spread = size * (hub ? 0.25 : 0.32);
          const x = (radius + gaussian(random) * spread) * Math.cos(angle);
          const z = -(radius + gaussian(random) * spread) * Math.sin(angle);
          put(
            x,
            gaussian(random) * spread,
            z,
            frame,
            NEX_ROLE.bead,
            hub ? 0.55 : 0.85 + 0.15 * random(),
          );
        } else {
          const lag = random() ** 2;
          circle(frame, NEX_ROLE.bead, 0.9 * (1 - lag), radius, angle - direction * lag * 0.7);
        }
      }
    }
  });

  // Filaments: great circles near the outer shell carrying flowing dashes of light.
  const perFilament = Math.round((count * SHARE.filaments) / filaments.length);
  filaments.forEach((filament, index) => {
    for (let k = 0; k < perFilament; k++) {
      circle(
        NEX_FIRST_FILAMENT + index,
        NEX_ROLE.filament,
        random(),
        filament.radius + gaussian(random) * 0.0015,
        random() * Math.PI * 2,
        gaussian(random) * 0.0015,
      );
    }
  });

  // Halo: a thin, round atmosphere just outside the shell (the remainder of N).
  while (i < count) {
    sphere(halo.inner + halo.span * random() ** 1.7, 1, 0, NEX_ROLE.halo, random());
  }

  // Roles were generated as contiguous runs (core, rings, beads, filaments, halo). Shuffle within
  // each run (seeded Fisher–Yates), cut it into blocks and give block k of a run with B blocks the
  // key (k + 0.5) / B; sorting all blocks by key interleaves the roles in proportion.
  const blocks: { start: number; end: number; key: number }[] = [];
  let start = 0;
  for (let end = 1; end <= count; end++) {
    const role = (k: number) => Math.floor(orbits[k]! / ORBIT_STRIDE);
    if (end < count && role(end) === role(start)) continue;
    for (let a = end - 1; a > start; a--) {
      const b = start + Math.floor(random() * (a - start + 1));
      swap(positions, a, b, 3);
      swap(orbits, a, b, 1);
      swap(seeds, a, b, 4);
    }
    const runBlocks = Math.ceil((end - start) / BLOCK);
    for (let k = 0; k < runBlocks; k++) {
      blocks.push({
        start: start + k * BLOCK,
        end: Math.min(end, start + (k + 1) * BLOCK),
        key: (k + 0.5) / runBlocks,
      });
    }
    start = end;
  }
  blocks.sort((a, b) => a.key - b.key);
  const out = {
    count,
    positions: new Float32Array(count * 3),
    orbits: new Float32Array(count),
    seeds: new Float32Array(count * 4),
  };
  let o = 0;
  for (const block of blocks) {
    const n = block.end - block.start;
    out.positions.set(positions.subarray(block.start * 3, block.end * 3), o * 3);
    out.orbits.set(orbits.subarray(block.start, block.end), o);
    out.seeds.set(seeds.subarray(block.start * 4, block.end * 4), o * 4);
    o += n;
  }
  return out;
}

function swap(array: Float32Array, a: number, b: number, stride: number) {
  for (let c = 0; c < stride; c++) {
    const t = array[a * stride + c]!;
    array[a * stride + c] = array[b * stride + c]!;
    array[b * stride + c] = t;
  }
}
