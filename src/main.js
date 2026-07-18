import { createWebGLRenderer } from "./webglRenderer.js";
import { createCanvasRenderer } from "./canvasRenderer.js";

/**
 * Deep dive landmarks. We never pull back to the big overview during auto-zoom —
 * when precision runs out we relay into the next site mid-dive so zoom never ends.
 */
const DIVE_SITES = [
  { x: -0.7436438870371587, y: 0.13182590420531197 },
  { x: -0.7487663670389055, y: 0.06574877392439881 },
  { x: -0.77568377, y: 0.13646737 },
  { x: -1.768778833, y: -0.001738827 },
  { x: -0.16070135, y: 1.0375665 },
  { x: -0.5622799008959947, y: 0.6428147914776039 },
  { x: 0.28171792161596434, y: 0.5771052841488505 },
  { x: -0.745428, y: 0.113009 },
  { x: -0.235125, y: 0.827215 },
  { x: -0.10109636384562, y: 0.95628651080914 },
  { x: -0.81159812898999, y: 0.18969156891408 },
  { x: -1.7497229303, y: 0.00000000000029 },
];

const INITIAL_SCALE = 2.5;
/** After a precision relay, resume mid-dive (still looks deep, not a reset). */
const RELAY_SCALE = 1.5e-3;
const MAX_SCALE = 3.5;

const zoomLabel = document.getElementById("zoomLabel");
const iterLabel = document.getElementById("iterLabel");
const speedLabel = document.getElementById("speedLabel");
const speedSlider = document.getElementById("speedSlider");
const autoBtn = document.getElementById("autoBtn");
const autoIcon = document.getElementById("autoIcon");
const autoLabel = document.getElementById("autoLabel");
const resetBtn = document.getElementById("resetBtn");
const paletteBtn = document.getElementById("paletteBtn");
const paletteCtlBtn = document.getElementById("paletteCtlBtn");
const swatch = document.getElementById("swatch");
const appEl = document.getElementById("app");

let canvas = document.getElementById("gl");

function createRenderer() {
  try {
    const webgl = createWebGLRenderer(canvas);
    if (webgl && webgl.kind !== "failed") {
      canvas = webgl.canvas || canvas;
      return webgl;
    }
    if (webgl && webgl.canvas) canvas = webgl.canvas;
  } catch (err) {
    console.warn(err);
  }

  if (canvas.getContext) {
    const host = canvas.parentElement;
    const fresh = document.createElement("canvas");
    fresh.id = "gl";
    fresh.setAttribute("aria-label", "マンデルブロ集合");
    host.replaceChild(fresh, canvas);
    canvas = fresh;
  }
  return createCanvasRenderer(canvas);
}

const renderer = createRenderer();

/** How deep we can go before GPU/CPU precision fails. */
const MIN_SCALE = renderer.kind === "canvas2d" ? 1e-15 : 2e-13;

const state = {
  centerX: DIVE_SITES[0].x,
  centerY: DIVE_SITES[0].y,
  scale: INITIAL_SCALE,
  siteIndex: 0,
  auto: true,
  speedNorm: 0.55,
  palette: 0,
  /** Multiplier so ZOOM HUD keeps growing across infinite relays. */
  zoomCarry: 1,
  pointerIds: new Map(),
  pinchStartDist: 0,
  pinchStartScale: 1,
  dragStart: null,
  needsRender: true,
  warpFlash: 0,
};

function effectiveZoom() {
  return state.zoomCarry * (INITIAL_SCALE / Math.max(state.scale, 1e-30));
}

function formatZoom() {
  const z = effectiveZoom();
  if (z < 1000) return `×${z.toFixed(z < 10 ? 1 : 0)}`;
  if (z < 1e6) return `×${(z / 1e3).toFixed(1)}K`;
  if (z < 1e9) return `×${(z / 1e6).toFixed(1)}M`;
  if (z < 1e12) return `×${(z / 1e9).toFixed(1)}B`;
  if (z < 1e15) return `×${(z / 1e12).toFixed(1)}T`;
  return `×10^${Math.log10(z).toFixed(1)}`;
}

function iterationBudget(scale) {
  const zoom = Math.max(1, INITIAL_SCALE / scale);
  if (renderer.kind === "canvas2d") {
    return Math.min(220, Math.floor(70 + 20 * Math.log2(zoom + 1)));
  }
  // Deep double-float needs more iterations as we dive
  return Math.min(1400, Math.floor(140 + 42 * Math.log2(zoom + 1)));
}

function zoomRateFromSlider(norm) {
  if (norm <= 0.001) return 0;
  const t = Math.pow(norm, 1.2);
  return 0.2 + t * 3.2;
}

function formatSpeed(norm) {
  if (norm <= 0.001) return "停止";
  const mult = zoomRateFromSlider(norm) / zoomRateFromSlider(0.55);
  return `×${mult.toFixed(1)}`;
}

function updateSpeedUI() {
  speedLabel.textContent = formatSpeed(state.speedNorm);
  speedSlider.value = String(Math.round(state.speedNorm * 100));
}

function setAuto(on) {
  state.auto = on;
  autoBtn.setAttribute("aria-pressed", on ? "true" : "false");
  autoIcon.textContent = on ? "◈" : "▷";
  autoLabel.textContent = on ? "自動拡大" : "再開";
}

function cyclePalette() {
  state.palette = (state.palette + 1) % 4;
  const hues = [
    "conic-gradient(from 120deg, #3de0c5, #f0b45a, #ff6b5a, #3de0c5)",
    "conic-gradient(from 40deg, #ff6b5a, #f0b45a, #ffe08a, #ff6b5a)",
    "conic-gradient(from 200deg, #1bb8a0, #7dffd4, #3de0c5, #1bb8a0)",
    "conic-gradient(from 90deg, #f0b45a, #fff1c9, #ff8a5b, #f0b45a)",
  ];
  swatch.style.background = hues[state.palette];
  state.needsRender = true;
}

/** Keep diving forever: hop to next landmark mid-zoom, never pull out to overview. */
function relayDive() {
  const prevScale = state.scale;
  // Keep the ZOOM counter continuous across the hop
  state.zoomCarry *= RELAY_SCALE / Math.max(prevScale, 1e-30);

  state.siteIndex = (state.siteIndex + 1) % DIVE_SITES.length;
  const site = DIVE_SITES[state.siteIndex];
  state.centerX = site.x;
  state.centerY = site.y;
  state.scale = RELAY_SCALE;
  state.warpFlash = 0.35;
  state.needsRender = true;

  appEl.classList.remove("warp");
  void appEl.offsetWidth; // reflow so animation retriggers
  appEl.classList.add("warp");
}

function resetView() {
  state.siteIndex = 0;
  state.centerX = DIVE_SITES[0].x;
  state.centerY = DIVE_SITES[0].y;
  state.scale = INITIAL_SCALE;
  state.zoomCarry = 1;
  state.warpFlash = 0;
  setAuto(true);
  if (state.speedNorm <= 0) state.speedNorm = 0.55;
  updateSpeedUI();
  state.needsRender = true;
  appEl.classList.remove("warp");
}

function screenToComplex(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
  const aspect = canvas.width / Math.max(1, canvas.height);
  return {
    x: state.centerX + nx * aspect * state.scale,
    y: state.centerY + ny * state.scale,
  };
}

function zoomAt(clientX, clientY, factor) {
  const before = screenToComplex(clientX, clientY);
  let next = state.scale * factor;
  if (next < MIN_SCALE) {
    relayDive();
    return;
  }
  state.scale = Math.min(MAX_SCALE, next);
  const after = screenToComplex(clientX, clientY);
  state.centerX += before.x - after.x;
  state.centerY += before.y - after.y;
  state.needsRender = true;
}

function pointerDistance() {
  const pts = [...state.pointerIds.values()];
  if (pts.length < 2) return 0;
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

function bindPointer(target) {
  target.addEventListener(
    "pointerdown",
    (e) => {
      target.setPointerCapture(e.pointerId);
      state.pointerIds.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (state.pointerIds.size === 1) {
        state.dragStart = {
          x: e.clientX,
          y: e.clientY,
          cx: state.centerX,
          cy: state.centerY,
        };
      } else if (state.pointerIds.size === 2) {
        state.pinchStartDist = pointerDistance();
        state.pinchStartScale = state.scale;
        state.dragStart = null;
      }
    },
    { passive: true }
  );

  target.addEventListener(
    "pointermove",
    (e) => {
      if (!state.pointerIds.has(e.pointerId)) return;
      state.pointerIds.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (state.pointerIds.size === 2 && state.pinchStartDist > 0) {
        const dist = pointerDistance();
        const pts = [...state.pointerIds.values()];
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const targetScale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE * 1.01, state.pinchStartScale * (state.pinchStartDist / Math.max(dist, 1)))
        );
        zoomAt(midX, midY, targetScale / state.scale);
      } else if (state.dragStart && state.pointerIds.size === 1) {
        const rect = canvas.getBoundingClientRect();
        const dx = ((e.clientX - state.dragStart.x) / rect.width) * 2;
        const dy = -(((e.clientY - state.dragStart.y) / rect.height) * 2);
        const aspect = canvas.width / Math.max(1, canvas.height);
        state.centerX = state.dragStart.cx - dx * aspect * state.scale;
        state.centerY = state.dragStart.cy - dy * state.scale;
        state.needsRender = true;
      }
    },
    { passive: true }
  );

  const endPointer = (e) => {
    state.pointerIds.delete(e.pointerId);
    if (state.pointerIds.size < 2) state.pinchStartDist = 0;
    if (state.pointerIds.size === 0) state.dragStart = null;
  };
  target.addEventListener("pointerup", endPointer);
  target.addEventListener("pointercancel", endPointer);
  target.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0015));
    },
    { passive: false }
  );
}

bindPointer(canvas);

speedSlider.addEventListener("input", () => {
  state.speedNorm = Number(speedSlider.value) / 100;
  updateSpeedUI();
  if (state.speedNorm > 0 && !state.auto) setAuto(true);
});

autoBtn.addEventListener("click", () => {
  if (state.auto) {
    setAuto(false);
    state.speedNorm = 0;
  } else {
    setAuto(true);
    if (state.speedNorm <= 0) state.speedNorm = 0.55;
  }
  updateSpeedUI();
});

resetBtn.addEventListener("click", resetView);
paletteBtn.addEventListener("click", cyclePalette);
paletteCtlBtn.addEventListener("click", cyclePalette);

window.addEventListener("resize", () => {
  renderer.resize();
  state.needsRender = true;
});

renderer.resize();
updateSpeedUI();
setAuto(true);
console.info("[深層] renderer:", renderer.kind, "minScale:", MIN_SCALE);

let lastT = performance.now();
let hudAcc = 0;

function tick(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (state.warpFlash > 0) {
    state.warpFlash = Math.max(0, state.warpFlash - dt);
  }

  if (state.auto) {
    const rate = zoomRateFromSlider(state.speedNorm);
    if (rate > 0) {
      state.scale *= Math.exp(-rate * dt);

      // Keep the landmark centered while diving
      const site = DIVE_SITES[state.siteIndex];
      const pull = 1 - Math.exp(-0.45 * dt);
      state.centerX += (site.x - state.centerX) * pull;
      state.centerY += (site.y - state.centerY) * pull;
      state.needsRender = true;

      // Eternal: relay into the next abyss instead of stopping / resetting
      if (state.scale <= MIN_SCALE) {
        relayDive();
      }
    }
  }

  if (renderer.resize()) state.needsRender = true;

  const iters = iterationBudget(state.scale);
  hudAcc += dt;
  if (hudAcc > 0.1) {
    hudAcc = 0;
    zoomLabel.textContent = formatZoom();
    iterLabel.textContent = String(iters);
  }

  if (state.needsRender || state.auto) {
    try {
      renderer.render({
        centerX: state.centerX,
        centerY: state.centerY,
        scale: state.scale,
        iters,
        time: now * 0.001,
        palette: state.palette,
      });
    } catch (err) {
      console.error("render failed", err);
    }
    state.needsRender = false;
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
