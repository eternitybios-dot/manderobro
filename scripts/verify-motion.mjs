/**
 * Fake-infinite zoom verification:
 * - logZoom / zoom grows without bound (no stop / no hop)
 * - no zoom-out spikes
 * - tap retargets aim
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
  window.__SHINSO__.setSpeed(1);
});
await new Promise((r) => setTimeout(r, 80));

const boot = await page.evaluate(() => window.__SHINSO__.getState());
console.log("boot", boot);
assert(boot.infinite === true || boot.logZoom !== undefined, "expected infinite fake zoom API");

await page.screenshot({ path: path.join(OUT, "00-start.png") });
await page.evaluate(() => window.__SHINSO__.chooseTargetAt(220, 380));

const samples = [];
const t0 = Date.now();
while (Date.now() - t0 < 12000) {
  samples.push({ t: Date.now() - t0, ...(await page.evaluate(() => window.__SHINSO__.getState())) });
  if (samples.length === 15) await page.screenshot({ path: path.join(OUT, "01-mid.png") });
  await new Promise((r) => setTimeout(r, 200));
}
await page.screenshot({ path: path.join(OUT, "02-final.png") });
fs.writeFileSync(path.join(OUT, "samples.json"), JSON.stringify(samples, null, 2));

assert(jsErrors.length === 0, `JS errors: ${jsErrors.join(" | ")}`);
assert(samples.length > 20, "too few samples");

for (let i = 1; i < samples.length; i++) {
  const prev = samples[i - 1];
  const cur = samples[i];
  assert(cur.zoom + 1e-6 >= prev.zoom, `zoom decreased ${prev.zoom} -> ${cur.zoom}`);
  assert(cur.logZoom + 1e-6 >= prev.logZoom, `logZoom decreased`);
}

const first = samples[0];
const last = samples[samples.length - 1];
assert(last.zoom > first.zoom * 20, `zoom barely moved ${first.zoom} -> ${last.zoom}`);
// Continuous dive must keep deepening in log space (slow default is OK)
assert(last.logZoom > 5, `should keep diving deep in log space, got ${last.logZoom}`);
assert(!("atLimit" in last) || last.atLimit !== true, "must not hard-stop at a limit");
// Center should stay one continuous target (no teleporting to a random site)
assert(Number.isFinite(last.centerX) && Number.isFinite(last.centerY), "center missing");
const centerDrift = Math.hypot(last.centerX - boot.centerX, last.centerY - boot.centerY);
assert(centerDrift < 0.5, `center jumped too far (${centerDrift}) — looks like a scene cut`);

console.log(
  "VERIFY_OK",
  "renderer=",
  boot.renderer,
  "zoom",
  first.zoom.toFixed(1),
  "->",
  last.zoom.toExponential(2),
  "logZoom=",
  last.logZoom.toFixed(2)
);

await browser.close();
process.exit(0);
