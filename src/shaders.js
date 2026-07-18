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
 * Fake infinite Mandelbrot-like zoom (not mathematically correct).
 *
 * Zoom lives in log-space forever. Detail is generated from hash-seeded
 * Mandelbrot/Julia hybrids in short "octaves". Three phase-offset layers
 * with raised-cosine weights hide the wrap, so the dive feels continuous
 * with no mosaic wall and no hard seams.
 */
const FRAG_BODY = `
uniform vec2 u_res;
uniform float u_aspect;
uniform float u_logZoom;
uniform vec2 u_aim;
uniform float u_time;
uniform float u_palette;
uniform float u_iters;

const float LOG_OCTAVE = 2.07944154168; // ln(8)
const float TAU = 6.28318530718;

vec2 hash21(float n) {
  return fract(sin(vec2(n, n * 1.6180339887)) * vec2(43758.5453, 22578.1459));
}

float hash11(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

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

// Interesting-looking "dive sites" — random but Mandelbrot-ish neighborhoods.
vec2 regionCenter(float octave, vec2 aim) {
  vec2 h = hash21(octave + 11.0);
  vec2 h2 = hash21(octave * 3.7 + 2.0);
  float pick = floor(h.x * 4.0);
  // Seahorse / bulb / mini-brot / antenna-ish neighborhoods
  vec2 base = vec2(-0.75, 0.12);
  if (pick < 0.5) base = vec2(-0.75, 0.12);
  else if (pick < 1.5) base = vec2(-0.16, 1.04);
  else if (pick < 2.5) base = vec2(-1.25, 0.02);
  else base = vec2(0.28, -0.01);
  base += (h2 - 0.5) * vec2(0.22, 0.28);
  return base + aim * (0.14 + 0.18 * h.y);
}

float escape(vec2 c, float maxI, float juliaMix, vec2 jSeed) {
  vec2 z = mix(vec2(0.0), c * 0.28, juliaMix);
  vec2 k = mix(c, jSeed, juliaMix * 0.82);
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

// Soft filament accent — cheap domain warp so edges feel "alive".
float filament(vec2 p, float seed) {
  vec2 h = hash21(seed);
  vec2 q = p * (2.4 + h.x) + h * 3.1;
  float a = sin(q.x * 3.1 + q.y * 1.7);
  float b = sin(q.y * 2.8 - q.x * 1.3 + seed);
  return 0.5 + 0.5 * sin(a * b * 4.0 + length(p) * 6.0);
}

vec3 layerColor(vec2 uv, float octave, float localZoom, vec2 aim, float maxI) {
  vec2 center = regionCenter(octave, aim);
  vec2 h = hash21(octave + 5.0);
  float juliaMix = 0.08 + 0.22 * h.x;
  vec2 jSeed = vec2(-0.42, 0.63) + (h - 0.5) * 0.95 + aim * 0.1;
  float scale = 1.75 / max(localZoom, 1.0);
  // Slight swirl so successive octaves don't feel like the same crop
  float ang = (h.y - 0.5) * 1.2 + octave * 0.37;
  float ca = cos(ang);
  float sa = sin(ang);
  vec2 ruv = vec2(ca * uv.x - sa * uv.y, sa * uv.x + ca * uv.y);
  vec2 c = center + ruv * scale;

  float smoothI = escape(c, maxI, juliaMix, jSeed);
  if (smoothI < 0.0) {
    float f = filament(ruv * 0.35, octave + 3.0);
    return vec3(0.01, 0.015, 0.025) + 0.02 * f * vec3(0.2, 0.6, 0.55);
  }

  float t = smoothI * 0.018 + u_time * 0.025 + octave * 0.07 + hash11(octave) * 0.2;
  vec3 col = palette(t, u_palette);
  float edge = exp(-0.012 * smoothI);
  col += edge * 0.18 * vec3(0.35, 0.95, 0.82);
  col *= 0.88 + 0.22 * filament(ruv, octave + 9.0);
  col *= 0.92 + 0.16 * h.y;
  return pow(max(col, 0.0), vec3(0.9));
}

// Raised-cosine weight: 0 at phase ends (wrap), 1 in the middle.
float layerWeight(float phase) {
  return 0.5 - 0.5 * cos(TAU * clamp(phase, 0.0, 1.0));
}

vec3 sampleLayer(vec2 uv, float lf, float offset, float tag, float maxI) {
  float shifted = lf - offset;
  float octave = floor(shifted);
  float phase = fract(shifted);
  float localZoom = exp(phase * LOG_OCTAVE);
  float w = max(layerWeight(phase), 0.02);
  return layerColor(uv, octave + tag, localZoom, u_aim, maxI) * w;
}

vec3 render(vec2 uv) {
  float lf = max(u_logZoom, 0.0) / LOG_OCTAVE;
  float maxI = min(u_iters, 180.0);

  // Three phase-offset layers — when one wraps, its weight is ~0.
  vec3 a = sampleLayer(uv, lf, 0.0, 0.0, maxI);
  vec3 b = sampleLayer(uv, lf, 1.0 / 3.0, 17.0, maxI);
  vec3 c = sampleLayer(uv, lf, 2.0 / 3.0, 34.0, maxI);

  // Reconstruct weights for normalize (same formula as sampleLayer)
  float wa = max(layerWeight(fract(lf)), 0.02);
  float wb = max(layerWeight(fract(lf - 1.0 / 3.0)), 0.02);
  float wc = max(layerWeight(fract(lf - 2.0 / 3.0)), 0.02);

  return (a + b + c) / max(wa + wb + wc, 1e-3);
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
