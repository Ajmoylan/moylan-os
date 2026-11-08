import { FLOW_GLSL } from "../flow/interaction";
import { NEX_FRAMES, ORBIT_STRIDE } from "./shape";

/** Share of NEX's particles the tier-3 glow layer draws (a prefix of the shuffled shape). */
export const NEX_GLOW_SHARE = 0.33;

/**
 * GLSL for NEX (approved V3 look). Like the ambient field, everything animates on the GPU from
 * static attributes and a few uniforms; output is premultiplied and blended additively, so no
 * depth buffer or sorting is needed. Plain strings: compiled by the GPU driver, no CSP change.
 * The point fragment shader is the ambient field's (shared soft sprite).
 *
 * Space: NEX-local (ring radius ≈ 0.75). The group transform places, scales and turns NEX to
 * its on-screen anchor; `uScale` is that scale, so depth cues stay in local units.
 */

const shared = /* glsl */ `
#define FRAMES ${NEX_FRAMES}
uniform mat3 uFrames[FRAMES];
uniform float uOrbitFlow[FRAMES];
uniform float uTime;
uniform float uArrive;
uniform float uFade;
uniform float uScale;
uniform vec3 uDeep;
uniform vec3 uAccent;
uniform vec3 uHot;

// Comet-shaped energy pulse travelling around a ring: bright head, trailing tail.
float ringPulse(vec3 local, float flow, float sharpness) {
  float u = atan(-local.z, local.x) / 6.2831853 + 0.5;
  float s = fract(u * 2.0 - uTime * flow);
  return pow(flow >= 0.0 ? s : 1.0 - s, sharpness);
}

// Depth: 0 on the far side of NEX, 1 on the near side.
float nearness(vec4 mv, vec3 centre) {
  return clamp((mv.z - centre.z) / uScale, -1.0, 1.0) * 0.5 + 0.5;
}

// Structure passing behind the core is partly hidden by it.
float coreOcclusion(vec4 mv, vec3 centre) {
  float behind = step(mv.z, centre.z - 0.02 * uScale);
  return behind * (1.0 - smoothstep(0.12, 0.3, length(mv.xy - centre.xy) / uScale)) * 0.75;
}
`;

export const nexPointVertex = /* glsl */ `
${shared}
uniform float uBreath;
uniform float uCoreRadius;
uniform float uProjScale;
uniform float uGlowLayer;
uniform float uGlowFade;
${FLOW_GLSL}

attribute float aOrbit;
attribute vec4 aSeed;

varying vec3 vColor;
varying float vAlpha;

const float GLOW_SHARE = ${NEX_GLOW_SHARE};

float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

vec3 rotateAbout(vec3 v, vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

void main() {
  float roleF = floor(aOrbit / ${ORBIT_STRIDE}.0 + 0.001);
  int role = int(roleF);
  int frame = int(aOrbit - roleF * ${ORBIT_STRIDE}.0 + 0.5);
  // The duplicate glow layer (fake bloom) draws the first GLOW_SHARE of the (shuffled) particles,
  // a representative sample: wide soft sprites overlap, so a subset at higher alpha carries the
  // same glow. Within it, only the core, the beads and ring particles lit by an energy pulse glow;
  // the rest is culled here, before any heavy work.
  // It joins once NEX has formed (uGlowFade), so the arrival's scattered sprites aren't doubled.
  bool glow = role == 0 || role == 2 ||
    (role == 1 && ringPulse(position, uOrbitFlow[frame], 28.0) * aSeed.w > 0.12);
  if (uGlowLayer > 0.5 && (!glow || uGlowFade <= 0.0)) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec3(0.0);
    vAlpha = 0.0;
    return;
  }

  float t = uTime;
  float phase = aSeed.x * 6.2831853;
  float intensity = aSeed.w;
  vec3 local = position;

  // Layered core: a soft nucleus, a counter-rotating shell, a sparse veil and an inner orbital
  // lattice; slow "crests" drift across the layers. Deterministic per particle (a morph target).
  float layer = 0.0;
  float crest = 0.0;
  if (role == 0) {
    vec3 dir = normalize(position + vec3(1e-5, 0.0, 0.0));
    layer = aSeed.y < 0.16 ? 0.0 : aSeed.y < 0.44 ? 1.0 : aSeed.y < 0.68 ? 2.0 : 3.0;
    float shell = 0.34 * min(1.0, length(position) / uCoreRadius);
    vec3 axis = vec3(0.0, 1.0, 0.0);
    float speed = 0.0;
    if (layer == 1.0) {
      shell = 0.56;
      axis = normalize(vec3(0.3, 1.0, 0.2));
      speed = 0.32;
    } else if (layer == 2.0) {
      shell = 0.98;
      axis = normalize(vec3(-0.6, 0.4, 0.7));
      speed = -0.2;
    } else if (layer == 3.0) {
      float k = floor(aSeed.x * 6.0);
      axis = normalize(vec3(sin(k * 1.7 + 0.4), cos(k * 2.3), sin(k * 0.9 + 1.0)));
      dir = normalize(dir - axis * dot(dir, axis) + vec3(1e-5));
      shell = 0.76;
      speed = mod(k, 2.0) < 0.5 ? 0.45 : -0.38;
    }
    dir = rotateAbout(dir, axis, t * speed);
    local = dir * (shell + (aSeed.z - 0.5) * (layer == 3.0 ? 0.025 : 0.07)) * uCoreRadius * uBreath;
    crest = pow(0.5 + 0.5 * sin(dot(dir, vec3(5.0, 3.0, -4.0)) + t * 0.6 + layer * 1.7), 8.0);
  }

  // Living micro-motion around each target.
  vec3 wander = vec3(
    sin(t * (0.35 + 0.4 * aSeed.y) + phase),
    sin(t * (0.30 + 0.35 * aSeed.z) + phase * 1.7),
    cos(t * (0.33 + 0.4 * intensity) + phase * 2.3));
  float wanderAmp = role == 0 ? 0.010 : role == 4 ? 0.035 : role == 3 ? 0.005 : 0.0025;
  vec3 target = uFrames[frame] * (local + wander * wanderAmp);

  // Arrival: staggered flight from a scattered shell (derived from the seeds), swirling mid-way.
  // Uniform branches (the same for every particle) skip this once NEX has formed, and the
  // pointer maths while the cursor rests.
  vec3 p = target;
  float e = 1.0;
  if (uArrive < 1.0) {
    float h = hash(aSeed.x * 91.7 + aSeed.w * 13.1) * 2.0 - 1.0;
    float ha = hash(aSeed.y * 57.3 + aSeed.z * 7.9) * 6.2831853;
    float hr = 1.8 + 2.4 * hash(aSeed.z * 33.1 + aSeed.x);
    float hs = sqrt(1.0 - h * h);
    vec3 scatter = vec3(hs * cos(ha) * hr * 1.4, h * hr * 0.7, hs * sin(ha) * hr);
    e = clamp((uArrive - aSeed.x * 0.45) / 0.55, 0.0, 1.0);
    e = e * e * (3.0 - 2.0 * e);
    vec3 swirl = vec3(sin(aSeed.y * 31.0 + t * 0.9), cos(aSeed.z * 29.0 + t * 0.7), sin(intensity * 37.0 - t * 0.8));
    p = mix(scatter, target, e) + swirl * e * (1.0 - e);
  }

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  // Cursor (ADR-004): the stage's shared flow, sampled at this particle's screen position. The
  // cursor's wake carries particles along (filaments and dust most, the core least) and makes them
  // glow; they settle back as the flow dissipates. Zero under reduced or off motion.
  float stir = 0.0;
  if (uFlowMode > 0.5) {
    vec2 flow = sampleFlow(gl_Position.xy / gl_Position.w);
    float follow = role >= 3 ? 1.0 : role == 2 ? 0.55 : role == 1 ? 0.36 : 0.18;
    gl_Position.xy += flow * 0.035 * follow * gl_Position.w;
    stir = clamp(length(flow) * 0.25, 0.0, 1.0) * follow;
  }
  vec3 centre = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float near = nearness(mv, centre);

  float size;
  vec3 color;
  float alpha;
  float spread = 0.75 + 0.5 * aSeed.z;
  if (role == 0) {
    if (layer == 0.0) {
      float c = 1.0 - clamp(length(position) / uCoreRadius, 0.0, 1.0);
      size = mix(0.016, 0.032, c) * spread;
      color = mix(uAccent, uHot, c * c * 0.435);
      alpha = mix(0.06, 0.13, c);
    } else if (layer == 1.0) {
      size = 0.0085 * spread;
      color = mix(uAccent, uHot, crest * 0.7);
      alpha = 0.26 + 0.5 * crest;
    } else if (layer == 2.0) {
      size = 0.007 * spread;
      color = mix(uDeep, uAccent, 0.4 + 0.6 * crest);
      alpha = 0.13 + 0.32 * crest;
    } else {
      size = 0.0065 * spread;
      color = mix(uAccent, uHot, crest * 0.6);
      alpha = 0.36 + 0.4 * crest;
    }
    alpha *= 1.7;
  } else if (role == 1) {
    float pulse = ringPulse(position, uOrbitFlow[frame], 28.0) * intensity;
    size = mix(0.009, 0.0065, intensity) * (0.7 + 0.6 * aSeed.z) * (1.0 + pulse * 0.9) * 0.85;
    color = mix(mix(uDeep, uAccent, intensity), uHot, pulse);
    alpha = (mix(0.06, 0.5, intensity) + pulse * 1.1) * (intensity > 0.4 ? 1.1 : 0.4);
  } else if (role == 2) {
    size = mix(0.01, 0.022, intensity) * 0.78;
    color = mix(uAccent, uHot, intensity);
    alpha = mix(0.22, 0.95, intensity) * (0.85 + 0.15 * sin(t * 1.3 + phase)) * 0.7;
  } else if (role == 3) {
    float u = atan(-position.z, position.x) / 6.2831853 + 0.5;
    float dash = smoothstep(0.55, 1.0, 0.5 + 0.5 * sin((u * 9.0 - t * uOrbitFlow[frame] * 3.0) * 6.2831853));
    size = 0.007 * (0.7 + 0.6 * aSeed.z);
    color = mix(uDeep, uAccent, 0.4 + 0.6 * dash);
    alpha = (0.05 + 0.3 * dash) * (0.6 + 0.4 * intensity);
  } else {
    size = 0.009 * (0.5 + aSeed.z);
    color = mix(uDeep, uAccent, intensity * 0.5);
    alpha = 0.075 * (0.4 + 0.6 * intensity) * (0.75 + 0.25 * sin(t * (0.4 + aSeed.y) + phase));
  }

  // Depth: the far side recedes, the near side comes forward; the core hides what passes behind.
  alpha *= mix(0.3, 1.22, near);
  color = mix(mix(color, uDeep, 0.5), color, near);
  if (role != 0) alpha *= 1.0 - coreOcclusion(mv, centre);
  alpha *= 1.0 + stir * 1.5;

  float px = size * uScale * uProjScale / max(0.05, -mv.z);
  // Sub-pixel points fade rather than shimmer.
  alpha *= clamp(px / 1.5, 0.25, 1.0);
  if (uGlowLayer > 0.5) {
    px *= 3.2;
    alpha *= 0.07 / GLOW_SHARE * uGlowFade;
  }
  gl_PointSize = clamp(px, 1.0, uGlowLayer > 0.5 ? 96.0 : 64.0);
  vColor = color;
  vAlpha = alpha * uFade * mix(0.15, 1.0, smoothstep(0.0, 0.3, e));
}
`;

export const nexLineVertex = /* glsl */ `
${shared}
attribute float aFrame;
attribute float aGlow;
varying vec3 vColor;
varying float vAlpha;

void main() {
  int frame = int(aFrame + 0.5);
  vec4 mv = modelViewMatrix * vec4(uFrames[frame] * position, 1.0);
  gl_Position = projectionMatrix * mv;
  vec3 centre = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float pulse = ringPulse(position, uOrbitFlow[frame], 18.0) * aGlow;
  vColor = mix(mix(uDeep, uAccent, aGlow), uHot, pulse);
  vAlpha = (mix(0.07, 0.42, aGlow) + pulse) * 1.7 * mix(0.16, 1.08, nearness(mv, centre))
    * (1.0 - coreOcclusion(mv, centre)) * smoothstep(0.55, 1.0, uArrive) * uFade;
}
`;

export const nexSolidFragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(vColor * vAlpha, vAlpha);
}
`;

/** Camera-facing quad (core glow and atmosphere), `uRadius` in NEX-local units. */
export const nexBillboardVertex = /* glsl */ `
uniform float uRadius;
uniform float uScale;
varying vec2 vUv;
void main() {
  vUv = position.xy;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uRadius * uScale;
  gl_Position = projectionMatrix * mv;
}
`;

const billboardUniforms = /* glsl */ `
uniform float uTime;
uniform float uBreath;
uniform float uIntensity;
uniform float uArrive;
uniform float uFade;
uniform vec3 uDeep;
uniform vec3 uAccent;
uniform vec3 uHot;
`;

/** Volumetric core glow: layered falloffs plus a slow plasma; a restrained white-hot centre. */
export const nexGlowFragment = /* glsl */ `
${billboardUniforms}
varying vec2 vUv;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float body = exp(-r * r * 48.0 / uBreath);
  float n1 = noise(rot(uTime * 0.11) * vUv * 9.0 + vec2(0.0, uTime * 0.35));
  float n2 = noise(rot(-uTime * 0.07) * vUv * 15.0 - vec2(uTime * 0.25, 0.0));
  float plasma = smoothstep(0.35, 1.0, n1 * n2 * 2.2) * exp(-r * r * 30.0) * 0.55;
  vec3 color = uHot * (exp(-r * r * 260.0 / uBreath) * 1.4 + body * 0.55) * 0.26
    + uAccent * (body * 0.25 + plasma + exp(-r * 6.0) * 0.32)
    + uDeep * exp(-r * r * 3.5) * 0.06;
  color *= (1.0 - smoothstep(0.8, 1.0, r)) * uIntensity * smoothstep(0.3, 1.0, uArrive) * uFade;
  gl_FragColor = vec4(color, max(color.r, max(color.g, color.b)));
}
`;

/** Atmosphere: a faint teal haze around NEX, over the page's own obsidian background. */
export const nexAtmosphereFragment = /* glsl */ `
${billboardUniforms}
varying vec2 vUv;
void main() {
  float d2 = dot(vUv, vUv) * 4.0;
  vec3 color = (uDeep * exp(-d2 * 1.4) * 0.11 + uAccent * exp(-d2 * 6.0) * 0.05)
    * uIntensity * (1.0 - smoothstep(0.7, 1.0, length(vUv))) * smoothstep(0.0, 0.6, uArrive) * uFade;
  gl_FragColor = vec4(color, max(color.r, max(color.g, color.b)));
}
`;

/** Faint containment shell: fresnel rim, fine latitude lines and a slow scan band. */
export const nexShellVertex = /* glsl */ `
uniform float uBreath;
varying vec3 vNormalV;
varying vec3 vView;
varying float vLat;
void main() {
  vec4 mv = modelViewMatrix * vec4(position * uBreath, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  vLat = normalize(position).y;
  gl_Position = projectionMatrix * mv;
}
`;

export const nexShellFragment = /* glsl */ `
${billboardUniforms}
varying vec3 vNormalV;
varying vec3 vView;
varying float vLat;
void main() {
  float rim = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vView))), 2.6);
  float scan = exp(-pow((fract(vLat * 0.5 + 0.5 - uTime * 0.07) - 0.5) * 16.0, 2.0));
  float a = rim * (0.35 + scan * 0.55 + pow(abs(sin(vLat * 28.274)), 40.0) * 0.3)
    * uIntensity * smoothstep(0.6, 1.0, uArrive) * uFade;
  gl_FragColor = vec4(mix(uAccent, uHot, scan * 0.5) * a, a);
}
`;
