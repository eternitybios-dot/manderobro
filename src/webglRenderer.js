import { VERT_WEBGL1, VERT_WEBGL2, FRAG_WEBGL1, FRAG_WEBGL2 } from "./shaders.js";

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

function buildRenderer(canvas, gl, kind, vert, frag, isWebGL2) {
  const program = createProgram(gl, vert, frag);
  const bind = bindQuad(gl, program, isWebGL2);
  const uniforms = {
    res: gl.getUniformLocation(program, "u_res"),
    aspect: gl.getUniformLocation(program, "u_aspect"),
    logZoom: gl.getUniformLocation(program, "u_logZoom"),
    center: gl.getUniformLocation(program, "u_center"),
    fix: gl.getUniformLocation(program, "u_fix"),
    lnLam: gl.getUniformLocation(program, "u_lnLam"),
    argLam: gl.getUniformLocation(program, "u_argLam"),
    w0: gl.getUniformLocation(program, "u_w0"),
    time: gl.getUniformLocation(program, "u_time"),
    palette: gl.getUniformLocation(program, "u_palette"),
    iters: gl.getUniformLocation(program, "u_iters"),
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

  function render({ logZoom, centerX, centerY, fixX, fixY, lnLam, argLam, w0X, w0Y, iters, time, palette }) {
    resize();
    gl.useProgram(program);
    bind();
    gl.uniform2f(uniforms.res, canvas.width, canvas.height);
    gl.uniform1f(uniforms.aspect, canvas.width / Math.max(1, canvas.height));
    gl.uniform1f(uniforms.logZoom, logZoom);
    gl.uniform2f(uniforms.center, centerX, centerY);
    gl.uniform2f(uniforms.fix, fixX, fixY);
    gl.uniform1f(uniforms.lnLam, lnLam);
    gl.uniform1f(uniforms.argLam, argLam);
    gl.uniform2f(uniforms.w0, w0X || 0, w0Y || 0);
    gl.uniform1f(uniforms.time, time);
    gl.uniform1f(uniforms.palette, palette);
    gl.uniform1f(uniforms.iters, iters);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  resize();
  render({
    logZoom: 0,
    centerX: -0.5,
    centerY: 0,
    fixX: 0.5,
    fixY: 0,
    lnLam: 0.7,
    argLam: 0,
    iters: 120,
    time: 0,
    palette: 0,
  });

  return { kind, resize, render, canvas, infinite: true };
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
      return buildRenderer(canvas, gl2, "webgl2", VERT_WEBGL2, FRAG_WEBGL2, true);
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
      return buildRenderer(target, gl1, "webgl1", VERT_WEBGL1, FRAG_WEBGL1, false);
    }
  } catch (err) {
    console.warn("WebGL1 failed:", err);
  }

  return poisoned ? { kind: "failed", canvas: target, resize: () => false, render: () => {} } : null;
}
