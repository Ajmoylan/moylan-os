import { BufferAttribute, BufferGeometry } from "three";
import type { AgentShape } from "../agents/types";

/**
 * Shape slot A (Milestone 2.4b.1a): one agent shape as a Three.js-managed geometry, in the layout
 * the NEX shaders read (`position`, `aOrbit`, `aSeed`). Three.js owns the GPU buffers, so context
 * restore and disposal keep their 2.4a semantics. The draw range selects a prefix of the indices;
 * every generator orders its particles so any prefix is representative. Slot B (morphing) arrives
 * in 2.4b.2.
 */
export function createShapeSlot(shape: AgentShape): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(shape.positions, 3));
  geometry.setAttribute("aOrbit", new BufferAttribute(shape.orbits, 1));
  geometry.setAttribute("aSeed", new BufferAttribute(shape.seeds, 4));
  return geometry;
}
