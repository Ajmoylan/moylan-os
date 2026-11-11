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
  // `uFrames[21]` (mat3, 63 vectors) + `uOrbitFlow[21]` + the rest: 112 vectors, measured in
  // Milestone 2.4a with getActiveUniform. Inside the WebGL2 guarantee of 256 on every device.
  transports: { idle: ["uniforms"], uniformVectors: { uniforms: 112 } },
  hotOverride: NEX_HOT,
  createView: (engine, context) => new NexAvatar(engine, context),
};
