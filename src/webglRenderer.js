import { VERT_WEBGL1, VERT_WEBGL2, FRAG_WEBGL1, FRAG_WEBGL2 } from "./shaders.js";

export const REF_TEX_W = 1024;
export const REF_TEX_H = 4;
export const MAX_REF_LEN = REF_TEX_W * REF_TEX_H;

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

function bindQuad(gl, program, isWebGL2) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  if (isWebGL2) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    return () => gl.bindVertexArray(vao);
  }

  const loc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  return () => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  };
}

function makeResize(canvas, gl, state) {
  return function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(window.innerWidth * dpr * state.scale));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr * state.scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      return true;
    }
    return false;
  };
}

/**
 * Box-averaged luminance grid of the current drawing buffer (for
 * verification). Cell averages stay stable across buffer-resolution
 * changes, unlike point samples of high-frequency fractal detail.
 */
function makeCapture(gl, canvas, renderLast) {
  return function capture(gridW = 40, gridH = 60) {
    renderLast(); // redraw so the buffer is valid in this task
    const w = canvas.width;
    const h = canvas.height;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const sum = new Float64Array(gridW * gridH);
    const cnt = new Float64Array(gridW * gridH);
    for (let y = 0; y < h; y++) {
      const gy = Math.min(gridH - 1, Math.floor((y / h) * gridH));
      for (let x = 0; x < w; x++) {
        const gx = Math.min(gridW - 1, Math.floor((x / w) * gridW));
        const i = (y * w + x) * 4;
        const cell = gy * gridW + gx;
        sum[cell] += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        cnt[cell] += 1;
      }
    }
    const out = new Array(gridW * gridH);
    for (let i = 0; i < out.length; i++) out[i] = sum[i] / Math.max(1, cnt[i]);
    return { w: gridW, h: gridH, luma: out };
  };
}

function buildWebGL2(canvas, gl) {
  const program = createProgram(gl, VERT_WEBGL2, FRAG_WEBGL2);
  const bind = bindQuad(gl, program, true);
  const u = {
    res: gl.getUniformLocation(program, "u_res"),
    aspect: gl.getUniformLocation(program, "u_aspect"),
    ref: gl.getUniformLocation(program, "u_ref"),
    refLen: gl.getUniformLocation(program, "u_refLen"),
    span: gl.getUniformLocation(program, "u_span"),
    offset: gl.getUniformLocation(program, "u_offset"),
    iters: gl.getUniformLocation(program, "u_iters"),
    time: gl.getUniformLocation(program, "u_time"),
    palette: gl.getUniformLocation(program, "u_palette"),
  };

  const refTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, refTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const padded = new Float32Array(MAX_REF_LEN * 2);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, REF_TEX_W, REF_TEX_H, 0, gl.RG, gl.FLOAT, padded);

  let refLen = 1;
  const state = { scale: 1 };
  const resize = makeResize(canvas, gl, state);
  let lastParams = null;

  function uploadReference(orbit, len) {
    refLen = Math.max(1, Math.min(len, MAX_REF_LEN));
    padded.fill(0);
    padded.set(orbit.subarray(0, refLen * 2));
    gl.bindTexture(gl.TEXTURE_2D, refTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, REF_TEX_W, REF_TEX_H, gl.RG, gl.FLOAT, padded);
  }

  function draw(p) {
    gl.useProgram(program);
    bind();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, refTex);
    gl.uniform1i(u.ref, 0);
    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform1f(u.aspect, canvas.width / Math.max(1, canvas.height));
    gl.uniform1i(u.refLen, refLen);
    gl.uniform1f(u.span, p.span);
    gl.uniform2f(u.offset, p.offsetX, p.offsetY);
    gl.uniform1f(u.iters, p.iters);
    gl.uniform1f(u.time, p.time);
    gl.uniform1f(u.palette, p.palette);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function render(p) {
    resize();
    lastParams = p;
    draw(p);
  }

  const capture = makeCapture(gl, canvas, () => lastParams && draw(lastParams));

  resize();
  return {
    kind: "webgl2-perturb",
    needsReference: true,
    maxRefLen: MAX_REF_LEN,
    maxLogZoom: 60, // span ~2.3e-26 — comfortably inside float32 for per-pixel deltas
    canvas,
    resize,
    setScale(s) {
      state.scale = Math.max(0.35, Math.min(1, s));
    },
    getScale: () => state.scale,
    uploadReference,
    render,
    capture,
  };
}

function buildWebGL1(canvas, gl) {
  const program = createProgram(gl, VERT_WEBGL1, FRAG_WEBGL1);
  const bind = bindQuad(gl, program, false);
  const u = {
    res: gl.getUniformLocation(program, "u_res"),
    aspect: gl.getUniformLocation(program, "u_aspect"),
    center: gl.getUniformLocation(program, "u_center"),
    span: gl.getUniformLocation(program, "u_span"),
    iters: gl.getUniformLocation(program, "u_iters"),
    time: gl.getUniformLocation(program, "u_time"),
    palette: gl.getUniformLocation(program, "u_palette"),
  };

  const state = { scale: 1 };
  const resize = makeResize(canvas, gl, state);
  let lastParams = null;

  function draw(p) {
    gl.useProgram(program);
    bind();
    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform1f(u.aspect, canvas.width / Math.max(1, canvas.height));
    gl.uniform2f(u.center, p.centerX, p.centerY);
    gl.uniform1f(u.span, p.span);
    gl.uniform1f(u.iters, Math.min(p.iters, 300));
    gl.uniform1f(u.time, p.time);
    gl.uniform1f(u.palette, p.palette);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function render(p) {
    resize();
    lastParams = p;
    draw(p);
  }

  const capture = makeCapture(gl, canvas, () => lastParams && draw(lastParams));

  resize();
  return {
    kind: "webgl1",
    needsReference: false,
    maxLogZoom: 8.5, // float32 direct iteration stays clean to ~×5000
    canvas,
    resize,
    setScale(s) {
      state.scale = Math.max(0.35, Math.min(1, s));
    },
    getScale: () => state.scale,
    render,
    capture,
  };
}

function replaceCanvas(oldCanvas) {
  const host = oldCanvas.parentElement;
  const fresh = document.createElement("canvas");
  fresh.id = oldCanvas.id || "gl";
  fresh.setAttribute("aria-label", oldCanvas.getAttribute("aria-label") || "マンデルブロ集合");
  host.replaceChild(fresh, oldCanvas);
  return fresh;
}

export function createWebGLRenderer(canvas) {
  let poisoned = false;
  try {
    const gl2 = canvas.getContext("webgl2", {
      antialias: false,
      powerPreference: "high-performance",
      alpha: false,
      preserveDrawingBuffer: false,
    });
    if (gl2) {
      poisoned = true;
      return buildWebGL2(canvas, gl2);
    }
  } catch (err) {
    console.warn("WebGL2 failed:", err);
  }

  const target = poisoned ? replaceCanvas(canvas) : canvas;
  try {
    const gl1 =
      target.getContext("webgl", {
        antialias: false,
        powerPreference: "high-performance",
        alpha: false,
      }) || target.getContext("experimental-webgl", { antialias: false, alpha: false });
    if (gl1) {
      return buildWebGL1(target, gl1);
    }
  } catch (err) {
    console.warn("WebGL1 failed:", err);
  }

  return poisoned ? { kind: "failed", canvas: target, resize: () => false, render: () => {} } : null;
}
