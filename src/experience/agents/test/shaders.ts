import { TEST_FRAMES } from "./shape";

/**
 * GLSL for the diagnostic TEST shape (Milestone 2.4b.2). One module defines
 * `particleB(out vec4 clip, out float size, out vec3 color, out float alpha)`: TEST's idle program
 * calls it from `main()`, and the pair morph program (core/morph/program.ts) calls it as slot B.
 * Every name is TEST-prefixed (`uT…`, `t…`), so it links beside NEX's slot-A module. Its own
 * model-view matrix is a uniform (`uTModelView`): in the morph program `modelViewMatrix` is NEX's.
 */

const declarations = /* glsl */ `
#define T_FRAMES ${TEST_FRAMES}
uniform mat3 uTFrames[T_FRAMES];
uniform mat4 uTModelView;
uniform float uTTime;
uniform float uTArrive;
uniform float uTFade;
uniform float uTScale;
uniform float uTProjScale;
uniform vec3 uTDeep;
uniform vec3 uTAccent;
uniform vec3 uTHot;
`;

/** Slot-B attributes (the morph geometry carries them beside NEX's slot-A ones). */
const slotAttributes = /* glsl */ `
attribute vec3 positionB;
attribute float aOrbitB;
attribute vec4 aSeedB;
`;

/** TEST's idle geometry names its attributes as every shape slot does (`position`, …). */
const idleAttributes = /* glsl */ `
#define positionB position
#define aOrbitB aOrbit
#define aSeedB aSeed
attribute float aOrbit;
attribute vec4 aSeed;
`;

const body = /* glsl */ `
float tHash(float n) {
  return fract(sin(n) * 43758.5453);
}

void particleB(out vec4 clip, out float size, out vec3 color, out float alpha) {
  int frame = int(aOrbitB + 0.5);
  float t = uTTime;
  // A slow wave travelling round each torus, in opposite directions.
  float u = atan(positionB.z, positionB.x);
  float wave = 0.5 + 0.5 * sin(u * 3.0 - t * 1.6 + float(frame) * 3.14159265);
  vec3 p = uTFrames[frame] * (positionB * (1.0 + 0.025 * wave));

  // Arrival (a first visit straight to TEST): a staggered flight from a seeded shell.
  float e = 1.0;
  if (uTArrive < 1.0) {
    vec3 dir = normalize(aSeedB.xyz - 0.5 + vec3(1e-4));
    vec3 scatter = dir * (1.6 + 1.6 * tHash(aSeedB.w * 71.3));
    e = clamp((uTArrive - aSeedB.x * 0.4) / 0.6, 0.0, 1.0);
    e = e * e * (3.0 - 2.0 * e);
    p = mix(scatter, p, e);
  }

  vec4 mv = uTModelView * vec4(p, 1.0);
  clip = projectionMatrix * mv;
  float px = 0.0085 * (0.6 + 0.8 * aSeedB.z) * uTScale * uTProjScale / max(0.05, -mv.z);
  size = clamp(px, 1.0, 64.0);
  color = mix(mix(uTDeep, uTAccent, 0.35 + 0.65 * aSeedB.w), uTHot, wave * wave * 0.55);
  alpha = (0.2 + 0.45 * aSeedB.w) * (0.55 + 0.7 * wave) * clamp(px / 1.5, 0.25, 1.0);
  alpha *= uTFade * mix(0.15, 1.0, e);
}
`;

/** TEST's slot-B morph module. */
export const testMorphModule = `${declarations}${slotAttributes}${body}`;

/** TEST's idle point program: the same module over its own geometry. */
export const testPointVertex = /* glsl */ `${declarations}${idleAttributes}${body}
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 clip;
  float size;
  vec3 color;
  float alpha;
  particleB(clip, size, color, alpha);
  gl_Position = clip;
  gl_PointSize = size;
  vColor = color;
  vAlpha = alpha;
}
`;
