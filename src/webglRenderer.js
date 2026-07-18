import { VERT, FRAG } from "./shaders.js";

function splitDouble(x) {
  const hi = Math.fround(x);
  const lo = x - hi;
  return [hi, lo];
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(info || "Shader compile failed");
  }
  return shader;
}

function createProgram(gl, vertSrc, fragSrc) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Program link failed");
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

export function createWebGLRenderer(canvas) {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    powerPreference: "high-performance",
    alpha: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const program = createProgram(gl, VERT, FRAG);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    res: gl.getUniformLocation(program, "u_res"),
    centerHi: gl.getUniformLocation(program, "u_center_hi"),
    centerLo: gl.getUniformLocation(program, "u_center_lo"),
    scale: gl.getUniformLocation(program, "u_scale"),
    iters: gl.getUniformLocation(program, "u_iters"),
    time: gl.getUniformLocation(program, "u_time"),
    palette: gl.getUniformLocation(program, "u_palette"),
    aspect: gl.getUniformLocation(program, "u_aspect"),
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      return true;
    }
    return false;
  }

  function render({ centerX, centerY, scale, iters, time, palette }) {
    resize();
    const [cxHi, cxLo] = splitDouble(centerX);
    const [cyHi, cyLo] = splitDouble(centerY);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.uniform2f(uniforms.res, canvas.width, canvas.height);
    gl.uniform2f(uniforms.centerHi, cxHi, cyHi);
    gl.uniform2f(uniforms.centerLo, cxLo, cyLo);
    gl.uniform1f(uniforms.scale, scale);
    gl.uniform1f(uniforms.iters, iters);
    gl.uniform1f(uniforms.time, time);
    gl.uniform1f(uniforms.palette, palette);
    gl.uniform1f(uniforms.aspect, canvas.width / canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  return { kind: "webgl2", resize, render };
}
