/** CPU Mandelbrot renderer for environments without WebGL2. */

function paletteColor(t, mode, time) {
  t = (t + time * 0.035) % 1;
  if (t < 0) t += 1;
  let r, g, b;
  if (mode < 0.5) {
    r = 0.5 + 0.5 * Math.cos(6.28318 * (t + 0.0) + 0.2);
    g = 0.5 + 0.5 * Math.cos(6.28318 * (t + 0.18) + 1.4);
    b = 0.5 + 0.5 * Math.cos(6.28318 * (t + 0.33) + 2.1);
  } else if (mode < 1.5) {
    r = 0.55 + 0.45 * Math.cos(6.28318 * (t + 0.05) + 1.8);
    g = 0.55 + 0.45 * Math.cos(6.28318 * (t + 0.22) + 0.9);
    b = 0.55 + 0.45 * Math.cos(6.28318 * (t + 0.4) + 0.3);
  } else if (mode < 2.5) {
    const a = [0.08, 0.14, 0.18];
    const bb = [0.55, 0.85, 0.75];
    const c = [1.0, 0.8, 0.6];
    r = a[0] + bb[0] * Math.pow(Math.abs(Math.sin(Math.PI * (t + c[0]))), 1.4);
    g = a[1] + bb[1] * Math.pow(Math.abs(Math.sin(Math.PI * (t + c[1]))), 1.4);
    b = a[2] + bb[2] * Math.pow(Math.abs(Math.sin(Math.PI * (t + c[2]))), 1.4);
  } else {
    const pulse = 0.5 + 0.5 * Math.sin(t * 18);
    r = 0.02 + (1.0 - 0.02) * pulse + 0.25 * Math.cos(6.28318 * (t + 0.1));
    g = 0.03 + (0.72 - 0.03) * pulse + 0.25 * Math.cos(6.28318 * (t + 0.25));
    b = 0.06 + (0.35 - 0.06) * pulse + 0.25 * Math.cos(6.28318 * (t + 0.4));
  }
  return [
    Math.max(0, Math.min(255, (r ** 0.92) * 255)),
    Math.max(0, Math.min(255, (g ** 0.92) * 255)),
    Math.max(0, Math.min(255, (b ** 0.92) * 255)),
  ];
}

export function createCanvasRenderer(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas2D unavailable");

  let imageData = null;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    // Lower internal res for CPU path so auto-zoom stays smooth on phones
    const scale = 0.45;
    const w = Math.max(1, Math.floor(window.innerWidth * dpr * scale));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      imageData = ctx.createImageData(w, h);
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
    }
    const data = imageData.data;
    const aspect = w / h;
    const maxI = Math.min(iters, 420);

    for (let y = 0; y < h; y++) {
      const cy = centerY + ((y / h) * 2 - 1) * scale;
      for (let x = 0; x < w; x++) {
        const cx = centerX + ((x / w) * 2 - 1) * aspect * scale;
        let zx = 0;
        let zy = 0;
        let i = 0;
        for (; i < maxI; i++) {
          const zx2 = zx * zx;
          const zy2 = zy * zy;
          if (zx2 + zy2 > 256) break;
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
        const mag = Math.hypot(zx, zy);
        const smooth = i - Math.log2(Math.log2(Math.max(mag, 1.0001))) + 4;
        const t = smooth * 0.018;
        const [r, g, b] = paletteColor(t, palette, time);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return { kind: "canvas2d", resize, render };
}
