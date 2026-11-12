import { ARRIVAL_SECONDS, FADE_SECONDS, NEX_ANCHOR, NEX_PACE, NexAvatar } from "../nex/NexAvatar";
import { placeNex } from "../nex/placement";
import { nexMorphModule } from "../nex/shaders";
import { generateNexShape, NEX_SEED } from "../nex/shape";
import { NEX_HOT } from "./palette";
import type { AgentRenderDefinition } from "./types";

/**
 * NEX as an AgentCore definition (Milestone 2.4b.1a): the approved V3 generator, uniform orbit
 * transport and renderer, unchanged. The NEX modules (`src/experience/nex/`) are used as they are.
 */
export const nexDefinition: AgentRenderDefinition = {
  id: "nex",
  version: 1,
  seed: NEX_SEED,
  generate: (count, seed) => generateNexShape(count, seed),
  // Point program vertex-uniform vectors, measured with getActiveUniform: uniform transport 112
  // (`uFrames[21]` mat3 = 63, `uOrbitFlow[21]` = 21; inside the WebGL2 guarantee of 256 on every
  // device), texture transport 49 plus one sampler: the matrices move to the table, the 21 flow
  // speeds stay uniforms (Milestone 2.4b.1b).
  transports: { idle: ["uniforms", "texture"], uniformVectors: { uniforms: 112, texture: 49 } },
  hotOverride: NEX_HOT,
  // The approved Milestone 2.3 values, applied by TransitionClock since 2.4b.2.
  timing: { arrival: ARRIVAL_SECONDS, fade: FADE_SECONDS, pace: NEX_PACE },
  placement: { kind: "anchor", selector: NEX_ANCHOR, place: placeNex },
  // The host agent takes slot A of every pair morph program: its approved point shader as a module.
  morph: { slot: "A", module: (transport) => nexMorphModule(transport === "texture") },
  createView: (engine, context) => new NexAvatar(engine, context),
};
