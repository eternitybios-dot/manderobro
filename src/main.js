import { createWebGLRenderer } from "./webglRenderer.js";
import { createCanvasRenderer } from "./canvasRenderer.js";

/**
 * Dive landmarks. Auto-zoom ONLY moves inward.
 * When precision would mosaic, we fade → snap to the next site → fade in,
 * never animating a zoom-out.
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
  { x: -0.374978534, y: 0.659846321 },
  { x: -1.25066, y: 0.02012 },
  { x: 0.001643721971153, y: -0.822467633298876 },
];

const INITIAL_SCALE = 1.8;
/** After a fade snap, resume here — still sharp, long dive ahead. */
const RELAY_SCALE = 0.06;
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
const fadeVeil = document.getElementById("fadeVeil");

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

  const host = canvas.parentElement;
  const fresh = document.createElement("canvas");
  fresh.id = "gl";
  fresh.setAttribute("aria-label", "マンデルブロ集合");
  host.replaceChild(fresh, canvas);
  canvas = fresh;
  return createCanvasRenderer(canvas);
}

const renderer = createRenderer();
const MIN_SCALE = renderer.minScale || 8e-5;

const state = {
  centerX: DIVE_SITES[0].x,
  centerY: DIVE_SITES[0].y,
  scale: INITIAL_SCALE,
  siteIndex: 0,
  auto: true,
  speedNorm: 0.45,
  palette: 0,
  zoomCarry: 1,
  pointerIds: new Map(),
  pinchStartDist: 0,
  pinchStartScale: 1,
  dragStart: null,
  needsRender: true,
  /**
   * fade: null | { phase: 'out'|'in', t: 0..1 }
   * During fade-out we keep zooming in. On peak black we snap. Then fade-in.
   */
  fade: null,
  relayCount: 0,
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
    return Math.min(220, Math.floor(100 + 28 * Math.log2(zoom + 1)));
  }
  // Keep boundaries smooth before we hand off to the next dive
  return Math.min(720, Math.floor(220 + 48 * Math.log2(zoom + 1)));
}

function zoomRateFromSlider(norm) {
  if (norm <= 0.001) return 0;
  const t = Math.pow(norm, 1.15);
  return 0.18 + t * 2.6;
}

function formatSpeed(norm) {
  if (norm <= 0.001) return "停止";
  const mult = zoomRateFromSlider(norm) / zoomRateFromSlider(0.45);
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

function setFadeOpacity(a) {
  fadeVeil.style.opacity = String(Math.max(0, Math.min(1, a)));
}

/** Snap to next site in one frame — scale may jump, but we never animate zoom-out. */
function snapToNextSite() {
  const prevScale = state.scale;
  state.zoomCarry *= RELAY_SCALE / Math.max(prevScale, 1e-30);
  state.siteIndex = (state.siteIndex + 1) % DIVE_SITES.length;
  const site = DIVE_SITES[state.siteIndex];
  state.centerX = site.x;
  state.centerY = site.y;
  state.scale = RELAY_SCALE;
  state.relayCount += 1;
  state.needsRender = true;
}

function beginFadeRelay() {
  if (state.fade) return;
  state.fade = { phase: "out", t: 0 };
}

function resetView() {
  state.siteIndex = 0;
  state.centerX = DIVE_SITES[0].x;
  state.centerY = DIVE_SITES[0].y;
  state.scale = INITIAL_SCALE;
  state.zoomCarry = 1;
  state.fade = null;
  state.relayCount = 0;
  setFadeOpacity(0);
  setAuto(true);
  if (state.speedNorm <= 0) state.speedNorm = 0.45;
  updateSpeedUI();
  state.needsRender = true;
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
  if (state.fade) return;
  const before = screenToComplex(clientX, clientY);
  const next = state.scale * factor;
  if (next <= MIN_SCALE) {
    beginFadeRelay();
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
          Math.max(MIN_SCALE * 1.05, state.pinchStartScale * (state.pinchStartDist / Math.max(dist, 1)))
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
    if (state.speedNorm <= 0) state.speedNorm = 0.45;
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
setFadeOpacity(0);

/** Test/debug hook — used by verification script */
window.__SHINSO__ = {
  getState: () => ({
    scale: state.scale,
    zoom: effectiveZoom(),
    siteIndex: state.siteIndex,
    relayCount: state.relayCount,
    auto: state.auto,
    fading: !!state.fade,
    fadePhase: state.fade?.phase ?? null,
    centerX: state.centerX,
    centerY: state.centerY,
    renderer: renderer.kind,
    minScale: MIN_SCALE,
  }),
  setSpeed: (n) => {
    state.speedNorm = Math.max(0, Math.min(1, n));
    updateSpeedUI();
    if (state.speedNorm > 0) setAuto(true);
  },
  reset: resetView,
};

console.info("[深層] renderer:", renderer.kind, "minScale:", MIN_SCALE);

let lastT = performance.now();
let hudAcc = 0;

function diveIn(dt) {
  const rate = zoomRateFromSlider(state.speedNorm);
  if (rate <= 0) return;
  state.scale *= Math.exp(-rate * dt);
  // Very gentle keep-on-target — too strong feels like sliding
  const site = DIVE_SITES[state.siteIndex];
  const pull = 1 - Math.exp(-0.12 * dt);
  state.centerX += (site.x - state.centerX) * pull;
  state.centerY += (site.y - state.centerY) * pull;
  state.needsRender = true;
}

function tick(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (state.fade) {
    // Fade timing: ~0.35s out, snap, ~0.45s in
    const speed = state.fade.phase === "out" ? 2.8 : 2.2;
    state.fade.t += dt * speed;

    if (state.fade.phase === "out") {
      // Keep diving while fading to black — motion never reverses
      if (state.auto) diveIn(dt);
      setFadeOpacity(Math.min(1, state.fade.t));
      if (state.fade.t >= 1) {
        snapToNextSite();
        state.fade = { phase: "in", t: 0 };
        setFadeOpacity(1);
      }
    } else {
      setFadeOpacity(1 - Math.min(1, state.fade.t));
      if (state.auto) diveIn(dt);
      if (state.fade.t >= 1) {
        state.fade = null;
        setFadeOpacity(0);
      }
    }
  } else if (state.auto) {
    diveIn(dt);
    if (state.scale <= MIN_SCALE) {
      beginFadeRelay();
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

  if (state.needsRender || state.auto || state.fade) {
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
