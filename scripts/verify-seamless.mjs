/**
 * Seam check: step logZoom in tiny increments through several deep-phase
 * wrap boundaries and assert no frame-to-frame pixel jump. A scene cut
 * would show up as a spike in mean pixel difference.
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const URL = process.env.APP_URL || "http://127.0.0.1:4173/";
const OUT = process.env.OUT_DIR || "/opt/cursor/artifacts/seamless";
const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));

fs.mkdirSync(OUT, { recursive: true });

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
    "--window-size=390,700",
  ],
  defaultViewport: { width: 390, height: 700, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
page.setDefaultTimeout(20000);
await page.goto(URL, { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.__SHINSO__ && window.__SHINSO__.setLogZoom);
await page.evaluate(() => window.__SHINSO__.setSpeed(0));

async function frameAt(lz) {
  await page.evaluate((v) => window.__SHINSO__.setLogZoom(v), lz);
  await new Promise((r) => setTimeout(r, 120));
  const buf = await page.screenshot({ type: "png" });
  return PNG.sync.read(Buffer.from(buf));
}

// Step through deep phase: covers ~4 wrap periods incl. the handoff region.
const START = 8.0;
const END = 15.0;
const STEP = 0.05;

let prev = null;
let worst = { diff: 0, lz: 0 };
const diffs = [];
for (let lz = START; lz <= END + 1e-9; lz += STEP) {
  const img = await frameAt(lz);
  if (prev) {
    const { width, height } = img;
    const out = new PNG({ width, height });
    const changed = pixelmatch(prev.data, img.data, out.data, width, height, {
      threshold: 0.18,
    });
    const frac = changed / (width * height);
    diffs.push({ lz: Number(lz.toFixed(2)), frac: Number(frac.toFixed(4)) });
    if (frac > worst.diff) {
      worst = { diff: frac, lz };
      fs.writeFileSync(path.join(OUT, "worst-prev.png"), PNG.sync.write(prev));
      fs.writeFileSync(path.join(OUT, "worst-cur.png"), PNG.sync.write(img));
      fs.writeFileSync(path.join(OUT, "worst-diff.png"), PNG.sync.write(out));
    }
  }
  prev = img;
}

fs.writeFileSync(path.join(OUT, "diffs.json"), JSON.stringify(diffs, null, 2));
const sorted = [...diffs].sort((a, b) => b.frac - a.frac);
console.log("top-5 frame diffs:", sorted.slice(0, 5));
console.log("median diff:", sorted[Math.floor(sorted.length / 2)].frac);

// Fail when any single 0.05-logZoom step changes a large share of pixels
// beyond normal zoom flow (a cut replaces nearly the whole frame).
const median = sorted[Math.floor(sorted.length / 2)].frac;
const limit = Math.max(0.55, median * 2.2);
if (worst.diff > limit) {
  console.error(`SEAM_FAIL: jump at logZoom=${worst.lz.toFixed(2)} (${(worst.diff * 100).toFixed(1)}% pixels)`);
  await browser.close();
  process.exit(1);
}
console.log(`SEAMLESS_OK worst=${(worst.diff * 100).toFixed(1)}% at logZoom=${worst.lz.toFixed(2)} (limit ${(limit * 100).toFixed(0)}%)`);
await browser.close();
process.exit(0);
