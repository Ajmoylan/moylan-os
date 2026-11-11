import { NexAvatar } from "../nex/NexAvatar";
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
  createView: (engine, context) => new NexAvatar(engine, context),
};
