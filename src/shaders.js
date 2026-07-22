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

/**
 * One continuous dive with a mathematically seamless deep phase.
 *
 * Phase 1: real Mandelbrot zoom into one user-chosen center c.
 * Phase 2 (before float precision dies): morph into Julia(c) viewed around
 *   its repelling fixed point z*. Julia sets are EXACTLY self-similar there:
 *   multiplying local coordinates by the multiplier λ = 2z* maps the set to
 *   itself. So the view at depth d and at depth d + ln|λ| (rotated by argλ)
 *   are the SAME image — we wrap depth modulo ln|λ| while accumulating
 *   rotation, and the zoom repeats forever with zero seams, zero blending,
 *   and bounded float magnitudes.
 */
const FRAG_BODY = `
uniform vec2 u_res;
uniform float u_aspect;
uniform float u_logZoom;
uniform vec2 u_center;   // Julia seed c (the dive point)
uniform vec2 u_fix;      // repelling fixed point z* of z^2+c
uniform float u_lnLam;   // ln|λ|, λ = 2 z*
uniform float u_argLam;  // arg(λ)
uniform float u_time;
uniform float u_palette;
uniform float u_iters;

uniform vec2 u_w0;       // deep window offset from z* (dense side of J)

const float HANDOFF_LOG = 9.0;   // start morph before precision breaks
const float HANDOFF_WIDTH = 3.0; // long, slow blend
const float BASE_SPAN = 2.6;
const float JULIA_SPAN0 = 0.026; // deep window half-size (stays O(1))
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

float escape(vec2 z0, vec2 k, float maxI) {
  vec2 z = z0;
  float i = 0.0;
  for (float j = 0.0; j < 400.0; j++) {
    if (j >= maxI) { i = j; break; }
    float zx2 = z.x * z.x;
    float zy2 = z.y * z.y;
    if (zx2 + zy2 > 256.0) { i = j; break; }
    z = vec2(zx2 - zy2, 2.0 * z.x * z.y) + k;
    i = j + 1.0;
  }
  if (i >= maxI - 0.5) return -1.0;
  float mag = length(z);
  return i - log2(log2(max(mag, 1.0001))) + 4.0;
}

vec3 colorize(float smoothI) {
  if (smoothI < 0.0) return vec3(0.01, 0.015, 0.025);
  float t = smoothI * 0.017 + u_time * 0.018;
  vec3 col = palette(t, u_palette);
  col += exp(-0.012 * smoothI) * 0.16 * vec3(0.35, 0.95, 0.82);
  return pow(max(col, 0.0), vec3(0.9));
}

// Deep phase: log-periodic spiral zoom along the λ-flow of the repelling
// fixed point. w(d) = λ^{-d/ln|λ|}(w0 + uv·s0) with the exponent wrapped:
// escape(z* + λ⁻¹w) = escape(z* + w) + 1, so adding n keeps the rendered
// image exactly continuous across wraps — no layers, no crossfade.
vec3 deepJulia(vec2 uv, float d, float maxI) {
  float n = floor(d / u_lnLam);
  float r = d - n * u_lnLam;
  float ang = -(r / u_lnLam) * u_argLam;
  float scale = exp(-r);
  vec2 base = u_w0 + uv * JULIA_SPAN0;
  float ca = cos(ang);
  float sa = sin(ang);
  vec2 w = scale * vec2(ca * base.x - sa * base.y, sa * base.x + ca * base.y);
  float s = escape(u_fix + w, u_center, maxI);
  if (s < 0.0) return vec3(0.01, 0.015, 0.025);
  return colorize(s + n);
}

vec3 render(vec2 uv) {
  float lz = max(u_logZoom, 0.0);
  float maxI = min(u_iters, 380.0);

  float handoff = smoothstep(HANDOFF_LOG, HANDOFF_LOG + HANDOFF_WIDTH, lz);

  vec3 realCol = vec3(0.0);
  if (handoff < 0.999) {
    float realLog = min(lz, HANDOFF_LOG + HANDOFF_WIDTH);
    float realSpan = BASE_SPAN / exp(realLog);
    realCol = colorize(escape(vec2(0.0), u_center + uv * realSpan, maxI));
  }

  vec3 deepCol = vec3(0.0);
  if (handoff > 0.001) {
    float d = max(0.0, lz - HANDOFF_LOG);
    deepCol = deepJulia(uv, d, maxI);
  }

  return mix(realCol, deepCol, handoff);
}
`;

export const FRAG_WEBGL2 = `#version 300 es
precision highp float;
${FRAG_BODY}
out vec4 outColor;
void main() {
  vec2 uv = (gl_FragCoord.xy / u_res) * 2.0 - 1.0;
  uv.x *= u_aspect;
  outColor = vec4(render(uv), 1.0);
}
`;

export const FRAG_WEBGL1 = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
${FRAG_BODY}
void main() {
  vec2 uv = (gl_FragCoord.xy / u_res) * 2.0 - 1.0;
  uv.x *= u_aspect;
  gl_FragColor = vec4(render(uv), 1.0);
}
`;
