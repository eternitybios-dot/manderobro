import { createWebGLRenderer } from "./webglRenderer.js";
import { createCanvasRenderer } from "./canvasRenderer.js";

/**
 * One continuous dive into a single Mandelbrot view.
 * Before float precision dies, the shader hands off to a connected Julia
 * continuation of the same center — never a random scene cut.
 */

const TAP_SLOP_PX = 12;
const BASE_SPAN = 2.6;
const DEFAULT_CENTER = { x: -0.743643887037151, y: 0.131825904205330 };
const DEFAULT_SPEED = 0.28;

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
const aimEl = document.getElementById("aim");
const limitNote = document.getElementById("limitNote");
const hintEl = document.getElementById("hint");

if (limitNote) limitNote.hidden = true;

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

const state = {
  logZoom: 0.8,
  centerX: DEFAULT_CENTER.x,
  centerY: DEFAULT_CENTER.y,
  aimX: 0.1,
  aimY: 0.2,
  auto: true,
  speedNorm: DEFAULT_SPEED,
  palette: 0,
  pointerIds: new Map(),
  pinchStartDist: 0,
  pinchStartLogZoom: 0,
  dragStart: null,
  tapCandidate: null,
  needsRender: true,
  aimHideTimer: 0,
};

function effectiveZoom() {
  return Math.exp(state.logZoom);
}

function currentSpan() {
  return BASE_SPAN / effectiveZoom();
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

function iterationBudget() {
  const depth = state.logZoom;
  if (renderer.kind === "canvas2d") {
    return Math.min(90, Math.floor(60 + depth * 2));
  }
  return Math.min(200, Math.floor(100 + depth * 4));
}

/** Slow by default — fake continuation needs time to read as continuous. */
function zoomRateFromSlider(norm) {
  if (norm <= 0.001) return 0;
  const t = Math.pow(norm, 1.15);
  // logZoom / sec — default ~0.18, max ~0.85 (verify still reaches deep)
  return 0.05 + t * 0.8;
}

function formatSpeed(norm) {
  if (norm <= 0.001) return "停止";
  const mult = zoomRateFromSlider(norm) / zoomRateFromSlider(DEFAULT_SPEED);
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

function showAim(clientX, clientY) {
  aimEl.style.left = `${clientX}px`;
  aimEl.style.top = `${clientY}px`;
  aimEl.classList.add("show");
  state.aimHideTimer = 1.1;
}

function resetView() {
  state.logZoom = 0.8;
  state.centerX = DEFAULT_CENTER.x;
  state.centerY = DEFAULT_CENTER.y;
  state.aimX = 0.1;
  state.aimY = 0.2;
  setAuto(true);
  if (state.speedNorm <= 0) state.speedNorm = DEFAULT_SPEED;
  updateSpeedUI();
  state.needsRender = true;
  aimEl.classList.remove("show");
  if (hintEl) hintEl.style.display = "";
}

/** Tap steers the single continuous dive toward that screen point. */
function chooseTarget(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
  const aspect = rect.width / Math.max(1, rect.height);
  const span = currentSpan();

  // Move the one center toward the tapped complex point (no scene switch).
  state.centerX += nx * aspect * span * 0.42;
  state.centerY += ny * span * 0.42;
  state.aimX = Math.max(-1, Math.min(1, nx));
  state.aimY = Math.max(-1, Math.min(1, ny));

  showAim(clientX, clientY);
  if (!state.auto) setAuto(true);
  if (state.speedNorm <= 0) {
    state.speedNorm = DEFAULT_SPEED;
    updateSpeedUI();
  }
  state.needsRender = true;
  if (hintEl) hintEl.style.display = "none";
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
          centerX: state.centerX,
          centerY: state.centerY,
          aimX: state.aimX,
          aimY: state.aimY,
          moved: false,
        };
        state.tapCandidate = { x: e.clientX, y: e.clientY };
      } else if (state.pointerIds.size === 2) {
        state.pinchStartDist = pointerDistance();
        state.pinchStartLogZoom = state.logZoom;
        state.dragStart = null;
        state.tapCandidate = null;
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
        const factor = state.pinchStartDist / Math.max(dist, 1);
        state.logZoom = Math.max(0, state.pinchStartLogZoom + Math.log(Math.max(factor, 1e-3)));
        state.needsRender = true;
        state.tapCandidate = null;
      } else if (state.dragStart && state.pointerIds.size === 1) {
        const dx = e.clientX - state.dragStart.x;
        const dy = e.clientY - state.dragStart.y;
        if (Math.hypot(dx, dy) > TAP_SLOP_PX) {
          state.dragStart.moved = true;
          state.tapCandidate = null;
          const rect = canvas.getBoundingClientRect();
          const span = currentSpan();
          const aspect = rect.width / Math.max(1, rect.height);
          state.centerX = state.dragStart.centerX - (dx / rect.width) * 2 * aspect * span;
          state.centerY = state.dragStart.centerY + (dy / rect.height) * 2 * span;
          state.aimX = Math.max(-1, Math.min(1, state.dragStart.aimX - (dx / rect.width) * 1.2));
          state.aimY = Math.max(-1, Math.min(1, state.dragStart.aimY + (dy / rect.height) * 1.2));
          state.needsRender = true;
        }
      }
    },
    { passive: true }
  );

  const endPointer = (e) => {
    const wasTap =
      state.tapCandidate &&
      state.pointerIds.size === 1 &&
      state.dragStart &&
      !state.dragStart.moved &&
      Math.hypot(e.clientX - state.tapCandidate.x, e.clientY - state.tapCandidate.y) <= TAP_SLOP_PX;

    state.pointerIds.delete(e.pointerId);
    if (state.pointerIds.size < 2) state.pinchStartDist = 0;
    if (state.pointerIds.size === 0) {
      if (wasTap) chooseTarget(state.tapCandidate.x, state.tapCandidate.y);
      state.dragStart = null;
      state.tapCandidate = null;
    }
  };
  target.addEventListener("pointerup", endPointer);
  target.addEventListener("pointercancel", endPointer);
  target.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      state.logZoom = Math.max(0, state.logZoom - e.deltaY * 0.0012);
      state.needsRender = true;
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
    if (state.speedNorm <= 0) state.speedNorm = DEFAULT_SPEED;
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

window.__SHINSO__ = {
  getState: () => ({
    logZoom: state.logZoom,
    zoom: effectiveZoom(),
    auto: state.auto,
    centerX: state.centerX,
    centerY: state.centerY,
    aimX: state.aimX,
    aimY: state.aimY,
    renderer: renderer.kind,
    infinite: true,
  }),
  setSpeed: (n) => {
    state.speedNorm = Math.max(0, Math.min(1, n));
    updateSpeedUI();
    if (state.speedNorm > 0) setAuto(true);
  },
  chooseTargetAt: (x, y) => chooseTarget(x, y),
  reset: resetView,
};

console.info("[深層] continuous-dive renderer:", renderer.kind);

let lastT = performance.now();
let hudAcc = 0;

function tick(now) {
  const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
  lastT = now;

  if (state.aimHideTimer > 0) {
    state.aimHideTimer -= dt;
    if (state.aimHideTimer <= 0) aimEl.classList.remove("show");
  }

  if (state.auto) {
    const rate = zoomRateFromSlider(state.speedNorm);
    if (rate > 0) {
      state.logZoom += rate * dt;
      state.needsRender = true;
    }
  }

  if (renderer.resize()) state.needsRender = true;

  const iters = iterationBudget();
  hudAcc += dt;
  if (hudAcc > 0.1) {
    hudAcc = 0;
    zoomLabel.textContent = formatZoom();
    iterLabel.textContent = String(iters);
  }

  if (state.needsRender || state.auto) {
    try {
      renderer.render({
        logZoom: state.logZoom,
        centerX: state.centerX,
        centerY: state.centerY,
        aimX: state.aimX,
        aimY: state.aimY,
        iters,
        time: now * 0.001,
        palette: state.palette,
      });
    } catch (err) {
      console.error(err);
    }
    state.needsRender = false;
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
