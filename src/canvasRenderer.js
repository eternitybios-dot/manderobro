/** CPU fallback: one continuous Mandelbrot dive → connected Julia handoff. */

const HANDOFF_LOG = 10.2;
const HANDOFF_WIDTH = 2.2;
const LOG_PERIOD = Math.log(6);
const BASE_SPAN = 2.6;

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

function sampleField(uvx, uvy, centerX, centerY, span, juliaMix, jx, jy, maxI, time, paletteMode) {
  const cx = centerX + uvx * span;
  const cy = centerY + uvy * span;
  const z0x = juliaMix * cx;
  const z0y = juliaMix * cy;
  const kx = cx * (1 - juliaMix) + jx * juliaMix;
  const ky = cy * (1 - juliaMix) + jy * juliaMix;
  return colorize(escape(z0x, z0y, kx, ky, maxI), time, paletteMode);
}

function layerWeight(phase) {
  return 0.5 - 0.5 * Math.cos(Math.PI * 2 * Math.max(0, Math.min(1, phase)));
}

function fakeJulia(uvx, uvy, deep, jx, jy, aimX, aimY, maxI, time, paletteMode) {
  const matchSpan = (BASE_SPAN / Math.exp(HANDOFF_LOG)) * 1.55;
  const crawlAmp = 0.18 * Math.min(1, Math.max(0, (deep - 0.8) / 2.7));
  const crawlX =
    crawlAmp * Math.sin(deep * 0.028 + aimX * 1.1) + aimX * (0.04 * Math.min(1, Math.max(0, (deep - 1) / 3)));
  const crawlY =
    crawlAmp * Math.cos(deep * 0.025 + aimY * 1.0) + aimY * (0.04 * Math.min(1, Math.max(0, (deep - 1) / 3)));

  const lf = deep / LOG_PERIOD + 0.28;
  const p0 = lf - Math.floor(lf);
  const p1 = lf - 0.5 - Math.floor(lf - 0.5);
  const span0 = matchSpan / Math.exp(p0 * LOG_PERIOD);
  const span1 = matchSpan / Math.exp(p1 * LOG_PERIOD);
  const w0 = Math.max(layerWeight(p0), 0.001);
  const w1 = Math.max(layerWeight(p1), 0.001);
  const a = sampleField(uvx, uvy, crawlX, crawlY, span0, 1, jx, jy, maxI, time, paletteMode);
  const b = sampleField(uvx, uvy, crawlX, crawlY, span1, 1, jx, jy, maxI, time, paletteMode);
  const inv = 1 / (w0 + w1);
  return [(a[0] * w0 + b[0] * w1) * inv, (a[1] * w0 + b[1] * w1) * inv, (a[2] * w0 + b[2] * w1) * inv];
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

  function render({ logZoom, centerX, centerY, aimX, aimY, iters, time, palette }) {
    resize();
    const w = canvas.width;
    const h = canvas.height;
    if (!imageData) imageData = ctx.createImageData(w, h);
    const data = imageData.data;
    const aspect = w / h;
    const lz = Math.max(logZoom, 0);
    const maxI = Math.min(iters, 70);
    const clampedZoom = Math.exp(Math.min(lz, HANDOFF_LOG + HANDOFF_WIDTH));
    const realSpan = BASE_SPAN / clampedZoom;
    const handoff = Math.min(1, Math.max(0, (lz - HANDOFF_LOG) / HANDOFF_WIDTH));
    const deep = Math.max(0, lz - HANDOFF_LOG);

    for (let y = 0; y < h; y++) {
      const uvy = ((y + 0.5) / h) * 2 - 1;
      for (let x = 0; x < w; x++) {
        const uvx = (((x + 0.5) / w) * 2 - 1) * aspect;
        const real = sampleField(uvx, uvy, centerX, centerY, realSpan, 0, centerX, centerY, maxI, time, palette);
        let r = real[0];
        let g = real[1];
        let b = real[2];
        if (handoff > 0) {
          const fake = fakeJulia(uvx, uvy, deep, centerX, centerY, aimX, aimY, maxI, time, palette);
          r = r * (1 - handoff) + fake[0] * handoff;
          g = g * (1 - handoff) + fake[1] * handoff;
          b = b * (1 - handoff) + fake[2] * handoff;
        }
        const idx = (y * w + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return { kind: "canvas2d", resize, render, canvas, infinite: true };
}
