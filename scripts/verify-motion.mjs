/**
 * Motion verification for 深層.
 * Fails if auto-zoom reverses (animated zoom-out) or effective zoom stalls.
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

// Clean baseline
await page.evaluate(() => {
  window.__SHINSO__.reset();
  window.__SHINSO__.setSpeed(1);
});
await new Promise((r) => setTimeout(r, 100));

const boot = await page.evaluate(() => window.__SHINSO__.getState());
console.log("boot", boot);
assert(boot.auto === true, "auto should start on");
assert(boot.relayCount === 0, "relayCount should be 0 after reset");
assert(boot.scale > 0.5, `scale should start wide, got ${boot.scale}`);

await page.screenshot({ path: path.join(OUT, "00-start.png") });

const samples = [];
const durationMs = 14000;
const stepMs = 200;
const t0 = Date.now();

while (Date.now() - t0 < durationMs) {
  const s = await page.evaluate(() => window.__SHINSO__.getState());
  samples.push({ t: Date.now() - t0, ...s });
  if (samples.length === 10) {
    await page.screenshot({ path: path.join(OUT, "01-early.png") });
  }
  await new Promise((r) => setTimeout(r, stepMs));
}

await page.screenshot({ path: path.join(OUT, "02-final.png") });
fs.writeFileSync(path.join(OUT, "samples.json"), JSON.stringify(samples, null, 2));

assert(samples.length > 20, "too few samples");
assert(jsErrors.length === 0, `JS errors: ${jsErrors.join(" | ")}`);

// Effective zoom must be non-decreasing
for (let i = 1; i < samples.length; i++) {
  const prev = samples[i - 1];
  const cur = samples[i];
  assert(
    cur.zoom + 1e-3 >= prev.zoom,
    `effective zoom decreased at t=${cur.t}: ${prev.zoom} -> ${cur.zoom}`
  );
}

// Scale may jump UP only when relayCount increases (instant snap under fade)
for (let i = 1; i < samples.length; i++) {
  const prev = samples[i - 1];
  const cur = samples[i];
  if (cur.scale > prev.scale * 1.002) {
    assert(
      cur.relayCount > prev.relayCount,
      `animated/illegal zoom-out at t=${cur.t}: scale ${prev.scale} -> ${cur.scale}, relay ${prev.relayCount}->${cur.relayCount}`
    );
  }
}

const first = samples[0];
const last = samples[samples.length - 1];
assert(last.zoom > first.zoom * 8, `zoom barely moved: ${first.zoom} -> ${last.zoom}`);
assert(last.relayCount >= 1, `expected at least one relay, got ${last.relayCount}`);

// Between relays, while not in the sample that snaps, scale should trend down
let bad = null;
for (let i = 1; i < samples.length; i++) {
  const prev = samples[i - 1];
  const cur = samples[i];
  if (cur.relayCount !== prev.relayCount) continue; // snap frame
  if (cur.scale > prev.scale * 1.002) {
    bad = { prev, cur };
    break;
  }
}
assert(!bad, `scale increased without relay: ${JSON.stringify(bad)}`);

console.log(
  "VERIFY_OK",
  "renderer=",
  boot.renderer,
  "relays=",
  last.relayCount,
  "zoom",
  first.zoom.toFixed(1),
  "->",
  last.zoom.toExponential(2)
);

await browser.close();
process.exit(0);
