/** CPU Mandelbrot fallback — keep resolution high enough to avoid mosaic look. */

function paletteColor(t, mode, time) {
  t = (t + time * 0.035) % 1;
  if (t < 0) t += 1;
  const r = 0.5 + 0.5 * Math.cos(6.28318 * (t + 0.0) + 0.2);
  const g = 0.5 + 0.5 * Math.cos(6.28318 * (t + 0.18) + 1.4);
  const b = 0.5 + 0.5 * Math.cos(6.28318 * (t + 0.33) + 2.1);
  return [
    Math.max(0, Math.min(255, r * 255)),
    Math.max(0, Math.min(255, g * 255)),
    Math.max(0, Math.min(255, b * 255)),
  ];
}

export function createCanvasRenderer(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) throw new Error("Canvas2D unavailable");

  let imageData = null;
  let row = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    // Sharper than before — mosaic was mostly from upscaling a tiny buffer
    const w = Math.max(280, Math.floor(window.innerWidth * dpr * 0.55));
    const h = Math.max(400, Math.floor(window.innerHeight * dpr * 0.55));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      imageData = ctx.createImageData(w, h);
      row = 0;
      return true;
    }
    return false;
  }

  function render({ centerX, centerY, scale, iters, time, palette }) {
    resize();
    const w = canvas.width;
    const h = canvas.height;
    if (!imageData || imageData.width !== w || imageData.height !== h) {
      imageData = ctx.createImageData(w, h);
      row = 0;
    }

    const data = imageData.data;
    const aspect = w / h;
    const maxI = Math.min(iters, 180);
    const rowsPerFrame = Math.max(12, Math.ceil(h / 4));

    for (let n = 0; n < rowsPerFrame; n++) {
      const y = row % h;
      const cy = centerY + (((y + 0.5) / h) * 2 - 1) * scale;
      for (let x = 0; x < w; x++) {
        const cx = centerX + (((x + 0.5) / w) * 2 - 1) * aspect * scale;
        let zx = 0;
        let zy = 0;
        let i = 0;
        for (; i < maxI; i++) {
          const zx2 = zx * zx;
          const zy2 = zy * zy;
          if (zx2 + zy2 > 16) break;
          const nzx = zx2 - zy2 + cx;
          zy = 2 * zx * zy + cy;
          zx = nzx;
        }
        const idx = (y * w + x) * 4;
        if (i >= maxI) {
          data[idx] = 3;
          data[idx + 1] = 5;
          data[idx + 2] = 8;
          data[idx + 3] = 255;
          continue;
        }
        const mag2 = zx * zx + zy * zy;
        const smooth = i - Math.log2(Math.log2(Math.max(mag2, 1.0001))) + 4;
        const [r, g, b] = paletteColor(smooth * 0.018, palette, time);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
      row++;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  return {
    kind: "canvas2d",
    resize,
    render,
    canvas,
    // JS numbers are float64, but we still relay early for speed/quality
    minScale: 4e-5,
  };
}
