import { FLOW_GLSL } from "../flow/interaction";

/**
 * GLSL for the ambient particle field. Positions are computed entirely on the GPU from static
 * attributes plus a few uniforms, so animating 12k particles costs one draw call and no per-frame
 * buffer uploads. Particles live directly in normalised device coordinates, which keeps the field
 * full-screen at any aspect ratio without a camera.
 *
 * Plain strings (no GLSL build plugin): Three.js compiles them at runtime through the GPU driver,
 * which needs neither `unsafe-eval` nor any other CSP relaxation.
 */

export const particleVertexShader = /* glsl */ `
uniform float uTime;
uniform float uDrift;
uniform float uMeander;
uniform float uTwinkle;
uniform float uSize;
uniform float uPixelRatio;
uniform float uBrightness;
uniform float uHotFraction;
uniform vec3 uBase;
uniform vec3 uAccent;
uniform vec3 uHot;
uniform float uTextDim;
uniform float uTextDimFromLeft;

// Pointer interaction (ADR-004): the stage's shared flow (flow map or analytic fallback).
${FLOW_GLSL}
uniform float uInfluence;
uniform float uGlow;

attribute vec4 aSeed;

varying vec3 vColor;
varying float vAlpha;

const float WRAP_X = 1.15;

void main() {
  float depth = position.z;
  float phase = aSeed.x * 6.2831853;
  vec2 p = position.xy;

  // A slow current: nearer particles travel faster (parallax), each at its own pace.
  float pace = mix(0.010, 0.035, depth) * (0.7 + 0.6 * aSeed.y) * uDrift;
  p.x += uTime * pace;

  // Organic meander: layered travelling waves form coherent, flowing bands rather than jitter.
  float amp = uMeander * mix(0.6, 1.0, depth);
  p.y += amp * sin(p.x * 2.3 + uTime * 0.21 + phase * 0.15)
       + amp * 0.45 * sin(p.x * 5.1 - uTime * 0.33 + phase);
  p.x += amp * 0.35 * sin(p.y * 3.7 + uTime * 0.17 + phase * 0.5);

  // Wrap horizontally (just off-screen) so the field flows indefinitely.
  p.x = mod(p.x + WRAP_X, 2.0 * WRAP_X) - WRAP_X;

  // Pointer flow: displacement follows the local flow velocity and fades as the flow dissipates,
  // so particles ripple away from the cursor and settle back on their own.
  float stir = 0.0;
  if (uFlowMode > 0.5) {
    vec2 flow = sampleFlow(p);
    p += flow * uInfluence * (0.35 + 0.65 * depth);
    stir = clamp(length(flow) * 0.25, 0.0, 1.0);
  }

  gl_Position = vec4(p, 0.0, 1.0);
  gl_PointSize = uSize * mix(0.55, 2.4, depth * depth) * (0.7 + 0.6 * aSeed.z) * uPixelRatio;

  float hot = step(1.0 - uHotFraction, aSeed.w);
  vec3 tone = mix(uBase, uAccent, smoothstep(0.15, 0.85, aSeed.w));
  vColor = mix(tone, uHot, hot);

  float shimmer = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * (0.5 + aSeed.y) + phase * 3.0));
  float alpha = mix(0.16, 0.85, depth) * (0.55 + 0.45 * aSeed.w) * shimmer;
  alpha *= mix(1.0, 1.5, hot);

  // Legibility: dim the field behind the main text column.
  float dim = uTextDimFromLeft > 0.5 ? uTextDim * (1.0 - smoothstep(-0.75, 0.3, p.x)) : uTextDim;
  alpha *= 1.0 - dim;
  // Soft vignette at the top and bottom edges.
  alpha *= 1.0 - smoothstep(0.7, 1.1, abs(p.y));

  vAlpha = alpha * uBrightness * (1.0 + stir * uGlow);
}
`;

export const particleFragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0) discard;
  // Bright core with a soft halo: reads as light rather than as hard dots.
  float intensity = (exp(-r * r * 6.0) + (1.0 - r) * 0.3) * vAlpha;
  // Premultiplied output, blended additively (ONE, ONE): light accumulates over the backdrop.
  gl_FragColor = vec4(vColor * intensity, intensity);
}
`;
