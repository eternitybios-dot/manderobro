/**
 * Inline the vite build into one self-contained HTML file at site/index.html
 * so the app can be served from a raw file CDN (githack) with zero
 * asset-path or MIME concerns. Run `npm run build` first.
 */
import fs from "node:fs";
import path from "node:path";

const DIST = "dist";
const OUT_DIR = "site";

let html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");

html = html.replace(
  /<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/g,
  (_, src) => `<script type="module">\n${fs.readFileSync(path.join(DIST, src), "utf8")}\n</script>`
);

html = html.replace(
  /<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/g,
  (_, href) => `<style>\n${fs.readFileSync(path.join(DIST, href), "utf8")}\n</style>`
);

// modulepreload hints point at files we just inlined
html = html.replace(/<link rel="modulepreload"[^>]*>/g, "");

if (/(src|href)="\.\/assets\//.test(html)) {
  throw new Error("un-inlined asset reference remains in site/index.html");
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "index.html"), html);
for (const extra of ["manifest.webmanifest"]) {
  const p = path.join(DIST, extra);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(OUT_DIR, extra));
}
console.log(
  "site/index.html written:",
  (fs.statSync(path.join(OUT_DIR, "index.html")).size / 1024).toFixed(1),
  "kB"
);
