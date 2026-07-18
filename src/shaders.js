export const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Emulated double (double-float) Mandelbrot for deep zoom.
export const FRAG = `#version 300 es
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

vec2 ds_add(vec2 a, vec2 b) {
  float s = a.x + b.x;
  float v = s - a.x;
  float e = (a.x - (s - v)) + (b.x - v) + a.y + b.y;
  return vec2(s, e);
}

vec2 ds_mul(vec2 a, vec2 b) {
  float p = a.x * b.x;
  float e = fma(a.x, b.x, -p) + a.x * b.y + a.y * b.x;
  return vec2(p, e);
}

vec2 ds_set(float a) {
  return vec2(a, 0.0);
}

vec3 palette(float t, float mode) {
  t = fract(t);
  if (mode < 0.5) {
    // Abyss aqua / amber
    return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.00, 0.18, 0.33)) + vec3(0.2, 1.4, 2.1));
  } else if (mode < 1.5) {
    // Ember reef
    return 0.55 + 0.45 * cos(6.28318 * (t + vec3(0.05, 0.22, 0.40)) + vec3(1.8, 0.9, 0.3));
  } else if (mode < 2.5) {
    // Biolume
    vec3 a = vec3(0.08, 0.14, 0.18);
    vec3 b = vec3(0.55, 0.85, 0.75);
    vec3 c = vec3(1.0, 0.8, 0.6);
    return a + b * pow(abs(sin(3.14159 * (t + c))), vec3(1.4));
  }
  // Solar ink
  return mix(
    vec3(0.02, 0.03, 0.06),
    vec3(1.0, 0.72, 0.35),
    smoothstep(0.0, 1.0, 0.5 + 0.5 * sin(t * 18.0))
  ) + 0.25 * cos(6.28318 * (t + vec3(0.1, 0.25, 0.4)));
}

void main() {
  vec2 uv = (gl_FragCoord.xy / u_res) * 2.0 - 1.0;
  uv.x *= u_aspect;

  vec2 dx = ds_set(uv.x * u_scale);
  vec2 dy = ds_set(uv.y * u_scale);
  vec2 cx = ds_add(vec2(u_center_hi.x, u_center_lo.x), dx);
  vec2 cy = ds_add(vec2(u_center_hi.y, u_center_lo.y), dy);

  vec2 zx = ds_set(0.0);
  vec2 zy = ds_set(0.0);

  float i;
  float maxI = u_iters;
  for (i = 0.0; i < maxI; i++) {
    // z = z^2 + c  with double-float
    vec2 zx2 = ds_mul(zx, zx);
    vec2 zy2 = ds_mul(zy, zy);
    vec2 twozxzy = ds_mul(ds_mul(zx, zy), ds_set(2.0));
    vec2 nx = ds_add(ds_add(zx2, vec2(-zy2.x, -zy2.y)), cx);
    vec2 ny = ds_add(twozxzy, cy);
    zx = nx;
    zy = ny;

    float mag2 = zx.x * zx.x + zy.x * zy.x;
    if (mag2 > 256.0) break;
  }

  if (i >= maxI - 0.5) {
    outColor = vec4(0.01, 0.02, 0.03, 1.0);
    return;
  }

  float mag = length(vec2(zx.x, zy.x));
  float smoothI = i - log2(log2(max(mag, 1.0001))) + 4.0;
  float t = smoothI * 0.018 + u_time * 0.035;
  vec3 col = palette(t, u_palette);

  // Soft glow near the set boundary
  float edge = exp(-0.012 * smoothI);
  col += edge * 0.15 * vec3(0.4, 0.9, 0.85);
  col = pow(max(col, 0.0), vec3(0.92));

  outColor = vec4(col, 1.0);
}
`;
