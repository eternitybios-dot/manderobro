/**
 * Arbitrary-precision core for true deep zoom.
 *
 * The center lives as BigInt fixed-point (value = big / 2^shift), so it keeps
 * full precision at any depth. The reference orbit Z_n = Z_{n-1}^2 + C is
 * iterated in fixed-point and exported as Float32 pairs; the GPU then only
 * iterates tiny per-pixel deltas around it (perturbation), which stays
 * accurate in float32 down to span ~1e-26.
 */

const LOG2E = Math.LOG2E;

/** Bits of fixed-point fraction needed at a given log-zoom (plus guard). */
export function requiredShift(logZoom) {
  return 64 + Math.ceil(Math.max(0, logZoom) * LOG2E);
}

/** Convert a double to BigInt fixed-point at `shift` fractional bits. */
export function toFixed(d, shift) {
  if (!Number.isFinite(d) || d === 0) return 0n;
  const neg = d < 0;
  let a = Math.abs(d);
  const e = Math.floor(Math.log2(a));
  const m = a / 2 ** e; // [1, 2)
  const mi = BigInt(Math.round(m * 2 ** 52));
  const s = shift + e - 52;
  const r = s >= 0 ? mi << BigInt(s) : mi >> BigInt(-s);
  return neg ? -r : r;
}

/** Approximate a fixed-point BigInt as a double (for HUD / shallow fallback). */
export function toDouble(b, shift) {
  const neg = b < 0n;
  let a = neg ? -b : b;
  const bits = a.toString(2).length;
  if (bits <= 53) {
    const v = Number(a) / 2 ** shift;
    return neg ? -v : v;
  }
  const drop = bits - 53;
  const v = Number(a >> BigInt(drop)) * 2 ** (drop - shift);
  return neg ? -v : v;
}

export function makeCenter(x, y, logZoom) {
  const shift = requiredShift(logZoom);
  return { x: toFixed(x, shift), y: toFixed(y, shift), shift };
}

export function rescaleCenter(c, newShift) {
  if (newShift === c.shift) return c;
  const d = BigInt(newShift - c.shift);
  return newShift > c.shift
    ? { x: c.x << d, y: c.y << d, shift: newShift }
    : { x: c.x >> -d, y: c.y >> -d, shift: newShift };
}

/** center + (dx, dy) where dx/dy are (possibly tiny) doubles. */
export function offsetCenter(c, dx, dy) {
  return {
    x: c.x + toFixed(dx, c.shift),
    y: c.y + toFixed(dy, c.shift),
    shift: c.shift,
  };
}

/**
 * Reference orbit at `center`, iterated in fixed-point.
 * Returns Z_0..Z_{len-1} as interleaved Float32 (Z_0 = 0).
 */
export function computeReference(center, maxIter) {
  const S = BigInt(center.shift);
  const bailout = 16n << S; // |Z|^2 > 16 → escaped
  const inv = 1 / 2 ** center.shift;
  const orbit = new Float32Array(maxIter * 2);
  let zx = 0n;
  let zy = 0n;
  let len = 0;
  let escaped = false;
  for (let i = 0; i < maxIter; i++) {
    orbit[2 * i] = Number(zx) * inv;
    orbit[2 * i + 1] = Number(zy) * inv;
    len = i + 1;
    const zx2 = (zx * zx) >> S;
    const zy2 = (zy * zy) >> S;
    if (zx2 + zy2 > bailout) {
      escaped = true;
      break;
    }
    const nzx = zx2 - zy2 + center.x;
    zy = ((zx * zy) >> (S - 1n)) + center.y;
    zx = nzx;
  }
  return { orbit, len, escaped };
}

/**
 * Smooth escape count of the point at `center + (dcx, dcy)` using the
 * reference orbit (CPU perturbation with rebasing). Returns -1 for
 * "did not escape within maxIter" (interior at this budget).
 */
export function escapeCount(dcx, dcy, orbit, refLen, maxIter) {
  let dx = 0;
  let dy = 0;
  let m = 0;
  for (let i = 0; i < maxIter; i++) {
    const Zx = orbit[2 * m];
    const Zy = orbit[2 * m + 1];
    const zx = Zx + dx;
    const zy = Zy + dy;
    const z2 = zx * zx + zy * zy;
    if (z2 > 65536) {
      return i - Math.log2(Math.log2(Math.max(Math.sqrt(z2), 1.0001))) + 4;
    }
    let rZx = Zx;
    let rZy = Zy;
    if (z2 < dx * dx + dy * dy || m >= refLen - 1) {
      dx = zx;
      dy = zy;
      m = 0;
      rZx = 0;
      rZy = 0;
    }
    const ndx = 2 * (rZx * dx - rZy * dy) + (dx * dx - dy * dy) + dcx;
    const ndy = 2 * (rZx * dy + rZy * dx) + 2 * dx * dy + dcy;
    dx = ndx;
    dy = ndy;
    m++;
  }
  return -1;
}

/**
 * Find where to steer so the dive stays glued to the boundary forever:
 * probe a small ring of candidates around the current center and pick the
 * one with the highest finite escape count (deepest structure that is still
 * resolvable at the current iteration budget). Ties lean toward the user's
 * aim direction. Returns an absolute {dx, dy} offset (doubles, O(span)).
 */
export function steerOffset(orbit, refLen, span, maxIter, aimX, aimY) {
  let bestScore = -Infinity;
  let bestDx = 0;
  let bestDy = 0;
  const centerScore = escapeCount(0, 0, orbit, refLen, maxIter);
  if (centerScore > 0) {
    bestScore = centerScore + 6; // mild inertia: keep course unless clearly better
  }
  const probeRing = (r, count) => {
    let found = false;
    for (let k = 0; k < count; k++) {
      const ang = ((k + 0.5 * (r * 10)) / count) * Math.PI * 2;
      const ux = Math.cos(ang);
      const uy = Math.sin(ang);
      const dcx = ux * r * span;
      const dcy = uy * r * span;
      const s = escapeCount(dcx, dcy, orbit, refLen, maxIter);
      if (s < 0) continue; // interior at this budget — unresolvable, skip
      found = true;
      const aimBias = 3 * (ux * aimX + uy * aimY);
      const score = s + aimBias;
      if (score > bestScore) {
        bestScore = score;
        bestDx = dcx;
        bestDy = dcy;
      }
    }
    return found;
  };
  for (const r of [0.18, 0.42]) probeRing(r, 8);
  // Boundary lost (e.g. after a fast pinch): widen the search outward.
  if (!Number.isFinite(bestScore)) {
    for (const r of [1.0, 2.2, 4.5]) {
      if (probeRing(r, 12)) break;
    }
  }
  return { dx: bestDx, dy: bestDy, score: bestScore, centerOk: centerScore > 0 };
}
