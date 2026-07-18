/** CPU Mandelbrot fallback — full frames only (progressive rows look broken while zooming). */

function paletteColor(t, time) {
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

  function resize() {
    // Modest buffer so full-frame CPU render stays realtime on phones
    const w = Math.max(220, Math.floor(window.innerWidth * 0.42));
    const h = Math.max(320, Math.floor(window.innerHeight * 0.42));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      imageData = ctx.createImageData(w, h);
      return true;
    }
    return false;
  }

  function render({ centerX, centerY, scale, iters, time }) {
    resize();
    const w = canvas.width;
    const h = canvas.height;
    if (!imageData || imageData.width !== w || imageData.height !== h) {
      imageData = ctx.createImageData(w, h);
    }

    const data = imageData.data;
    const aspect = w / h;
    const maxI = Math.min(iters, 120);

    for (let y = 0; y < h; y++) {
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
        const [r, g, b] = paletteColor(smooth * 0.018, time);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  return {
    kind: "canvas2d",
    resize,
    render,
    canvas,
    // JS float64 can go much deeper on the CPU path
    minScale: 1e-14,
  };
}
