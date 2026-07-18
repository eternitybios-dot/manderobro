/** Fast-enough CPU Mandelbrot for phones without WebGL. */

function paletteColor(t, mode, time) {
  t = (t + time * 0.035) % 1;
  if (t < 0) t += 1;
  let r;
  let g;
  let b;
  if (mode < 1.5) {
    r = 0.5 + 0.5 * Math.cos(6.28318 * (t + 0.0) + 0.2);
    g = 0.5 + 0.5 * Math.cos(6.28318 * (t + 0.18) + 1.4);
    b = 0.5 + 0.5 * Math.cos(6.28318 * (t + 0.33) + 2.1);
  } else {
    r = 0.55 + 0.45 * Math.cos(6.28318 * (t + 0.05) + 1.8);
    g = 0.55 + 0.45 * Math.cos(6.28318 * (t + 0.22) + 0.9);
    b = 0.55 + 0.45 * Math.cos(6.28318 * (t + 0.4) + 0.3);
  }
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
    // Keep CPU path tiny so phones stay interactive
    const w = Math.max(120, Math.floor(window.innerWidth * 0.28));
    const h = Math.max(180, Math.floor(window.innerHeight * 0.28));
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
    const maxI = Math.min(iters, 140);
    // Progressive: a chunk of rows each frame keeps UI alive
    const rowsPerFrame = Math.max(8, Math.ceil(h / 6));

    for (let n = 0; n < rowsPerFrame; n++) {
      const y = row % h;
      const cy = centerY + ((y / h) * 2 - 1) * scale;
      for (let x = 0; x < w; x++) {
        const cx = centerX + ((x / w) * 2 - 1) * aspect * scale;
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

  return { kind: "canvas2d", resize, render, canvas };
}
