/**
 * Motion verification:
 * - continuous zoom-in only (no animated zoom-out / site hops)
 * - tap can retarget dive location
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const URL = process.env.APP_URL || "http://127.0.0.1:4173/";
const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts/verify";
const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find((p) =>
    fs.existsSync(p)
  );

fs.mkdirSync(OUT, { recursive: true });

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--window-size=390,844",
  ],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2 },
});

const page = await browser.newPage();
page.setDefaultTimeout(20000);
const jsErrors = [];
page.on("pageerror", (e) => jsErrors.push(String(e.message || e)));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__SHINSO__ && window.__SHINSO__.getState);

await page.evaluate(() => {
  window.__SHINSO__.reset();
  window.__SHINSO__.setSpeed(0.85);
});
await new Promise((r) => setTimeout(r, 80));

const boot = await page.evaluate(() => window.__SHINSO__.getState());
console.log("boot", boot);
assert(boot.auto === true, "auto should start on");
assert(Math.abs(boot.centerX + 0.5) < 0.2, "should start near overview");

await page.screenshot({ path: path.join(OUT, "00-start.png") });

// Tap a seahorse-ish screen point to choose dive location
await page.evaluate(() => window.__SHINSO__.chooseTargetAt(260, 420));
await new Promise((r) => setTimeout(r, 100));
const aimed = await page.evaluate(() => window.__SHINSO__.getState());
assert(
  Math.hypot(aimed.targetX - aimed.centerX, aimed.targetY - aimed.centerY) < 3,
  "target should be near visible plane"
);
console.log("aimed", { tx: aimed.targetX, ty: aimed.targetY });

const samples = [];
const durationMs = 10000;
const stepMs = 200;
const t0 = Date.now();
while (Date.now() - t0 < durationMs) {
  samples.push({ t: Date.now() - t0, ...(await page.evaluate(() => window.__SHINSO__.getState())) });
  if (samples.length === 12) await page.screenshot({ path: path.join(OUT, "01-mid.png") });
  await new Promise((r) => setTimeout(r, stepMs));
}
await page.screenshot({ path: path.join(OUT, "02-final.png") });
fs.writeFileSync(path.join(OUT, "samples.json"), JSON.stringify(samples, null, 2));

assert(jsErrors.length === 0, `JS errors: ${jsErrors.join(" | ")}`);
assert(samples.length > 20, "too few samples");

// Zoom must never decrease; scale must never increase (no site hop / pull-out)
for (let i = 1; i < samples.length; i++) {
  const prev = samples[i - 1];
  const cur = samples[i];
  assert(cur.zoom + 1e-3 >= prev.zoom, `zoom decreased ${prev.zoom} -> ${cur.zoom} at t=${cur.t}`);
  assert(
    cur.scale <= prev.scale * 1.002,
    `scale zoomed OUT (illegal switch?) ${prev.scale} -> ${cur.scale} at t=${cur.t}`
  );
}

const first = samples[0];
const last = samples[samples.length - 1];
assert(last.zoom > first.zoom * 30, `zoom barely moved ${first.zoom} -> ${last.zoom}`);

// Center should have moved toward the chosen target over time
const early = samples[3];
const late = samples[samples.length - 1];
const dEarly = Math.hypot(early.centerX - early.targetX, early.centerY - early.targetY);
const dLate = Math.hypot(late.centerX - late.targetX, late.centerY - late.targetY);
assert(dLate <= dEarly + 0.05, `should home toward target: early=${dEarly} late=${dLate}`);

console.log(
  "VERIFY_OK",
  "renderer=",
  boot.renderer,
  "zoom",
  first.zoom.toFixed(1),
  "->",
  last.zoom.toExponential(2),
  "atLimit=",
  last.atLimit
);

await browser.close();
process.exit(0);
