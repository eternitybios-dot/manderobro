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
 * One continuous dive — never hard-cuts to a random unrelated scene.
 *
 * 1) Real Mandelbrot zoom into one center (user-steered).
 * 2) Before float precision dies, slowly become the Julia set of that
 *    SAME center (deep Mandelbrot near c ≈ Julia(c) — connected shapes).
 * 3) Forever after: keep zooming that same Julia with log-periodic
 *    renormalize. Two phase-offset layers share identical parameters.
 */
const FRAG_BODY = `
uniform vec2 u_res;
uniform float u_aspect;
uniform float u_logZoom;
uniform vec2 u_center;
uniform vec2 u_aim;
uniform float u_time;
uniform float u_palette;
uniform float u_iters;

const float HANDOFF_LOG = 9.5;           // ~1.3e4 — start morph before mosaic
const float HANDOFF_WIDTH = 2.8;         // long, readable blend
const float LOG_PERIOD = 1.79175946923;  // ln(6)
const float BASE_SPAN = 2.6;
const float JULIA_SPAN = 2.35;
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

vec3 colorize(float smoothI) {
  if (smoothI < 0.0) return vec3(0.01, 0.015, 0.025);
  float t = smoothI * 0.017 + u_time * 0.018;
  vec3 col = palette(t, u_palette);
  col += exp(-0.012 * smoothI) * 0.16 * vec3(0.35, 0.95, 0.82);
  return pow(max(col, 0.0), vec3(0.9));
}

// juliaMix 0 = Mandelbrot, 1 = Julia(jSeed)
vec3 sampleField(vec2 uv, vec2 center, float span, float juliaMix, vec2 jSeed, float maxI) {
  vec2 c = center + uv * span;
  vec2 z0 = mix(vec2(0.0), c, juliaMix);
  vec2 k = mix(c, jSeed, juliaMix);
  return colorize(escape(z0, k, maxI));
}

float layerWeight(float phase) {
  return 0.5 - 0.5 * cos(TAU * clamp(phase, 0.0, 1.0));
}

// Forever-zoom the SAME Julia(jSeed). Spans stay O(1) so detail never vanishes.
vec3 fakeJulia(vec2 uv, float deep, vec2 jSeed, float maxI) {
  // Slow crawl through connected filaments of this one Julia — not a scene cut.
  float crawlAmp = 0.42 * smoothstep(0.0, 2.5, deep);
  vec2 focus = crawlAmp * vec2(
    sin(deep * 0.022 + u_aim.x * 0.9),
    cos(deep * 0.019 + u_aim.y * 0.85)
  );
  focus += u_aim * (0.12 * smoothstep(0.5, 3.0, deep));

  float lf = deep / LOG_PERIOD + 0.3;
  float p0 = fract(lf);
  float p1 = fract(lf - 0.5);
  float span0 = JULIA_SPAN / exp(p0 * LOG_PERIOD);
  float span1 = JULIA_SPAN / exp(p1 * LOG_PERIOD);
  float w0 = max(layerWeight(p0), 0.001);
  float w1 = max(layerWeight(p1), 0.001);

  vec3 a = sampleField(uv, focus, span0, 1.0, jSeed, maxI);
  vec3 b = sampleField(uv, focus, span1, 1.0, jSeed, maxI);
  return (a * w0 + b * w1) / (w0 + w1);
}

vec3 render(vec2 uv) {
  float lz = max(u_logZoom, 0.0);
  float maxI = min(u_iters, 220.0);

  // Real continuous Mandelbrot into ONE center (clamp zoom used for sampling).
  float realLog = min(lz, HANDOFF_LOG + HANDOFF_WIDTH * 0.85);
  float realSpan = BASE_SPAN / exp(realLog);
  vec3 realCol = sampleField(uv, u_center, realSpan, 0.0, u_center, maxI);

  // Connected continuation: Julia of that same center.
  float deep = max(0.0, lz - HANDOFF_LOG);
  vec3 fakeCol = fakeJulia(uv, deep, u_center, maxI);

  // Long smooth morph — reads as one dive, not a hard cut.
  float handoff = smoothstep(HANDOFF_LOG, HANDOFF_LOG + HANDOFF_WIDTH, lz);
  // Ease so we linger on the Mandelbrot filaments before Julia takes over.
  handoff = handoff * handoff * (3.0 - 2.0 * handoff);
  return mix(realCol, fakeCol, handoff);
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
