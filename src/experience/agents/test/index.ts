import type { AgentRenderDefinition } from "../types";
import { placeTest } from "./placement";
import { testMorphModule } from "./shaders";
import { generateTestShape, TEST_SEED } from "./shape";
import { TestView, TEST_TIMING } from "./TestView";

/**
 * The diagnostic TEST definition (Milestone 2.4b.2): loaded lazily, and registered by the Stage,
 * only behind the explicit `?morph=test` switch. It is not a registry agent and has no route: with
 * the switch, the Engineering route (FORGE's, which has no WebGL definition yet) draws TEST, so the
 * first real morph runs on real navigation. Must be removed before public launch (or kept as a
 * documented diagnostic), per the stage-A approval.
 */
export const testDefinition: AgentRenderDefinition = {
  id: "test",
  version: 1,
  seed: TEST_SEED,
  generate: (count, seed) => generateTestShape(count, seed),
  // Uniform transport only (two orbit frames). Vertex-uniform vectors of the point program: the
  // module's own (uTFrames 6, uTModelView 4, projectionMatrix 4, 5 scalars, 3 colours) = 22.
  transports: { idle: ["uniforms"], uniformVectors: { uniforms: 22 } },
  hotOverride: "#f3e8ff",
  palette: () => ({ base: "#3b2a6b", accent: "#a78bfa", hot: "#f3e8ff" }),
  morph: { slot: "B", module: () => testMorphModule },
  timing: TEST_TIMING,
  placement: { kind: "fixed", place: placeTest },
  createView: (engine, context) => new TestView(engine, context),
};
