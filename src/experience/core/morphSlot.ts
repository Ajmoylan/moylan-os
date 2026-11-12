import { BufferGeometry, type BufferAttribute } from "three";

/**
 * The morph geometry (Milestone 2.4b.2): one draw that sees both shapes. Slot A (`position`,
 * `aOrbit`, `aSeed`) is the source shape and slot B (`positionB`, `aOrbitB`, `aSeedB`) the
 * destination, particle i of one paired with particle i of the other (ADR-003, equal-count slots).
 *
 * **GPU buffer ownership (Codex finding 3, resolved 11 November 2026).** Three.js keys GPU buffers
 * by `BufferAttribute` *object* (WebGLAttributes' WeakMap), uploads them at first draw, and
 * `geometry.dispose()` deletes the buffer of every attribute registered on that geometry, then
 * releases its vertex arrays. So:
 * - each agent's renderer owns one attribute set, wrapping its immutable cached arrays;
 * - the morph geometry **borrows those same attribute objects**: it allocates no GPU buffer of its
 *   own (only vertex-array state), and the destination's set is uploaded once and reused by the
 *   destination's own renderer after the handoff;
 * - the morph geometry is released with `releaseMorphGeometry()`, which detaches the borrowed
 *   attributes before `dispose()`, so only its vertex arrays go;
 * - it must be released **before** either renderer it borrows from is disposed or replaces its
 *   particle geometry (AgentCore orders this: handoff, reversal, tier change, context loss).
 *
 * Peak particle-buffer memory during a transition is therefore the two renderers' sets (0.96 MB each
 * at 30 000 particles), and it returns to one set once the source renderer is released.
 */

/** A renderer's particle attributes (the GPU buffers it owns). */
export interface ParticleAttributes {
  position: BufferAttribute;
  orbit: BufferAttribute;
  seed: BufferAttribute;
}

const SLOT_A = { position: "position", orbit: "aOrbit", seed: "aSeed" } as const;
const SLOT_B = { position: "positionB", orbit: "aOrbitB", seed: "aSeedB" } as const;

/** The layout every slot's attributes must have: item sizes per particle. */
const ITEM_SIZE = { position: 3, orbit: 1, seed: 4 } as const;

/**
 * Validates both attribute sets before anything is built (and so before any GPU resource can be
 * allocated): every attribute has its layout's item size and the same particle count N, in both
 * slots. Throws with the first problem found.
 */
export function validateMorphAttributes(
  source: ParticleAttributes,
  destination: ParticleAttributes,
): number {
  const count = source.position.count;
  for (const [slot, set] of [
    ["source", source],
    ["destination", destination],
  ] as const) {
    for (const key of ["position", "orbit", "seed"] as const) {
      const attribute = set[key];
      if (!attribute || !(attribute as { isBufferAttribute?: boolean }).isBufferAttribute) {
        throw new Error(`Morph ${slot} ${key} is not a BufferAttribute`);
      }
      if (attribute.itemSize !== ITEM_SIZE[key]) {
        throw new Error(
          `Morph ${slot} ${key} has item size ${attribute.itemSize}, expected ${ITEM_SIZE[key]}`,
        );
      }
      if (attribute.count !== count) {
        throw new Error(`Morph ${slot} ${key} has ${attribute.count} particles, expected ${count}`);
      }
    }
  }
  if (count <= 0) throw new Error("Morph shapes are empty");
  return count;
}

/** Builds the morph geometry from the two renderers' own attributes (borrowed, not copied). */
export function createMorphGeometry(
  source: ParticleAttributes,
  destination: ParticleAttributes,
): BufferGeometry {
  validateMorphAttributes(source, destination);
  const geometry = new BufferGeometry();
  for (const key of ["position", "orbit", "seed"] as const) {
    geometry.setAttribute(SLOT_A[key], source[key]);
    geometry.setAttribute(SLOT_B[key], destination[key]);
  }
  return geometry;
}

/**
 * Releases a morph geometry without touching the borrowed GPU buffers: the attributes are
 * detached first, so `dispose()` deletes only the geometry's own vertex-array state.
 */
export function releaseMorphGeometry(geometry: BufferGeometry): void {
  for (const name of Object.keys(geometry.attributes)) geometry.deleteAttribute(name);
  geometry.dispose();
}
