/** CPU fallback of the fake infinite fractal zoom (same log-octave idea). */

function hash21(n) {
  const x = Math.sin(n) * 43758.5453;
  const y = Math.sin(n * 1.6180339887) * 22578.1459;
  return [x - Math.floor(x), y - Math.floor(y)];
}

function palette(t, mode, time) {
  t = (t + time * 0.03) % 1;
  if (t < 0) t += 1;
  const r = 0.5 + 0.5 * Math.cos(6.28318 * (t + 0.0) + 0.2);
  const g = 0.5 + 0.5 * Math.cos(6.28318 * (t + 0.18) + 1.4);
  const b = 0.5 + 0.5 * Math.cos(6.28318 * (t + 0.33) + 2.1);
  return [r * 255, g * 255, b * 255];
}

function escape(cx, cy, maxI, juliaMix, jx, jy) {
  let zx = juliaMix * cx * 0.35;
  let zy = juliaMix * cy * 0.35;
  const kx = cx * (1 - juliaMix * 0.85) + jx * juliaMix * 0.85;
  const ky = cy * (1 - juliaMix * 0.85) + jy * juliaMix * 0.85;
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

function regionCenter(octave, aimX, aimY) {
  const h = hash21(octave + 11);
  const h2 = hash21(octave * 3.7 + 2);
  const base = [-0.75 + 0.55 * (h[0] - 0.5), 0.85 * (h[1] - 0.5)];
  const mini = [-1.25 + 0.35 * (h2[0] - 0.5), 0.35 * (h2[1] - 0.5)];
  const pick = h[0] > 0.55 ? mini : base;
  return [pick[0] + aimX * 0.22 * (0.4 + 0.6 * h[1]), pick[1] + aimY * 0.22 * (0.4 + 0.6 * h[1])];
}

function layerColor(uvx, uvy, octave, localZoom, aimX, aimY, maxI, time, paletteMode) {
  const [cx0, cy0] = regionCenter(octave, aimX, aimY);
  const h = hash21(octave + 5);
  const juliaMix = 0.08 + 0.18 * h[0];
  const jx = -0.4 + (h[0] - 0.5) * 0.9 + aimX * 0.15;
  const jy = 0.6 + (h[1] - 0.5) * 0.9 + aimY * 0.15;
  const scale = 1.65 / Math.max(localZoom, 1);
  const cx = cx0 + uvx * scale;
  const cy = cy0 + uvy * scale;
  const s = escape(cx, cy, maxI, juliaMix, jx, jy);
  if (s < 0) return [3, 5, 8];
  const [r, g, b] = palette(s * 0.02 + octave * 0.07, paletteMode, time);
  const glow = Math.exp(-0.014 * s) * 0.14;
  return [
    Math.min(255, r + glow * 90),
    Math.min(255, g + glow * 230),
    Math.min(255, b + glow * 200),
  ];
}

const LOG_OCTAVE = Math.log(8);

export function createCanvasRenderer(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) throw new Error("Canvas2D unavailable");
  let imageData = null;

  function resize() {
    const w = Math.max(200, Math.floor(window.innerWidth * 0.4));
    const h = Math.max(300, Math.floor(window.innerHeight * 0.4));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      imageData = ctx.createImageData(w, h);
      return true;
    }
    return false;
  }

  function render({ logZoom, aimX, aimY, iters, time, palette }) {
    resize();
    const w = canvas.width;
    const h = canvas.height;
    if (!imageData) imageData = ctx.createImageData(w, h);
    const data = imageData.data;
    const aspect = w / h;
    const lf = Math.max(logZoom, 0) / LOG_OCTAVE;
    const octave = Math.floor(lf);
    const frac = lf - octave;
    const localA = Math.exp(frac * LOG_OCTAVE);
    const maxI = Math.min(iters, 90);
    const blend = frac < 0.78 ? 0 : (frac - 0.78) / 0.22;

    for (let y = 0; y < h; y++) {
      const uvy = ((y + 0.5) / h) * 2 - 1;
      for (let x = 0; x < w; x++) {
        const uvx = (((x + 0.5) / w) * 2 - 1) * aspect;
        const a = layerColor(uvx, uvy, octave, localA, aimX, aimY, maxI, time, palette);
        let r = a[0];
        let g = a[1];
        let b = a[2];
        if (blend > 0) {
          const bcol = layerColor(uvx, uvy, octave + 1, 1, aimX, aimY, maxI, time, palette);
          r = r * (1 - blend) + bcol[0] * blend;
          g = g * (1 - blend) + bcol[1] * blend;
          b = b * (1 - blend) + bcol[2] * blend;
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
