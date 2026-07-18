import { createWebGLRenderer } from "./webglRenderer.js";
import { createCanvasRenderer } from "./canvasRenderer.js";

/** Dive targets — wide then deep. */
const SITES = [
  { x: -0.5, y: 0.0, name: "overview" },
  { x: -0.7436438870371587, y: 0.13182590420531197, name: "seahorse" },
  { x: -0.7487663670389055, y: 0.06574877392439881, name: "spiral" },
  { x: -1.25066, y: 0.02012, name: "mini" },
  { x: -0.16070135, y: 1.0375665, name: "antenna" },
  { x: -0.5622799, y: 0.6428148, name: "tendril" },
  { x: 0.28171792, y: 0.57710528, name: "elephant" },
  { x: -0.745428, y: 0.113009, name: "valley" },
];

const INITIAL_SCALE = 2.5;
/** Float32 precision dies around here — jump to next site. */
const MIN_SCALE = 5e-7;
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

  // Ensure a clean canvas for 2D (WebGL bind poisons the old one)
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

const state = {
  centerX: SITES[0].x,
  centerY: SITES[0].y,
  scale: INITIAL_SCALE,
  siteIndex: 0,
  auto: true,
  speedNorm: 0.55,
  palette: 0,
  pointerIds: new Map(),
  pinchStartDist: 0,
  pinchStartScale: 1,
  dragStart: null,
  needsRender: true,
  transitioning: false,
  transitionT: 0,
  fromCenter: { x: 0, y: 0 },
  toCenter: { x: 0, y: 0 },
  fromScale: INITIAL_SCALE,
};

function formatZoom(scale) {
  const z = INITIAL_SCALE / scale;
  if (z < 1000) return `×${z.toFixed(z < 10 ? 1 : 0)}`;
  if (z < 1e6) return `×${(z / 1e3).toFixed(1)}K`;
  if (z < 1e9) return `×${(z / 1e6).toFixed(1)}M`;
  return `×${z.toExponential(1)}`;
}

function iterationBudget(scale) {
  const zoom = Math.max(1, INITIAL_SCALE / scale);
  if (renderer.kind === "canvas2d") {
    return Math.min(160, Math.floor(60 + 18 * Math.log2(zoom + 1)));
  }
  return Math.min(500, Math.floor(120 + 28 * Math.log2(zoom + 1)));
}

function zoomRateFromSlider(norm) {
  if (norm <= 0.001) return 0;
  const t = Math.pow(norm, 1.2);
  // Noticeably moving at default; thrilling at max
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

function jumpToSite(index, soft = true) {
  const site = SITES[index % SITES.length];
  state.siteIndex = index % SITES.length;
  if (soft) {
    state.transitioning = true;
    state.transitionT = 0;
    state.fromCenter = { x: state.centerX, y: state.centerY };
    state.toCenter = { x: site.x, y: site.y };
    state.fromScale = state.scale;
  } else {
    state.centerX = site.x;
    state.centerY = site.y;
    state.scale = INITIAL_SCALE;
    state.transitioning = false;
  }
  state.needsRender = true;
}

function resetView() {
  jumpToSite(0, false);
  state.scale = INITIAL_SCALE;
  setAuto(true);
  if (state.speedNorm <= 0) state.speedNorm = 0.55;
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
  const before = screenToComplex(clientX, clientY);
  state.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.scale * factor));
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
          Math.max(MIN_SCALE, state.pinchStartScale * (state.pinchStartDist / Math.max(dist, 1)))
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

// Show which renderer for debugging
console.info("[深層] renderer:", renderer.kind);

let lastT = performance.now();
let hudAcc = 0;

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function tick(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (state.transitioning) {
    state.transitionT += dt * 1.1;
    const t = Math.min(1, state.transitionT);
    const e = easeInOut(t);
    state.centerX = state.fromCenter.x + (state.toCenter.x - state.fromCenter.x) * e;
    state.centerY = state.fromCenter.y + (state.toCenter.y - state.fromCenter.y) * e;
    const logFrom = Math.log(Math.max(state.fromScale, MIN_SCALE));
    const logTo = Math.log(INITIAL_SCALE * 0.95);
    state.scale = Math.exp(logFrom + (logTo - logFrom) * e);
    if (t >= 1) {
      state.transitioning = false;
      state.centerX = state.toCenter.x;
      state.centerY = state.toCenter.y;
      state.scale = INITIAL_SCALE * 0.95;
    }
    state.needsRender = true;
  } else if (state.auto) {
    const rate = zoomRateFromSlider(state.speedNorm);
    if (rate > 0) {
      state.scale *= Math.exp(-rate * dt);
      const site = SITES[state.siteIndex];
      // After overview, gently lock onto the landmark
      if (state.siteIndex > 0) {
        const pull = 1 - Math.exp(-0.35 * dt);
        state.centerX += (site.x - state.centerX) * pull;
        state.centerY += (site.y - state.centerY) * pull;
      }
      state.needsRender = true;

      if (state.scale <= MIN_SCALE * 1.15) {
        jumpToSite(state.siteIndex + 1, true);
      }
    }
  }

  if (renderer.resize()) state.needsRender = true;

  const iters = iterationBudget(state.scale);
  hudAcc += dt;
  if (hudAcc > 0.1) {
    hudAcc = 0;
    zoomLabel.textContent = formatZoom(state.scale);
    iterLabel.textContent = String(iters);
  }

  if (state.needsRender || state.auto || state.transitioning) {
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
