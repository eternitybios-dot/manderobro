export const VERT_WEBGL2 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const PALETTE_GLSL = `
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
`;

// Fast path — used while zoom is still shallow
export const FRAG_WEBGL2_FAST = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform vec2 u_center;
uniform float u_scale;
uniform float u_iters;
uniform float u_time;
uniform float u_palette;
uniform float u_aspect;
out vec4 outColor;
${PALETTE_GLSL}
void main() {
  vec2 uv = ((gl_FragCoord.xy - 0.5) / u_res) * 2.0 - 1.0;
  uv.x *= u_aspect;
  vec2 c = u_center + uv * u_scale;
  vec2 z = vec2(0.0);
  float i;
  float maxI = u_iters;
  for (i = 0.0; i < maxI; i++) {
    float zx2 = z.x * z.x;
    float zy2 = z.y * z.y;
    if (zx2 + zy2 > 256.0) break;
    z = vec2(zx2 - zy2, 2.0 * z.x * z.y) + c;
  }
  if (i >= maxI - 0.5) { outColor = vec4(0.01, 0.02, 0.03, 1.0); return; }
  float mag = length(z);
  float smoothI = i - log2(log2(max(mag, 1.0001))) + 4.0;
  vec3 col = palette(smoothI * 0.018 + u_time * 0.035, u_palette);
  col += exp(-0.012 * smoothI) * 0.12 * vec3(0.4, 0.9, 0.85);
  outColor = vec4(pow(max(col, 0.0), vec3(0.92)), 1.0);
}
`;

// Deep path — double-float (no fma) for continuous zoom far past float32 mosaic
export const FRAG_WEBGL2_DEEP = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform vec2 u_center_hi;
uniform vec2 u_center_lo;
uniform float u_scale;
uniform float u_iters;
uniform float u_time;
uniform float u_palette;
uniform float u_aspect;
out vec4 outColor;
const float SPLIT = 4097.0;
vec2 ds_set(float a) { return vec2(a, 0.0); }
vec2 ds_add(vec2 a, vec2 b) {
  float s = a.x + b.x;
  float v = s - a.x;
  float e = (a.x - (s - v)) + (b.x - v) + a.y + b.y;
  float t = s + e;
  return vec2(t, e - (t - s));
}
vec2 ds_mul(vec2 a, vec2 b) {
  float c = SPLIT * a.x;
  float a1 = c - (c - a.x);
  float a2 = a.x - a1;
  float d = SPLIT * b.x;
  float b1 = d - (d - b.x);
  float b2 = b.x - b1;
  float p = a.x * b.x;
  float err = ((a1 * b1 - p) + a1 * b2 + a2 * b1) + a2 * b2;
  err += a.x * b.y + a.y * b.x;
  float t = p + err;
  return vec2(t, err - (t - p));
}
${PALETTE_GLSL}
void main() {
  vec2 uv = ((gl_FragCoord.xy - 0.5) / u_res) * 2.0 - 1.0;
  uv.x *= u_aspect;
  vec2 cx = ds_add(vec2(u_center_hi.x, u_center_lo.x), ds_set(uv.x * u_scale));
  vec2 cy = ds_add(vec2(u_center_hi.y, u_center_lo.y), ds_set(uv.y * u_scale));
  vec2 zx = ds_set(0.0);
  vec2 zy = ds_set(0.0);
  float i;
  float maxI = u_iters;
  for (i = 0.0; i < maxI; i++) {
    vec2 zx2 = ds_mul(zx, zx);
    vec2 zy2 = ds_mul(zy, zy);
    vec2 tw = ds_mul(ds_mul(zx, zy), ds_set(2.0));
    vec2 nx = ds_add(ds_add(zx2, vec2(-zy2.x, -zy2.y)), cx);
    vec2 ny = ds_add(tw, cy);
    zx = nx; zy = ny;
    if (zx.x * zx.x + zy.x * zy.x > 256.0) break;
  }
  if (i >= maxI - 0.5) { outColor = vec4(0.01, 0.02, 0.03, 1.0); return; }
  float mag = length(vec2(zx.x, zy.x));
  float smoothI = i - log2(log2(max(mag, 1.0001))) + 4.0;
  vec3 col = palette(smoothI * 0.018 + u_time * 0.035, u_palette);
  col += exp(-0.012 * smoothI) * 0.12 * vec3(0.4, 0.9, 0.85);
  outColor = vec4(pow(max(col, 0.0), vec3(0.92)), 1.0);
}
`;

export const VERT_WEBGL1 = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

export const FRAG_WEBGL1_FAST = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform vec2 u_center;
uniform float u_scale;
uniform float u_iters;
uniform float u_time;
uniform float u_palette;
uniform float u_aspect;
${PALETTE_GLSL}
void main() {
  vec2 uv = ((gl_FragCoord.xy - 0.5) / u_res) * 2.0 - 1.0;
  uv.x *= u_aspect;
  vec2 c = u_center + uv * u_scale;
  vec2 z = vec2(0.0);
  float i;
  float maxI = u_iters;
  for (i = 0.0; i < maxI; i++) {
    float zx2 = z.x * z.x;
    float zy2 = z.y * z.y;
    if (zx2 + zy2 > 256.0) break;
    z = vec2(zx2 - zy2, 2.0 * z.x * z.y) + c;
  }
  if (i >= maxI - 0.5) { gl_FragColor = vec4(0.01, 0.02, 0.03, 1.0); return; }
  float mag = length(z);
  float smoothI = i - log2(log2(max(mag, 1.0001))) + 4.0;
  vec3 col = palette(smoothI * 0.018 + u_time * 0.035, u_palette);
  col += exp(-0.012 * smoothI) * 0.12 * vec3(0.4, 0.9, 0.85);
  gl_FragColor = vec4(pow(max(col, 0.0), vec3(0.92)), 1.0);
}
`;

export const FRAG_WEBGL1_DEEP = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform vec2 u_center_hi;
uniform vec2 u_center_lo;
uniform float u_scale;
uniform float u_iters;
uniform float u_time;
uniform float u_palette;
uniform float u_aspect;
const float SPLIT = 4097.0;
vec2 ds_set(float a) { return vec2(a, 0.0); }
vec2 ds_add(vec2 a, vec2 b) {
  float s = a.x + b.x;
  float v = s - a.x;
  float e = (a.x - (s - v)) + (b.x - v) + a.y + b.y;
  float t = s + e;
  return vec2(t, e - (t - s));
}
vec2 ds_mul(vec2 a, vec2 b) {
  float c = SPLIT * a.x;
  float a1 = c - (c - a.x);
  float a2 = a.x - a1;
  float d = SPLIT * b.x;
  float b1 = d - (d - b.x);
  float b2 = b.x - b1;
  float p = a.x * b.x;
  float err = ((a1 * b1 - p) + a1 * b2 + a2 * b1) + a2 * b2;
  err += a.x * b.y + a.y * b.x;
  float t = p + err;
  return vec2(t, err - (t - p));
}
${PALETTE_GLSL}
void main() {
  vec2 uv = ((gl_FragCoord.xy - 0.5) / u_res) * 2.0 - 1.0;
  uv.x *= u_aspect;
  vec2 cx = ds_add(vec2(u_center_hi.x, u_center_lo.x), ds_set(uv.x * u_scale));
  vec2 cy = ds_add(vec2(u_center_hi.y, u_center_lo.y), ds_set(uv.y * u_scale));
  vec2 zx = ds_set(0.0);
  vec2 zy = ds_set(0.0);
  float i;
  float maxI = u_iters;
  for (i = 0.0; i < maxI; i++) {
    vec2 zx2 = ds_mul(zx, zx);
    vec2 zy2 = ds_mul(zy, zy);
    vec2 tw = ds_mul(ds_mul(zx, zy), ds_set(2.0));
    vec2 nx = ds_add(ds_add(zx2, vec2(-zy2.x, -zy2.y)), cx);
    vec2 ny = ds_add(tw, cy);
    zx = nx; zy = ny;
    if (zx.x * zx.x + zy.x * zy.x > 256.0) break;
  }
  if (i >= maxI - 0.5) { gl_FragColor = vec4(0.01, 0.02, 0.03, 1.0); return; }
  float mag = length(vec2(zx.x, zy.x));
  float smoothI = i - log2(log2(max(mag, 1.0001))) + 4.0;
  vec3 col = palette(smoothI * 0.018 + u_time * 0.035, u_palette);
  col += exp(-0.012 * smoothI) * 0.12 * vec3(0.4, 0.9, 0.85);
  gl_FragColor = vec4(pow(max(col, 0.0), vec3(0.92)), 1.0);
}
`;
