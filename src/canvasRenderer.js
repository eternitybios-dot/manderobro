/**
 * CPU fallback: direct double-precision Mandelbrot. float64 keeps the
 * picture clean far deeper than the WebGL1 float path; main.js turns the
 * dive around at maxLogZoom, so this stays one honest continuous zoom.
 */

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

function escape(cx, cy, maxI) {
  let zx = 0;
  let zy = 0;
  let i = 0;
  for (; i < maxI; i++) {
    const zx2 = zx * zx;
    const zy2 = zy * zy;
    if (zx2 + zy2 > 65536) break;
    const nzx = zx2 - zy2 + cx;
    zy = 2 * zx * zy + cy;
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

export function createCanvasRenderer(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) throw new Error("Canvas2D unavailable");
  let imageData = null;
  let lastParams = null;

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

  function render(p) {
    resize();
    lastParams = p;
    const { centerX, centerY, span, iters, time, palette: paletteMode } = p;
    const w = canvas.width;
    const h = canvas.height;
    if (!imageData) imageData = ctx.createImageData(w, h);
    const data = imageData.data;
    const aspect = w / h;
    const maxI = Math.min(iters, 90);

    for (let y = 0; y < h; y++) {
      const uvy = ((y + 0.5) / h) * 2 - 1;
      for (let x = 0; x < w; x++) {
        const uvx = (((x + 0.5) / w) * 2 - 1) * aspect;
        const [r, g, b] = colorize(
          escape(centerX + uvx * span, centerY + uvy * span, maxI),
          time,
          paletteMode
        );
        const idx = (y * w + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function capture(gridW = 40, gridH = 60) {
    if (lastParams) render(lastParams);
    const w = canvas.width;
    const h = canvas.height;
    const px = ctx.getImageData(0, 0, w, h).data;
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
  }

  return {
    kind: "canvas2d",
    needsReference: false,
    maxLogZoom: 22, // float64 direct iteration; iter budget is the real limit here
    canvas,
    resize,
    setScale() {},
    getScale: () => 1,
    render,
    capture,
  };
}
