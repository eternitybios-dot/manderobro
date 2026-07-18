/**
 * Continuous-dive verification. Unlike the old script (which only watched a
 * numeric counter go up), this one checks the PICTURE:
 *
 *  A. zoom coherence (frozen): after zooming exactly 2× at a fixed center,
 *     the frame must equal the magnified center half of the previous frame —
 *     probed across the old fake-handoff band (logZoom 9.5–12.3)
 *  B. natural dive: let the app auto-dive for a minute and verify every
 *     consecutive frame pair is related by the MEASURED zoom/pan warp
 *     (a cut or crossfade cannot pass), frames keep real structure, the
 *     dive deepens monotonically, and the center never teleports
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const URL = process.env.APP_URL || "http://127.0.0.1:4173/";
const OUT = process.env.OUT_DIR || "artifacts/verify";
const CHROME =
  process.env.CHROME_PATH ||
  ["/opt/pw-browsers/chromium", "/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(
    (p) => fs.existsSync(p)
  );

fs.mkdirSync(OUT, { recursive: true });
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------- image helpers ----------
function stats(luma) {
  const n = luma.length;
  let sum = 0;
  for (const v of luma) sum += v;
  const mean = sum / n;
  let varSum = 0;
  for (const v of luma) varSum += (v - mean) * (v - mean);
  return { mean, std: Math.sqrt(varSum / n) };
}

function corr(a, b) {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  return sab / Math.max(1e-9, Math.sqrt(saa * sbb));
}

function sampleFrame(f, nx, ny) {
  const x = Math.min(f.w - 1.001, Math.max(0, nx * f.w - 0.5));
  const y = Math.min(f.h - 1.001, Math.max(0, ny * f.h - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (xx, yy) => f.luma[yy * f.w + xx];
  return (
    at(x0, y0) * (1 - fx) * (1 - fy) +
    at(x0 + 1, y0) * fx * (1 - fy) +
    at(x0, y0 + 1) * (1 - fx) * fy +
    at(x0 + 1, y0 + 1) * fx * fy
  );
}

/**
 * Correlation between frame f2 and frame f1 warped by the measured
 * zoom ratio + center shift the app reports for each frame. Returns null
 * when the frames are too far apart in scale to compare.
 */
function warpedCorr(f1, f2, aspect) {
  const k = f2.span / f1.span;
  if (k < 0.3 || k > 1 / 0.3) return null;
  const shiftX = (f2.cx - f1.cx) / (2 * aspect * f1.span);
  const shiftY = (f2.cy - f1.cy) / (2 * f1.span);
  const build = (sy) => {
    const pred = new Array(f2.w * f2.h);
    for (let gy = 0; gy < f2.h; gy++) {
      for (let gx = 0; gx < f2.w; gx++) {
        const n2x = (gx + 0.5) / f2.w;
        const n2y = (gy + 0.5) / f2.h;
        const n1x = 0.5 + (n2x - 0.5) * k + shiftX;
        const n1y = 0.5 + (n2y - 0.5) * k + sy * shiftY;
        pred[gy * f2.w + gx] = sampleFrame(f1, n1x, n1y);
      }
    }
    return corr(pred, f2.luma);
  };
  // luma-grid y orientation differs per renderer; accept either sign
  return Math.max(build(1), build(-1));
}

// ---------- browser ----------
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
  ],
});

const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
page.setDefaultTimeout(60000);
const jsErrors = [];
page.on("pageerror", (e) => jsErrors.push(String(e.message || e)));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__SHINSO__ && window.__SHINSO__.getState);
await page.evaluate(() => window.__SHINSO__.reset());
await page.waitForTimeout(150);

const boot = await page.evaluate(() => window.__SHINSO__.getState());
console.log("boot renderer=", boot.renderer, "maxLogZoom=", boot.maxLogZoom);
await page.screenshot({ path: path.join(OUT, "00-start.png") });
await page.evaluate(() => window.__SHINSO__.chooseTargetAt(220, 380));

const maxLz = boot.maxLogZoom || 8.5;
const aspect = 390 / 844;
const LN2 = Math.log(2);

// ---- A. frozen zoom-coherence across the old fake-handoff band ------------
const frozenDepths = [3, 9.5, 11, 12.5].filter((d) => d <= maxLz - 1);
await page.evaluate(() => {
  window.__SHINSO__.pause();
  if (window.__SHINSO__.lockScale) window.__SHINSO__.lockScale(0.6);
});

for (const d of frozenDepths) {
  await page.evaluate((lz) => window.__SHINSO__.setLogZoom(lz), d);
  await page.waitForTimeout(800);
  const f1 = await page.evaluate(() => window.__SHINSO__.frameLuma(48, 64));
  await page.evaluate((lz) => window.__SHINSO__.setLogZoom(lz), d + LN2);
  await page.waitForTimeout(800);
  const f2 = await page.evaluate(() => window.__SHINSO__.frameLuma(48, 64));
  assert(f1 && f2, `no frame capture at lz=${d}`);
  const s1 = stats(f1.luma);
  const s2 = stats(f2.luma);
  const coh = warpedCorr(f1, f2, aspect);
  console.log(
    `frozen lz=${d}: std=${s1.std.toFixed(1)}/${s2.std.toFixed(1)} zoom-coherence=${coh?.toFixed(3)}`
  );
  assert(
    s1.std > 6 && s2.std > 6,
    `frame at lz=${d} has no structure (std=${s1.std.toFixed(2)}/${s2.std.toFixed(2)})`
  );
  assert(
    coh !== null && coh > 0.45,
    `zoom incoherence at lz=${d} (corr=${coh?.toFixed(3)}) — ×2 deeper frame is NOT the magnified center of the previous frame (scene cut / fake zoom)`
  );
  await page.screenshot({ path: path.join(OUT, `frozen-${String(d).replace(".", "_")}.png`) });
}

// ---- B. natural dive: real behavior, one unbroken shot --------------------
await page.evaluate(() => {
  window.__SHINSO__.setLogZoom(3);
  window.__SHINSO__.setSpeed(0.6);
});
const DIVE_MS = 60000;
const samples = [];
const t0 = Date.now();
let shotTaken = false;
while (Date.now() - t0 < DIVE_MS) {
  const s = await page.evaluate(() => ({
    state: window.__SHINSO__.getState(),
    frame: window.__SHINSO__.frameLuma(40, 60),
  }));
  samples.push({ t: Date.now() - t0, ...s.state, frame: s.frame });
  if (!shotTaken && s.state.logZoom > 15) {
    shotTaken = true;
    await page.screenshot({ path: path.join(OUT, "dive-deep.png") });
  }
  await page.waitForTimeout(700);
}
await page.screenshot({ path: path.join(OUT, "dive-final.png") });
fs.writeFileSync(
  path.join(OUT, "samples.json"),
  JSON.stringify(samples.map(({ frame, ...rest }) => rest), null, 2)
);

assert(jsErrors.length === 0, `JS errors: ${jsErrors.join(" | ")}`);
assert(samples.length > 12, `too few samples (${samples.length})`);

// dive keeps deepening while dir=+1, center never teleports
for (let i = 1; i < samples.length; i++) {
  const prev = samples[i - 1];
  const cur = samples[i];
  if (prev.dir === 1 && cur.dir === 1) {
    assert(cur.logZoom + 1e-6 >= prev.logZoom, "logZoom decreased while diving");
  }
}
const last = samples[samples.length - 1];
const deepest = Math.max(...samples.map((s) => s.logZoom));
assert(deepest > 18, `dive should go deep (max logZoom=${deepest.toFixed(2)})`);
const centerDrift = Math.hypot(last.centerX - boot.centerX, last.centerY - boot.centerY);
assert(centerDrift < 0.5, `center jumped too far (${centerDrift}) — looks like a scene cut`);

// every consecutive rendered-frame pair must be the same scene warped
let checked = 0;
let blankFrames = 0;
for (let i = 1; i < samples.length; i++) {
  const f1 = samples[i - 1].frame;
  const f2 = samples[i].frame;
  if (!f1 || !f2 || !f1.span || !f2.span) continue;
  if (stats(f2.luma).std < 6) {
    blankFrames++;
    continue;
  }
  if (f2.span === f1.span && f2.cx === f1.cx) continue; // no new render between samples
  const wc = warpedCorr(f1, f2, aspect);
  if (wc === null) continue; // >×3.3 apart (very slow env frame) — cannot compare
  checked++;
  assert(
    wc > 0.5,
    `discontinuity at t=${samples[i].t}ms lz=${samples[i].logZoom.toFixed(2)} (warped-corr=${wc.toFixed(3)})`
  );
}
console.log(
  `dive OK: deepest logZoom=${deepest.toFixed(2)}, warp-checked pairs=${checked}, blank frames=${blankFrames}/${samples.length}`
);
assert(checked >= 10, `too few comparable frame pairs (${checked})`);
assert(blankFrames <= 2, `too many structureless frames (${blankFrames})`);

assert(jsErrors.length === 0, `JS errors: ${jsErrors.join(" | ")}`);
console.log("VERIFY_OK renderer=", boot.renderer, "maxLogZoom=", maxLz);

await browser.close();
process.exit(0);
