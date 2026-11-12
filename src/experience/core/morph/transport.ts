import type { AgentRenderDefinition, OrbitTransport } from "../../agents/types";
import { VERTEX_UNIFORM_HEADROOM } from "../capabilities";

/**
 * The morph program's orbit transport (Milestone 2.4b.2; proposal §6.6), resolved automatically
 * per pair and device, independently of the `?orbits=` idle switch:
 * - slot A (the host agent) may use either transport it declares; slot B uses its own (uniforms);
 * - candidates: slot A's idle transport first (no extra table), then the other;
 * - the texture transport needs the context's capability probe;
 * - the pair must fit the device's vertex-uniform vectors with headroom: slot A's vectors for the
 *   candidate (its flow-speed array included) + slot B's (its own arrays included) + the morph's
 *   own, ≤ MAX_VERTEX_UNIFORM_VECTORS − 32.
 * Nothing fits → null: the morph can't run here and the change is a swap (the agreed fallback).
 * NEX's idle rendering keeps its own transport (the uniform default) whatever the morph uses.
 */

/** Vectors kept free for the driver and Three.js's built-ins (proposal §6.6; one shared value). */
export { VERTEX_UNIFORM_HEADROOM };
/** The morph program's own vertex uniforms (`uMorph`, `uLight`). */
export const MORPH_UNIFORM_VECTORS = 2;

export interface MorphTransportQuery {
  slotA: AgentRenderDefinition;
  slotB: AgentRenderDefinition;
  /** Slot A's view's idle transport. */
  idle: OrbitTransport;
  /** The context's MAX_VERTEX_UNIFORM_VECTORS (`renderer.capabilities.maxVertexUniforms`). */
  maxVertexUniforms: number;
  /** The orbit-texture probe (asked lazily: only when the texture transport is a candidate). */
  textureAvailable(): boolean;
  /** Slot A's transports still viable on this context (its idle program didn't fail; §6.6). */
  slotAViable?(transport: OrbitTransport): boolean;
}

export function resolveMorphTransport(query: MorphTransportQuery): OrbitTransport | null {
  const { slotA, slotB, idle, maxVertexUniforms } = query;
  if (slotA.morph?.slot !== "A" || slotB.morph?.slot !== "B") return null;
  const slotBVectors = slotB.transports.uniformVectors.uniforms;
  if (slotBVectors === undefined || !slotB.transports.idle.includes("uniforms")) return null;
  const budget = maxVertexUniforms - VERTEX_UNIFORM_HEADROOM;
  const candidates: OrbitTransport[] =
    idle === "uniforms" ? ["uniforms", "texture"] : ["texture", "uniforms"];
  for (const candidate of candidates) {
    const vectors = slotA.transports.uniformVectors[candidate];
    if (vectors === undefined || !slotA.transports.idle.includes(candidate)) continue;
    if (vectors + slotBVectors + MORPH_UNIFORM_VECTORS > budget) continue;
    if (query.slotAViable && !query.slotAViable(candidate)) continue;
    if (candidate === "texture" && !query.textureAvailable()) continue;
    return candidate;
  }
  return null;
}
