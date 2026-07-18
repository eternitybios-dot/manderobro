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
 * Fake infinite Mandelbrot-like zoom.
 * Zoom lives in log-space forever. Every octave we renormalize into a fresh
 * region (hash-seeded), and crossfade near the boundary so the dive feels
 * continuous — no tiny floats, no mosaic wall.
 */
const FRAG_BODY = `
uniform vec2 u_res;
uniform float u_aspect;
uniform float u_logZoom;
uniform vec2 u_aim;
uniform float u_time;
uniform float u_palette;
uniform float u_iters;

const float LOG_OCTAVE = 2.07944154168; // log(8)

vec2 hash21(float n) {
  return fract(sin(vec2(n, n * 1.6180339887)) * vec2(43758.5453, 22578.1459));
}

vec3 palette(float t, float mode) {
  t = fract(t);
  if (mode < 0.5) {
    return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.00, 0.18, 0.33)) + vec3(0.2, 1.4, 2.1));
  } else if (mode < 1.5) {
    return 0.55 + 0.45 * cos(6.28318 * (t + vec3(0.05, 0.22, 0.40)) + vec3(1.8, 0.9, 0.3));
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
  ) + 0.25 * cos(6.28318 * (t + vec3(0.1, 0.25, 0.4)));
}

vec2 regionCenter(float octave, vec2 aim) {
  vec2 h = hash21(octave + 11.0);
  vec2 h2 = hash21(octave * 3.7 + 2.0);
  vec2 base = vec2(-0.72, 0.12) + vec2(0.5, 0.7) * (h - 0.5);
  vec2 mini = vec2(-1.25, 0.02) + 0.4 * (h2 - 0.5);
  vec2 pick = mix(base, mini, step(0.52, h.x));
  return pick + aim * (0.18 + 0.2 * h.y);
}

float escape(vec2 c, float maxI, float juliaMix, vec2 jSeed) {
  vec2 z = mix(vec2(0.0), c * 0.3, juliaMix);
  vec2 k = mix(c, jSeed, juliaMix * 0.8);
  float i;
  for (i = 0.0; i < maxI; i++) {
    float zx2 = z.x * z.x;
    float zy2 = z.y * z.y;
    if (zx2 + zy2 > 256.0) break;
    z = vec2(zx2 - zy2, 2.0 * z.x * z.y) + k;
  }
  if (i >= maxI - 0.5) return -1.0;
  float mag = length(z);
  return i - log2(log2(max(mag, 1.0001))) + 4.0;
}

vec3 layerColor(vec2 uv, float octave, float localZoom, vec2 aim, float maxI) {
  vec2 center = regionCenter(octave, aim);
  vec2 h = hash21(octave + 5.0);
  float juliaMix = 0.1 + 0.2 * h.x;
  vec2 jSeed = vec2(-0.42, 0.63) + (h - 0.5) * 0.95 + aim * 0.12;
  float scale = 1.7 / max(localZoom, 1.0);
  vec2 c = center + uv * scale;
  float smoothI = escape(c, maxI, juliaMix, jSeed);
  if (smoothI < 0.0) return vec3(0.01, 0.02, 0.03);
  float t = smoothI * 0.02 + u_time * 0.03 + octave * 0.08;
  vec3 col = palette(t, u_palette);
  col += exp(-0.014 * smoothI) * 0.15 * vec3(0.35, 0.9, 0.8);
  col *= 0.9 + 0.2 * hash21(octave + 19.0).x;
  return pow(max(col, 0.0), vec3(0.92));
}

vec3 render(vec2 uv) {
  float lf = max(u_logZoom, 0.0) / LOG_OCTAVE;
  float octave = floor(lf);
  float frac = fract(lf);
  float localZoom = exp(frac * LOG_OCTAVE);
  float maxI = min(u_iters, 200.0);

  vec3 colA = layerColor(uv, octave, localZoom, u_aim, maxI);
  // Next octave starts "zoomed out" relative to itself, matching A's deep end
  vec3 colB = layerColor(uv, octave + 1.0, 1.0, u_aim, maxI);
  float w = smoothstep(0.72, 1.0, frac);
  return mix(colA, colB, w);
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
