/**
 * CPU fallback: real Mandelbrot dive → exactly self-similar Julia spiral
 * around the repelling fixed point (same math as the shader).
 */

const HANDOFF_LOG = 9.0;
const HANDOFF_WIDTH = 3.0;
const BASE_SPAN = 2.6;
const JULIA_SPAN0 = 0.026;

function palette(t, mode, time) {
  t = (t + time * 0.018) % 1;
  if (t < 0) t += 1;
  if (mode < 0.5) {
    return [
      (0.5 + 0.5 * Math.cos(6.28318 * (t + 0.0) + 0.2)) * 255,
      (0.5 + 0.5 * Math.cos(6.28318 * (t + 0.18) + 1.4)) * 255,
      (0.5 + 0.5 * Math.cos(6.28318 * (t + 0.33) + 2.1)) * 255,
    ];
  }
  return [
    (0.55 + 0.45 * Math.cos(6.28318 * (t + 0.05) + 1.8)) * 255,
    (0.55 + 0.45 * Math.cos(6.28318 * (t + 0.22) + 0.9)) * 255,
    (0.55 + 0.45 * Math.cos(6.28318 * (t + 0.4) + 0.3)) * 255,
  ];
}

function escape(z0x, z0y, kx, ky, maxI) {
  let zx = z0x;
  let zy = z0y;
  let i = 0;
  for (; i < maxI; i++) {
    const zx2 = zx * zx;
    const zy2 = zy * zy;
    if (zx2 + zy2 > 256) break;
    const nzx = zx2 - zy2 + kx;
    zy = 2 * zx * zy + ky;
    zx = nzx;
  }
  if (i >= maxI) return -1;
  const mag = Math.hypot(zx, zy);
  return i - Math.log2(Math.log2(Math.max(mag, 1.0001))) + 4;
}

function colorize(s, time, paletteMode) {
  if (s < 0) return [3, 4, 6];
  const [r, g, b] = palette(s * 0.017, paletteMode, time);
  const glow = Math.exp(-0.012 * s) * 0.16;
  return [
    Math.min(255, r + glow * 90),
    Math.min(255, g + glow * 240),
    Math.min(255, b + glow * 210),
  ];
}

function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function createCanvasRenderer(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) throw new Error("Canvas2D unavailable");
  let imageData = null;

  function resize() {
    const w = Math.max(180, Math.floor(window.innerWidth * 0.35));
    const h = Math.max(280, Math.floor(window.innerHeight * 0.35));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      imageData = ctx.createImageData(w, h);
      return true;
    }
    return false;
  }

  function render({ logZoom, centerX, centerY, fixX, fixY, lnLam, argLam, w0X, w0Y, iters, time, palette }) {
    resize();
    const w = canvas.width;
    const h = canvas.height;
    if (!imageData) imageData = ctx.createImageData(w, h);
    const data = imageData.data;
    const aspect = w / h;
    const lz = Math.max(logZoom, 0);
    const maxI = Math.min(iters, 90);
    const handoff = smoothstep(HANDOFF_LOG, HANDOFF_LOG + HANDOFF_WIDTH, lz);

    const realLog = Math.min(lz, HANDOFF_LOG + HANDOFF_WIDTH);
    const realSpan = BASE_SPAN / Math.exp(realLog);

    const d = Math.max(0, lz - HANDOFF_LOG);
    const n = Math.floor(d / lnLam);
    const r = d - n * lnLam;
    const ang = -(r / lnLam) * argLam;
    const scale = Math.exp(-r);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);

    for (let y = 0; y < h; y++) {
      const uvy = ((y + 0.5) / h) * 2 - 1;
      for (let x = 0; x < w; x++) {
        const uvx = (((x + 0.5) / w) * 2 - 1) * aspect;
        let rr = 0;
        let gg = 0;
        let bb = 0;
        if (handoff < 0.999) {
          const s = escape(0, 0, centerX + uvx * realSpan, centerY + uvy * realSpan, maxI);
          const col = colorize(s, time, palette);
          rr = col[0];
          gg = col[1];
          bb = col[2];
        }
        if (handoff > 0.001) {
          const bx = (w0X || 0) + uvx * JULIA_SPAN0;
          const by = (w0Y || 0) + uvy * JULIA_SPAN0;
          const wx = scale * (ca * bx - sa * by);
          const wy = scale * (sa * bx + ca * by);
          const s = escape(fixX + wx, fixY + wy, centerX, centerY, maxI);
          const col = colorize(s < 0 ? s : s + n, time, palette);
          rr = rr * (1 - handoff) + col[0] * handoff;
          gg = gg * (1 - handoff) + col[1] * handoff;
          bb = bb * (1 - handoff) + col[2] * handoff;
        }
        const idx = (y * w + x) * 4;
        data[idx] = rr;
        data[idx + 1] = gg;
        data[idx + 2] = bb;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return { kind: "canvas2d", resize, render, canvas, infinite: true };
}
