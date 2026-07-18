export const VERT_WEBGL2 = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Fast highp float Mandelbrot — continuous dive into a user-chosen point.
// We stop before mosaic (no automatic place-switching).
export const FRAG_WEBGL2 = `#version 300 es
precision highp float;

uniform vec2 u_res;
uniform vec2 u_center;
uniform float u_scale;
uniform float u_iters;
uniform float u_time;
uniform float u_palette;
uniform float u_aspect;

out vec4 outColor;

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

void main() {
  vec2 pix = gl_FragCoord.xy - 0.5;
  vec2 uv = (pix / u_res) * 2.0 - 1.0;
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

  if (i >= maxI - 0.5) {
    outColor = vec4(0.01, 0.02, 0.03, 1.0);
    return;
  }

  float mag = length(z);
  float smoothI = i - log2(log2(max(mag, 1.0001))) + 4.0;
  float t = smoothI * 0.018 + u_time * 0.035;
  vec3 col = palette(t, u_palette);
  col += exp(-0.012 * smoothI) * 0.12 * vec3(0.4, 0.9, 0.85);
  col = pow(max(col, 0.0), vec3(0.92));
  outColor = vec4(col, 1.0);
}
`;

export const VERT_WEBGL1 = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const FRAG_WEBGL1 = `
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

void main() {
  vec2 pix = gl_FragCoord.xy - 0.5;
  vec2 uv = (pix / u_res) * 2.0 - 1.0;
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

  if (i >= maxI - 0.5) {
    gl_FragColor = vec4(0.01, 0.02, 0.03, 1.0);
    return;
  }

  float mag = length(z);
  float smoothI = i - log2(log2(max(mag, 1.0001))) + 4.0;
  float t = smoothI * 0.018 + u_time * 0.035;
  vec3 col = palette(t, u_palette);
  col += exp(-0.012 * smoothI) * 0.12 * vec3(0.4, 0.9, 0.85);
  col = pow(max(col, 0.0), vec3(0.92));
  gl_FragColor = vec4(col, 1.0);
}
`;
