import { createWebGLRenderer } from "./webglRenderer.js";
import { createCanvasRenderer } from "./canvasRenderer.js";

/** Classic overview — user taps to choose where to dive. No automatic site hops. */
const START = { x: -0.5, y: 0.0 };
const INITIAL_SCALE = 2.2;
const MAX_SCALE = 3.5;
const TAP_SLOP_PX = 12;

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
/** Absolute floor for this device — we stop here, never auto-switch places. */
const MIN_SCALE = renderer.minScale || (renderer.kind === "canvas2d" ? 1e-14 : 2e-13);

const state = {
  centerX: START.x,
  centerY: START.y,
  /** Locked dive target (complex plane). Updated on tap. */
  targetX: START.x,
  targetY: START.y,
  scale: INITIAL_SCALE,
  auto: true,
  speedNorm: 0.4,
  palette: 0,
  pointerIds: new Map(),
  pinchStartDist: 0,
  pinchStartScale: 1,
  dragStart: null,
  tapCandidate: null,
  needsRender: true,
  atLimit: false,
  aimHideTimer: 0,
};

function formatZoom() {
  const z = INITIAL_SCALE / Math.max(state.scale, 1e-30);
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
    return Math.min(200, Math.floor(90 + 24 * Math.log2(zoom + 1)));
  }
  return Math.min(480, Math.floor(160 + 36 * Math.log2(zoom + 1)));
}

function zoomRateFromSlider(norm) {
  if (norm <= 0.001) return 0;
  const t = Math.pow(norm, 1.15);
  return 0.12 + t * 2.2;
}

function formatSpeed(norm) {
  if (norm <= 0.001) return "停止";
  const mult = zoomRateFromSlider(norm) / zoomRateFromSlider(0.4);
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
  if (on) {
    state.atLimit = false;
    limitNote.hidden = true;
  }
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
  state.aimHideTimer = 1.2;
}

function resetView() {
  state.centerX = START.x;
  state.centerY = START.y;
  state.targetX = START.x;
  state.targetY = START.y;
  state.scale = INITIAL_SCALE;
  state.atLimit = false;
  limitNote.hidden = true;
  setAuto(true);
  if (state.speedNorm <= 0) state.speedNorm = 0.4;
  updateSpeedUI();
  state.needsRender = true;
  aimEl.classList.remove("show");
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

/** Choose dive location — continuous zoom continues into this point (no teleport jump). */
function chooseTarget(clientX, clientY) {
  const p = screenToComplex(clientX, clientY);
  state.targetX = p.x;
  state.targetY = p.y;
  state.atLimit = false;
  limitNote.hidden = true;
  showAim(clientX, clientY);
  if (!state.auto) setAuto(true);
  if (state.speedNorm <= 0) {
    state.speedNorm = 0.4;
    updateSpeedUI();
  }
  // Softly begin centering on the chosen point while zoom continues
  state.needsRender = true;
  if (hintEl) hintEl.style.display = "none";
}

function zoomAt(clientX, clientY, factor) {
  const before = screenToComplex(clientX, clientY);
  const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.scale * factor));
  state.scale = next;
  const after = screenToComplex(clientX, clientY);
  state.centerX += before.x - after.x;
  state.centerY += before.y - after.y;
  // Keep target under the same screen point intent when pinching
  state.needsRender = true;
  if (state.scale <= MIN_SCALE * 1.01) {
    state.atLimit = true;
    limitNote.hidden = false;
  } else {
    state.atLimit = false;
    limitNote.hidden = true;
  }
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
          moved: false,
        };
        state.tapCandidate = { x: e.clientX, y: e.clientY };
      } else if (state.pointerIds.size === 2) {
        state.pinchStartDist = pointerDistance();
        state.pinchStartScale = state.scale;
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
        const pts = [...state.pointerIds.values()];
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const targetScale = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, state.pinchStartScale * (state.pinchStartDist / Math.max(dist, 1)))
        );
        zoomAt(midX, midY, targetScale / state.scale);
        state.tapCandidate = null;
      } else if (state.dragStart && state.pointerIds.size === 1) {
        const dx = e.clientX - state.dragStart.x;
        const dy = e.clientY - state.dragStart.y;
        if (Math.hypot(dx, dy) > TAP_SLOP_PX) {
          state.dragStart.moved = true;
          state.tapCandidate = null;
          const rect = canvas.getBoundingClientRect();
          const ndx = (dx / rect.width) * 2;
          const ndy = -((dy / rect.height) * 2);
          const aspect = canvas.width / Math.max(1, canvas.height);
          state.centerX = state.dragStart.cx - ndx * aspect * state.scale;
          state.centerY = state.dragStart.cy - ndy * state.scale;
          // Dragging re-aims to the new view center
          state.targetX = state.centerX;
          state.targetY = state.centerY;
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
      if (wasTap) {
        chooseTarget(state.tapCandidate.x, state.tapCandidate.y);
      }
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
  if (state.speedNorm > 0) {
    state.atLimit = false;
    limitNote.hidden = true;
  }
});

autoBtn.addEventListener("click", () => {
  if (state.auto) {
    setAuto(false);
    state.speedNorm = 0;
  } else {
    setAuto(true);
    if (state.speedNorm <= 0) state.speedNorm = 0.4;
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
    scale: state.scale,
    zoom: INITIAL_SCALE / Math.max(state.scale, 1e-30),
    auto: state.auto,
    atLimit: state.atLimit,
    centerX: state.centerX,
    centerY: state.centerY,
    targetX: state.targetX,
    targetY: state.targetY,
    renderer: renderer.kind,
    minScale: MIN_SCALE,
  }),
  setSpeed: (n) => {
    state.speedNorm = Math.max(0, Math.min(1, n));
    updateSpeedUI();
    if (state.speedNorm > 0) setAuto(true);
  },
  chooseTargetAt: (x, y) => chooseTarget(x, y),
  reset: resetView,
};

console.info("[深層] renderer:", renderer.kind, "minScale:", MIN_SCALE, "(no auto site switch)");

let lastT = performance.now();
let hudAcc = 0;

function diveIn(dt) {
  const rate = zoomRateFromSlider(state.speedNorm);
  if (rate <= 0) return;

  if (state.scale <= MIN_SCALE) {
    state.scale = MIN_SCALE;
    state.atLimit = true;
    limitNote.hidden = false;
    return;
  }

  state.scale *= Math.exp(-rate * dt);
  if (state.scale < MIN_SCALE) state.scale = MIN_SCALE;

  // Continuously home toward the user-chosen target while zooming in — no jumps
  const pull = 1 - Math.exp(-1.8 * dt);
  state.centerX += (state.targetX - state.centerX) * pull;
  state.centerY += (state.targetY - state.centerY) * pull;
  state.needsRender = true;

  if (state.scale <= MIN_SCALE) {
    state.atLimit = true;
    limitNote.hidden = false;
  }
}

function tick(now) {
  // Wall-clock zoom: SPEED stays honest even if a heavy frame hitches
  const rawDt = Math.max(0, (now - lastT) / 1000);
  const dt = Math.min(0.25, rawDt);
  lastT = now;

  if (state.aimHideTimer > 0) {
    state.aimHideTimer -= dt;
    if (state.aimHideTimer <= 0) aimEl.classList.remove("show");
  }

  if (state.auto) diveIn(dt);

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
