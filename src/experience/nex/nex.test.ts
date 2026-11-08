import type { Matrix3 } from "three";
import { describe, expect, it } from "vitest";
import { NexMotion } from "./motion";
import { NEX_PARAMS, NEX_SHELL_RADIUS } from "./params";
import { CAMERA_DISTANCE, FILL, placeNex } from "./placement";
import {
  generateNexShape,
  NEX_FIRST_FILAMENT,
  NEX_FIRST_RING,
  NEX_FRAMES,
  NEX_ROLE,
  ORBIT_STRIDE,
} from "./shape";

const roleOf = (orbit: number) => Math.floor(orbit / ORBIT_STRIDE);
const frameOf = (orbit: number) => orbit % ORBIT_STRIDE;

function roleShares(orbits: Float32Array, from = 0, to = orbits.length) {
  const counts = [0, 0, 0, 0, 0];
  for (let i = from; i < to; i++) counts[roleOf(orbits[i]!)]! += 1;
  return counts.map((c) => c / (to - from));
}

describe("NEX parameters", () => {
  it("define nine rings and ten filaments with unit quaternions", () => {
    expect(NEX_PARAMS.rings).toHaveLength(9);
    expect(NEX_PARAMS.filaments).toHaveLength(10);
    for (const { q } of [...NEX_PARAMS.rings, ...NEX_PARAMS.filaments, NEX_PARAMS.core]) {
      expect(Math.hypot(...q)).toBeCloseTo(1, 3);
    }
    expect(Math.hypot(...NEX_PARAMS.view)).toBeCloseTo(1, 3);
  });

  it("keep the orbit table small enough for the vertex uniform budget", () => {
    // Each mat3 uses three vectors and each float one: 21 × 4 = 84 of the 256 WebGL2 guarantees.
    expect(NEX_FRAMES).toBe(21);
    expect(NEX_FRAMES).toBeLessThan(ORBIT_STRIDE);
  });

  it("keep every ring inside the spherical shell NEX is fitted to", () => {
    for (const ring of NEX_PARAMS.rings) {
      for (const [radius] of ring.bands) expect(radius).toBeLessThanOrEqual(NEX_SHELL_RADIUS);
    }
  });
});

describe("generateNexShape", () => {
  const n = 12_000;
  const shape = generateNexShape(n);

  it("is deterministic for a seed and different for another", () => {
    const again = generateNexShape(n);
    expect(again.positions).toEqual(shape.positions);
    expect(again.orbits).toEqual(shape.orbits);
    expect(again.seeds).toEqual(shape.seeds);
    expect(generateNexShape(n, 7).positions).not.toEqual(shape.positions);
  });

  it("fills exactly N particles in the shared AgentCore layout", () => {
    expect(shape.count).toBe(n);
    expect(shape.positions).toHaveLength(n * 3);
    expect(shape.orbits).toHaveLength(n);
    expect(shape.seeds).toHaveLength(n * 4);
    expect(shape.positions.every(Number.isFinite)).toBe(true);
    expect(shape.seeds.every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it("assigns every particle a valid role and orbit frame", () => {
    for (const orbit of shape.orbits) {
      const role = roleOf(orbit);
      const frame = frameOf(orbit);
      expect(role).toBeGreaterThanOrEqual(0);
      expect(role).toBeLessThanOrEqual(NEX_ROLE.halo);
      expect(frame).toBeLessThan(NEX_FRAMES);
      if (role === NEX_ROLE.core) expect(frame).toBe(1);
      if (role === NEX_ROLE.halo) expect(frame).toBe(0);
      if (role === NEX_ROLE.ring || role === NEX_ROLE.bead) {
        expect(frame).toBeGreaterThanOrEqual(NEX_FIRST_RING);
        expect(frame).toBeLessThan(NEX_FIRST_FILAMENT);
      }
      if (role === NEX_ROLE.filament) expect(frame).toBeGreaterThanOrEqual(NEX_FIRST_FILAMENT);
    }
  });

  it("follows the approved composition: core, rings, beads, filaments and halo", () => {
    const [core, rings, beads, filaments, halo] = roleShares(shape.orbits);
    expect(core).toBeCloseTo(0.1, 2);
    expect(rings).toBeCloseTo(0.52, 2);
    expect(beads).toBeGreaterThan(0.02);
    expect(beads).toBeLessThan(0.035);
    expect(filaments).toBeCloseTo(0.2, 2);
    expect(halo).toBeGreaterThan(0.12);
  });

  it("keeps the form spherical: rings within the shell, halo just outside", () => {
    for (let i = 0; i < n; i++) {
      const r = Math.hypot(
        shape.positions[i * 3]!,
        shape.positions[i * 3 + 1]!,
        shape.positions[i * 3 + 2]!,
      );
      const role = roleOf(shape.orbits[i]!);
      if (role === NEX_ROLE.core) expect(r).toBeLessThanOrEqual(NEX_PARAMS.coreRadius * 1.26);
      if (role === NEX_ROLE.ring) expect(r).toBeLessThan(NEX_SHELL_RADIUS + 0.06);
      if (role === NEX_ROLE.halo) {
        expect(r).toBeGreaterThanOrEqual(NEX_PARAMS.halo.inner - 1e-6);
        expect(r).toBeLessThanOrEqual(NEX_PARAMS.halo.inner + NEX_PARAMS.halo.span + 1e-6);
      }
    }
  });

  it("keeps neighbouring particles in the same role, so GPU warps stay coherent", () => {
    let same = 0;
    for (let i = 1; i < n; i++)
      if (roleOf(shape.orbits[i]!) === roleOf(shape.orbits[i - 1]!)) same++;
    expect(same / (n - 1)).toBeGreaterThan(0.95);
  });

  it("is shuffled, so a reduced draw range thins every layer evenly", () => {
    const all = roleShares(shape.orbits);
    const quarter = roleShares(shape.orbits, 0, n / 4);
    all.forEach((share, role) => expect(Math.abs(quarter[role]! - share)).toBeLessThan(0.02));
  });
});

describe("placeNex", () => {
  const viewport = { width: 1200, height: 800 };
  const unitsPerPixel = (2 * CAMERA_DISTANCE * Math.tan((NEX_PARAMS.fov * Math.PI) / 360)) / 800;

  it("centres NEX on its anchor and fits the ring cage to the anchor", () => {
    const centred = placeNex(
      { left: 400, top: 200, width: 400, height: 400 },
      viewport,
      NEX_PARAMS.fov,
    );
    expect(centred.x).toBeCloseTo(0);
    expect(centred.y).toBeCloseTo(0);
    expect(centred.scale * NEX_SHELL_RADIUS).toBeCloseTo(200 * FILL * unitsPerPixel);
    expect(centred.onScreen).toBe(true);
  });

  it("maps right and lower anchors to +x and −y, and uses the shorter side", () => {
    const placed = placeNex(
      { left: 800, top: 500, width: 300, height: 200 },
      viewport,
      NEX_PARAMS.fov,
    );
    expect(placed.x).toBeGreaterThan(0);
    expect(placed.y).toBeLessThan(0);
    expect(placed.scale * NEX_SHELL_RADIUS).toBeCloseTo(100 * FILL * unitsPerPixel);
  });

  it("reports anchors scrolled out of view, or collapsed, as off screen", () => {
    expect(
      placeNex({ left: 400, top: -900, width: 400, height: 400 }, viewport, NEX_PARAMS.fov)
        .onScreen,
    ).toBe(false);
    expect(
      placeNex({ left: 400, top: 1100, width: 400, height: 400 }, viewport, NEX_PARAMS.fov)
        .onScreen,
    ).toBe(false);
    expect(
      placeNex({ left: 400, top: 200, width: 0, height: 0 }, viewport, NEX_PARAMS.fov).onScreen,
    ).toBe(false);
    // Partly visible (the halo still overlaps the viewport).
    expect(
      placeNex({ left: 400, top: -300, width: 400, height: 400 }, viewport, NEX_PARAMS.fov)
        .onScreen,
    ).toBe(true);
  });
});

describe("NexMotion", () => {
  const isRotation = (m: Matrix3) => {
    const e = m.elements;
    const cols = [0, 3, 6].map((o) => [e[o]!, e[o + 1]!, e[o + 2]!]);
    for (const c of cols) expect(Math.hypot(...c)).toBeCloseTo(1, 5);
    expect(m.determinant()).toBeCloseTo(1, 5);
  };

  it("produces one rotation per orbit frame, deterministically", () => {
    const a = new NexMotion();
    const b = new NexMotion();
    a.update(3.2);
    b.update(3.2);
    expect(a.frames).toHaveLength(NEX_FRAMES);
    expect(a.flow).toHaveLength(NEX_FRAMES);
    a.frames.forEach((frame, i) => {
      isRotation(frame);
      expect(frame.elements).toEqual(b.frames[i]!.elements);
    });
  });

  it("spins the rings over time and breathes within the reference amplitude", () => {
    const motion = new NexMotion();
    const ring = motion.frames[NEX_FIRST_RING]!.clone();
    motion.update(2);
    expect(motion.frames[NEX_FIRST_RING]!.elements).not.toEqual(ring.elements);
    for (const t of [0, 1.7, 3.7, 9]) {
      motion.update(t);
      expect(motion.breath).toBeGreaterThanOrEqual(1);
      expect(motion.breath).toBeLessThanOrEqual(1 + NEX_PARAMS.breath.amplitude + 1e-9);
    }
  });
});
