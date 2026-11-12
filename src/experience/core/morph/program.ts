import { AddEquation, CustomBlending, OneFactor, ShaderMaterial, type IUniform } from "three";
import { particleFragmentShader } from "../../ambient/shaders";

/**
 * The pair morph program (Milestone 2.4b.2; proposal §7): one point program drawing the morph
 * geometry (core/morphSlot.ts). It links slot A's module (`particleA`, the host agent NEX: its
 * approved point shader, unchanged in every expression) and slot B's (`particleB`), and blends
 * their outputs per particle. **Movement and light progress separately** (stage-D luminance
 * decision, Option 1):
 *
 * - **Movement** follows `uMorph` (0 … 1 towards slot B): the clock's *eased* phase, reversed when
 *   the destination is slot A. Each particle starts after a deterministic delay (from both slots'
 *   seeds) and travels for 60 % of the morph; positions blend in normalised device space with a
 *   swirl that peaks mid-way. Unchanged from the approved stage-D motion.
 * - **Light** follows `uLight` (0 … 1 towards slot B): the *linear* phase. Each particle's total
 *   light (its premultiplied colour decoded from sRGB to linear light, times its sprite area) is the
 *   linear-light interpolation of its two endpoints' light at `uLight`; its hue follows its own
 *   movement. The result is encoded back for the (unchanged) fragment shader. No mid-flight boost:
 *   the former light envelope and sprite swell are gone (they made the midpoint cloud flare).
 * - **Exact endpoints:** with nothing moved and no light changed, a particle is exactly slot A's
 *   output (and with everything done, exactly slot B's), so the first and last morph frames
 *   continue the idle frames on either side.
 */
export const MORPH_MAIN = /* glsl */ `
uniform float uMorph;
uniform float uLight;
varying vec3 vColor;
varying float vAlpha;

float morphHash(float n) {
  return fract(sin(n) * 43758.5453);
}

// sRGB encoding ↔ linear light (the display's decoding of what the shaders write).
vec3 morphToLinear(vec3 c) {
  vec3 x = max(c, vec3(0.0));
  return mix(x / 12.92, pow((x + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), x));
}

vec3 morphToEncoded(vec3 c) {
  vec3 x = max(c, vec3(0.0));
  return mix(x * 12.92, 1.055 * pow(x, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), x));
}

void main() {
  float delay = morphHash(aSeed.y * 113.1 + aSeedB.x * 7.7) * 0.4;
  float t = clamp((uMorph - delay) / 0.6, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  vec4 clip;
  float size;
  vec3 color;
  float alpha;
  if (t <= 0.0 && uLight <= 0.0) {
    particleA(clip, size, color, alpha);
  } else if (t >= 1.0 && uLight >= 1.0) {
    particleB(clip, size, color, alpha);
  } else {
    vec4 clipA;
    float sizeA;
    vec3 colorA;
    float alphaA;
    particleA(clipA, sizeA, colorA, alphaA);
    vec4 clipB;
    float sizeB;
    vec3 colorB;
    float alphaB;
    particleB(clipB, sizeB, colorB, alphaB);
    // Movement: eased and staggered (the approved motion).
    if (t <= 0.0) {
      clip = clipA;
    } else if (t >= 1.0) {
      clip = clipB;
    } else {
      vec3 ndc = mix(clipA.xyz / clipA.w, clipB.xyz / clipB.w, t);
      // Swirl: each particle loops out on its own heading, most at mid-flight.
      float arc = 4.0 * t * (1.0 - t);
      float heading = morphHash(aSeed.z * 57.3 + aSeedB.y * 3.1) * 6.2831853 + t * 3.0;
      ndc.xy += vec2(cos(heading), sin(heading)) * arc * (0.04 + 0.05 * aSeedB.z);
      clip = vec4(ndc, 1.0);
    }
    size = t <= 0.0 ? sizeA : t >= 1.0 ? sizeB : mix(sizeA, sizeB, t);
    // Light: linear in phase and in linear light, per sprite (light × area); hue follows movement.
    vec3 lightA = morphToLinear(colorA * alphaA) * (sizeA * sizeA);
    vec3 lightB = morphToLinear(colorB * alphaB) * (sizeB * sizeB);
    const vec3 Y = vec3(0.2126, 0.7152, 0.0722);
    vec3 hue = mix(lightA, lightB, t);
    float target = mix(dot(lightA, Y), dot(lightB, Y), uLight);
    vec3 light = hue * (target / max(dot(hue, Y), 1e-12));
    alpha = mix(alphaA, alphaB, uLight);
    vec3 premultiplied = morphToEncoded(light / (size * size));
    color = premultiplied / max(alpha, 1e-6);
  }
  gl_Position = clip;
  gl_PointSize = size;
  vColor = color;
  vAlpha = alpha;
}
`;

/** The pair program's vertex shader: slot A's module, slot B's, then the morph's `main()`. */
export function pairVertexShader(slotA: string, slotB: string): string {
  if (!/void particleA\(/.test(slotA)) throw new Error("Slot A module without particleA()");
  if (!/void particleB\(/.test(slotB)) throw new Error("Slot B module without particleB()");
  return `${slotA}\n${slotB}\n${MORPH_MAIN}`;
}

/**
 * The morph material: both slots' uniform objects (shared with their views, so the views' per-frame
 * writes drive it) plus its own `uMorph`. A name in both slots would make one view's value win
 * silently, so it throws instead.
 */
export function createPairMaterial(
  slotA: string,
  slotB: string,
  uniformsA: Record<string, IUniform>,
  uniformsB: Record<string, IUniform>,
): ShaderMaterial {
  const uniforms: Record<string, IUniform> = { ...uniformsA };
  for (const [name, uniform] of Object.entries(uniformsB)) {
    if (name in uniforms) throw new Error(`Morph uniform "${name}" is declared by both slots`);
    uniforms[name] = uniform;
  }
  for (const reserved of ["uMorph", "uLight"]) {
    if (reserved in uniforms) throw new Error(`Morph uniform "${reserved}" is reserved`);
  }
  uniforms.uMorph = { value: 0 };
  uniforms.uLight = { value: 0 };
  return new ShaderMaterial({
    uniforms,
    vertexShader: pairVertexShader(slotA, slotB),
    fragmentShader: particleFragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneFactor,
  });
}
