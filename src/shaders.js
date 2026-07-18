export const VERT_WEBGL2 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const VERT_WEBGL1 = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const PALETTE = `
const float TAU = 6.28318530718;

vec3 palette(float t, float mode) {
  t = fract(t);
  if (mode < 0.5) {
    return 0.5 + 0.5 * cos(TAU * (t + vec3(0.00, 0.18, 0.33)) + vec3(0.2, 1.4, 2.1));
  } else if (mode < 1.5) {
    return 0.55 + 0.45 * cos(TAU * (t + vec3(0.05, 0.22, 0.40)) + vec3(1.8, 0.9, 0.3));
  } else if (mode < 2.5) {
    vec3 a = vec3(0.08, 0.14, 0.18);
    vec3 b = vec3(0.55, 0.85, 0.75);
    vec3 c = vec3(1.0, 0.8, 0.6);
    return a + b * pow(abs(sin(3.14159 * (t + c))), vec3(1.4));
  }
  return mix(
    vec3(0.02, 0.03, 0.06),
    vec3(1.0, 0.72, 0.35),
    smoothstep(0.0, 1.0, 0.5 + 0.5 * sin(t * 18.0))
  ) + 0.25 * cos(TAU * (t + vec3(0.1, 0.25, 0.4)));
}

vec3 colorize(float smoothI, float time, float mode) {
  if (smoothI < 0.0) return vec3(0.01, 0.015, 0.025);
  float t = smoothI * 0.017 + time * 0.018;
  vec3 col = palette(t, mode);
  col += exp(-0.012 * smoothI) * 0.16 * vec3(0.35, 0.95, 0.82);
  return pow(max(col, 0.0), vec3(0.9));
}
`;

/**
 * True deep zoom by perturbation. The CPU supplies a high-precision
 * reference orbit Z_0..Z_{len-1} (Z_0 = 0) as an RG32F texture; each pixel
 * iterates only its tiny delta dz around that orbit:
 *
 *   dz' = 2·Z_m·dz + dz² + dc
 *
 * with rebasing (Zhuoran's method): whenever |Z_m + dz| < |dz| or the
 * reference runs out, restart the reference at 0 with dz ← Z_m + dz.
 * This keeps the picture exact-looking to span ~1e-26 in pure float32 —
 * one continuous dive, no scene handoff ever.
 */
export const FRAG_WEBGL2 = `#version 300 es
precision highp float;
precision highp int;
${PALETTE}
uniform vec2 u_res;
uniform float u_aspect;
uniform sampler2D u_ref;
uniform int u_refLen;
uniform float u_span;     // half-height of the view in complex units
uniform vec2 u_offset;    // (view center − reference center) / span
uniform float u_iters;
uniform float u_time;
uniform float u_palette;

out vec4 outColor;

vec2 refAt(int i) {
  return texelFetch(u_ref, ivec2(i & 1023, i >> 10), 0).xy;
}

void main() {
  vec2 uv = (gl_FragCoord.xy / u_res) * 2.0 - 1.0;
  uv.x *= u_aspect;
  vec2 dc = (u_offset + uv) * u_span;

  vec2 dz = vec2(0.0);
  int m = 0;
  float smoothI = -1.0;
  int last = max(u_refLen - 1, 0);

  for (float i = 0.0; i < u_iters; i += 1.0) {
    vec2 Z = refAt(m);
    vec2 z = Z + dz;
    float z2 = dot(z, z);
    if (z2 > 65536.0) {
      smoothI = i - log2(log2(max(sqrt(z2), 1.0001))) + 4.0;
      break;
    }
    if (z2 < dot(dz, dz) || m >= last) {
      dz = z;
      m = 0;
      Z = vec2(0.0);
    }
    dz = vec2(
      2.0 * (Z.x * dz.x - Z.y * dz.y) + (dz.x * dz.x - dz.y * dz.y),
      2.0 * (Z.x * dz.y + Z.y * dz.x) + 2.0 * dz.x * dz.y
    ) + dc;
    m++;
  }

  outColor = vec4(colorize(smoothI, u_time, u_palette), 1.0);
}
`;

/**
 * WebGL1 fallback: plain direct iteration in float32. Honest about its
 * limit — main.js turns the dive around before precision breaks up.
 */
export const FRAG_WEBGL1 = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
${PALETTE}
uniform vec2 u_res;
uniform float u_aspect;
uniform vec2 u_center;
uniform float u_span;
uniform float u_iters;
uniform float u_time;
uniform float u_palette;

void main() {
  vec2 uv = (gl_FragCoord.xy / u_res) * 2.0 - 1.0;
  uv.x *= u_aspect;
  vec2 c = u_center + uv * u_span;
  vec2 z = vec2(0.0);
  float smoothI = -1.0;
  for (float i = 0.0; i < 300.0; i += 1.0) {
    if (i >= u_iters) break;
    float zx2 = z.x * z.x;
    float zy2 = z.y * z.y;
    if (zx2 + zy2 > 65536.0) {
      smoothI = i - log2(log2(max(sqrt(zx2 + zy2), 1.0001))) + 4.0;
      break;
    }
    z = vec2(zx2 - zy2, 2.0 * z.x * z.y) + c;
  }
  gl_FragColor = vec4(colorize(smoothI, u_time, u_palette), 1.0);
}
`;
