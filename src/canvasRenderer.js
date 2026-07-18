/** CPU fallback of the fake infinite fractal zoom (phase-offset layers). */

function hash21(n) {
  const x = Math.sin(n) * 43758.5453;
  const y = Math.sin(n * 1.6180339887) * 22578.1459;
  return [x - Math.floor(x), y - Math.floor(y)];
}

function palette(t, mode, time) {
  t = (t + time * 0.025) % 1;
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

function escape(cx, cy, maxI, juliaMix, jx, jy) {
  let zx = juliaMix * cx * 0.28;
  let zy = juliaMix * cy * 0.28;
  const kx = cx * (1 - juliaMix * 0.82) + jx * juliaMix * 0.82;
  const ky = cy * (1 - juliaMix * 0.82) + jy * juliaMix * 0.82;
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
  const pick = Math.floor(h[0] * 4);
  const sites = [
    [-0.75, 0.12],
    [-0.16, 1.04],
    [-1.25, 0.02],
    [0.28, -0.01],
  ];
  const base = sites[pick] || sites[0];
  return [
    base[0] + (h2[0] - 0.5) * 0.22 + aimX * (0.14 + 0.18 * h[1]),
    base[1] + (h2[1] - 0.5) * 0.28 + aimY * (0.14 + 0.18 * h[1]),
  ];
}

function layerColor(uvx, uvy, octave, localZoom, aimX, aimY, maxI, time, paletteMode) {
  const [cx0, cy0] = regionCenter(octave, aimX, aimY);
  const h = hash21(octave + 5);
  const juliaMix = 0.08 + 0.22 * h[0];
  const jx = -0.42 + (h[0] - 0.5) * 0.95 + aimX * 0.1;
  const jy = 0.63 + (h[1] - 0.5) * 0.95 + aimY * 0.1;
  const scale = 1.75 / Math.max(localZoom, 1);
  const ang = (h[1] - 0.5) * 1.2 + octave * 0.37;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const rx = ca * uvx - sa * uvy;
  const ry = sa * uvx + ca * uvy;
  const cx = cx0 + rx * scale;
  const cy = cy0 + ry * scale;
  const s = escape(cx, cy, maxI, juliaMix, jx, jy);
  if (s < 0) return [3, 5, 8];
  const [r, g, b] = palette(s * 0.018 + octave * 0.07, paletteMode, time);
  const glow = Math.exp(-0.012 * s) * 0.18;
  return [
    Math.min(255, r + glow * 90),
    Math.min(255, g + glow * 240),
    Math.min(255, b + glow * 210),
  ];
}

function layerWeight(phase) {
  return 0.5 - 0.5 * Math.cos(Math.PI * 2 * Math.max(0, Math.min(1, phase)));
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
    const maxI = Math.min(iters, 70);

    for (let y = 0; y < h; y++) {
      const uvy = ((y + 0.5) / h) * 2 - 1;
      for (let x = 0; x < w; x++) {
        const uvx = (((x + 0.5) / w) * 2 - 1) * aspect;
        let r = 0;
        let g = 0;
        let b = 0;
        let wSum = 0;
        // Two layers on CPU for speed; still hides the wrap.
        for (let i = 0; i < 2; i++) {
          const shifted = lf - i / 2;
          const octave = Math.floor(shifted);
          const phase = shifted - octave;
          const localZoom = Math.exp(phase * LOG_OCTAVE);
          const weight = Math.max(layerWeight(phase), 0.02);
          const col = layerColor(
            uvx,
            uvy,
            octave + 17 * i,
            localZoom,
            aimX,
            aimY,
            maxI,
            time,
            palette
          );
          r += col[0] * weight;
          g += col[1] * weight;
          b += col[2] * weight;
          wSum += weight;
        }
        const inv = 1 / Math.max(wSum, 1e-3);
        const idx = (y * w + x) * 4;
        data[idx] = r * inv;
        data[idx + 1] = g * inv;
        data[idx + 2] = b * inv;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return { kind: "canvas2d", resize, render, canvas, infinite: true };
}
