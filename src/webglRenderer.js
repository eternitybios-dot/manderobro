import {
  VERT_WEBGL1,
  VERT_WEBGL2,
  FRAG_WEBGL1_FAST,
  FRAG_WEBGL1_DEEP,
  FRAG_WEBGL2_FAST,
  FRAG_WEBGL2_DEEP,
} from "./shaders.js";

/** Below this scale, switch to double-float (same place — no visual hop). */
const DEEP_SCALE = 2.5e-4;

function splitDouble(x) {
  const hi = Math.fround(x);
  return [hi, x - hi];
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

function probe(gl) {
  const fmt = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  const highp = !!(fmt && fmt.precision >= 23);
  return {
    highp,
    // With double-float we can keep going much deeper in the same spot
    minScale: highp ? 3e-13 : 8e-7,
  };
}

function buildRenderer(canvas, gl, kind, vert, fragFast, fragDeep, isWebGL2) {
  const fastProg = createProgram(gl, vert, fragFast);
  let deepProg = null;
  try {
    deepProg = createProgram(gl, vert, fragDeep);
  } catch (err) {
    console.warn("Deep double-float shader unavailable, using fast only:", err);
  }

  const bindFast = bindQuad(gl, fastProg, isWebGL2);
  const bindDeep = deepProg ? bindQuad(gl, deepProg, isWebGL2) : null;
  const precision = probe(gl);

  const fastU = {
    res: gl.getUniformLocation(fastProg, "u_res"),
    center: gl.getUniformLocation(fastProg, "u_center"),
    scale: gl.getUniformLocation(fastProg, "u_scale"),
    iters: gl.getUniformLocation(fastProg, "u_iters"),
    time: gl.getUniformLocation(fastProg, "u_time"),
    palette: gl.getUniformLocation(fastProg, "u_palette"),
    aspect: gl.getUniformLocation(fastProg, "u_aspect"),
  };

  const deepU = deepProg
    ? {
        res: gl.getUniformLocation(deepProg, "u_res"),
        centerHi: gl.getUniformLocation(deepProg, "u_center_hi"),
        centerLo: gl.getUniformLocation(deepProg, "u_center_lo"),
        scale: gl.getUniformLocation(deepProg, "u_scale"),
        iters: gl.getUniformLocation(deepProg, "u_iters"),
        time: gl.getUniformLocation(deepProg, "u_time"),
        palette: gl.getUniformLocation(deepProg, "u_palette"),
        aspect: gl.getUniformLocation(deepProg, "u_aspect"),
      }
    : null;

  function resize(deepMode) {
    const dprCap = deepMode ? 1.35 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
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
    const useDeep = !!(deepProg && scale < DEEP_SCALE);
    resize(useDeep);
    const aspect = canvas.width / Math.max(1, canvas.height);

    if (useDeep) {
      const [cxHi, cxLo] = splitDouble(centerX);
      const [cyHi, cyLo] = splitDouble(centerY);
      gl.useProgram(deepProg);
      bindDeep();
      gl.uniform2f(deepU.res, canvas.width, canvas.height);
      gl.uniform2f(deepU.centerHi, cxHi, cyHi);
      gl.uniform2f(deepU.centerLo, cxLo, cyLo);
      gl.uniform1f(deepU.scale, scale);
      gl.uniform1f(deepU.iters, iters);
      gl.uniform1f(deepU.time, time);
      gl.uniform1f(deepU.palette, palette);
      gl.uniform1f(deepU.aspect, aspect);
    } else {
      gl.useProgram(fastProg);
      bindFast();
      gl.uniform2f(fastU.res, canvas.width, canvas.height);
      gl.uniform2f(fastU.center, centerX, centerY);
      gl.uniform1f(fastU.scale, scale);
      gl.uniform1f(fastU.iters, iters);
      gl.uniform1f(fastU.time, time);
      gl.uniform1f(fastU.palette, palette);
      gl.uniform1f(fastU.aspect, aspect);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  resize(false);
  render({
    centerX: -0.5,
    centerY: 0,
    scale: 2.2,
    iters: 140,
    time: 0,
    palette: 0,
  });

  return {
    kind,
    resize: () => resize(false),
    render,
    canvas,
    minScale: deepProg ? precision.minScale : precision.highp ? 1.5e-4 : 4e-4,
    highp: precision.highp,
    hasDeep: !!deepProg,
    deepScale: DEEP_SCALE,
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
      return buildRenderer(
        canvas,
        gl2,
        "webgl2",
        VERT_WEBGL2,
        FRAG_WEBGL2_FAST,
        FRAG_WEBGL2_DEEP,
        true
      );
    }
  } catch (err) {
    console.warn("WebGL2 Mandelbrot failed:", err);
  }

  const target = poisoned ? replaceCanvas(canvas) : canvas;

  try {
    const gl1 =
      target.getContext("webgl", {
        antialias: false,
        powerPreference: "high-performance",
        alpha: false,
        preserveDrawingBuffer: false,
      }) ||
      target.getContext("experimental-webgl", { antialias: false, alpha: false });

    if (gl1) {
      return buildRenderer(
        target,
        gl1,
        "webgl1",
        VERT_WEBGL1,
        FRAG_WEBGL1_FAST,
        FRAG_WEBGL1_DEEP,
        false
      );
    }
  } catch (err) {
    console.warn("WebGL1 Mandelbrot failed:", err);
  }

  return poisoned ? { kind: "failed", canvas: target, resize: () => false, render: () => {} } : null;
}
