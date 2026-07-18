import { createWebGLRenderer } from "./webglRenderer.js";
import { createCanvasRenderer } from "./canvasRenderer.js";
import {
  makeCenter,
  rescaleCenter,
  offsetCenter,
  toDouble,
  requiredShift,
  computeReference,
  steerOffset,
} from "./deep.js";

/**
 * One genuinely continuous dive. The view center is BigInt fixed-point and
 * the GPU renders by perturbation around a high-precision reference orbit,
 * so the same real Mandelbrot stays on screen to ×10^26 — no Julia handoff,
 * no crossfade, no scene switch. At the precision floor the dive smoothly
 * reverses, surfaces, and dives again along a fresh boundary path (still one
 * unbroken shot).
 */

const TAP_SLOP_PX = 12;
const BASE_SPAN = 2.6;
const DEFAULT_CENTER = { x: -0.743643887037151, y: 0.13182590420533 };
const DEFAULT_SPEED = 0.28;
const SURFACE_LOG = 1.0; // where an ascent turns back into a dive

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
const MAX_LOG_ZOOM = renderer.maxLogZoom || 8.5;

const state = {
  logZoom: 0.8,
  dir: 1, // +1 diving, -1 surfacing (precision floor reached)
  refCenter: makeCenter(DEFAULT_CENTER.x, DEFAULT_CENTER.y, 0.8),
  viewOff: { x: 0, y: 0 }, // view center − reference center (absolute, doubles)
  steerGoal: { x: 0, y: 0 },
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

let ref = null;
let lastRefBuild = 0;
let lostRebuilds = 0;

function effectiveZoom() {
  return Math.exp(state.logZoom);
}

function currentSpan() {
  return BASE_SPAN / effectiveZoom();
}

function centerAsDoubles() {
  return {
    x: toDouble(state.refCenter.x, state.refCenter.shift) + state.viewOff.x,
    y: toDouble(state.refCenter.y, state.refCenter.shift) + state.viewOff.y,
  };
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
  const depth = Math.max(0, state.logZoom);
  if (renderer.kind === "canvas2d") return Math.min(90, Math.floor(60 + depth * 2));
  if (renderer.kind === "webgl1") return Math.min(300, Math.floor(100 + depth * 20));
  return Math.min(2600, Math.floor(250 + depth * 38));
}

function zoomRateFromSlider(norm) {
  if (norm <= 0.001) return 0;
  const t = Math.pow(norm, 1.15);
  // logZoom / sec — default ~0.24, max ~0.85
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

function setLimitNote(text) {
  if (!limitNote) return;
  if (text) {
    limitNote.textContent = text;
    limitNote.hidden = false;
  } else {
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
  state.aimHideTimer = 1.1;
}

/**
 * (Re)build the high-precision reference orbit at the current view center.
 * Folds the accumulated float offset back into the BigInt center so the
 * offset the GPU sees always stays tiny relative to the span.
 */
function ensureReference(force = false, steer = state.auto && state.dir > 0) {
  if (!renderer.needsReference) return;
  const now = performance.now();
  const span = currentSpan();
  const budget = iterationBudget();
  const offMag = Math.hypot(state.viewOff.x, state.viewOff.y);
  const stale =
    !ref ||
    requiredShift(state.logZoom) > ref.shift ||
    offMag > 0.4 * span ||
    state.logZoom - ref.lzBuilt > 1.2 || // keep boundary lock through fast zooms
    (budget > ref.iters && !ref.escaped);
  if (!stale && !force) return;
  if (!force && now - lastRefBuild < 250) return;
  lastRefBuild = now;

  const shift = requiredShift(Math.min(state.logZoom + 4, MAX_LOG_ZOOM));
  let c = rescaleCenter(state.refCenter, Math.max(shift, state.refCenter.shift));
  c = offsetCenter(c, state.viewOff.x, state.viewOff.y);
  state.refCenter = c;
  state.steerGoal.x -= state.viewOff.x;
  state.steerGoal.y -= state.viewOff.y;
  state.viewOff.x = 0;
  state.viewOff.y = 0;

  const iters = Math.min(renderer.maxRefLen, Math.max(600, budget));
  const built = computeReference(c, iters);
  ref = { ...built, iters, shift: c.shift, lzBuilt: state.logZoom };
  renderer.uploadReference(built.orbit, built.len);

  // Auto-steer: stay glued to the boundary so there is always structure ahead.
  if (steer) {
    const s = steerOffset(built.orbit, built.len, span, iters, state.aimX, state.aimY);
    if (!Number.isFinite(s.score) && !s.centerOk) {
      // Nothing resolvable anywhere nearby — we fell into a featureless void.
      // Surface (still continuous) until structure comes back into view.
      lostRebuilds++;
      if (lostRebuilds >= 2 && state.auto && state.dir > 0) {
        state.dir = -1;
        setLimitNote("この先は構造がありません — 映像はそのまま浮上します");
      }
    } else {
      lostRebuilds = 0;
    }
    if (Number.isFinite(s.score)) {
      let gx = s.dx;
      let gy = s.dy;
      // While the center is still on structure, keep the crawl gentle so the
      // dive reads as diving, not sliding. Full-length moves are reserved for
      // recovering a lost boundary.
      const mag = Math.hypot(gx, gy);
      const cap = s.centerOk ? 0.2 * span : Infinity;
      if (mag > cap) {
        gx *= cap / mag;
        gy *= cap / mag;
      }
      state.steerGoal.x = gx;
      state.steerGoal.y = gy;
    }
  }
  state.needsRender = true;
}

function resetView() {
  state.logZoom = 0.8;
  state.dir = 1;
  state.refCenter = makeCenter(DEFAULT_CENTER.x, DEFAULT_CENTER.y, 0.8);
  state.viewOff = { x: 0, y: 0 };
  state.steerGoal = { x: 0, y: 0 };
  state.aimX = 0.1;
  state.aimY = 0.2;
  ref = null;
  setAuto(true);
  if (state.speedNorm <= 0) state.speedNorm = DEFAULT_SPEED;
  updateSpeedUI();
  setLimitNote(null);
  ensureReference(true);
  state.needsRender = true;
  aimEl.classList.remove("show");
  if (hintEl) hintEl.style.display = "";
}

/** Tap steers the continuous dive toward that screen point (no cut). */
function chooseTarget(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
  const aspect = rect.width / Math.max(1, rect.height);
  const span = currentSpan();

  state.steerGoal.x = state.viewOff.x + nx * aspect * span * 0.42;
  state.steerGoal.y = state.viewOff.y + ny * span * 0.42;
  state.aimX = Math.max(-1, Math.min(1, nx));
  state.aimY = Math.max(-1, Math.min(1, ny));
  state.dir = 1;
  setLimitNote(null);

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
          offX: state.viewOff.x,
          offY: state.viewOff.y,
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
        state.logZoom = Math.min(
          MAX_LOG_ZOOM,
          Math.max(0, state.pinchStartLogZoom + Math.log(Math.max(factor, 1e-3)))
        );
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
          state.viewOff.x = state.dragStart.offX - (dx / rect.width) * 2 * aspect * span;
          state.viewOff.y = state.dragStart.offY + (dy / rect.height) * 2 * span;
          state.steerGoal.x = state.viewOff.x;
          state.steerGoal.y = state.viewOff.y;
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
      state.logZoom = Math.min(
        MAX_LOG_ZOOM,
        Math.max(0, state.logZoom - e.deltaY * 0.0012)
      );
      if (e.deltaY < 0) {
        state.dir = 1;
        setLimitNote(null);
      }
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
ensureReference(true);

window.__SHINSO__ = {
  getState: () => {
    const c = centerAsDoubles();
    return {
      logZoom: state.logZoom,
      zoom: effectiveZoom(),
      dir: state.dir,
      auto: state.auto,
      speedNorm: state.speedNorm,
      zoomRate: zoomRateFromSlider(state.speedNorm),
      centerX: c.x,
      centerY: c.y,
      aimX: state.aimX,
      aimY: state.aimY,
      renderer: renderer.kind,
      refLen: ref ? ref.len : 0,
      maxLogZoom: MAX_LOG_ZOOM,
      scale: renderer.getScale ? renderer.getScale() : 1,
      infinite: true,
    };
  },
  setSpeed: (n) => {
    state.speedNorm = Math.max(0, Math.min(1, Number(n) || 0));
    updateSpeedUI();
    if (state.speedNorm > 0) setAuto(true);
  },
  setLogZoom: (lz) => {
    // Walk the scale instead of teleporting so the boundary lock survives
    // the jump (each step re-references and re-steers, like a fast dive).
    const target = Math.min(MAX_LOG_ZOOM, Math.max(0, Number(lz) || 0));
    const step = 0.5;
    let guard = 0;
    while (Math.abs(state.logZoom - target) > step && guard++ < 200) {
      state.logZoom += Math.sign(target - state.logZoom) * step;
      ensureReference(true, true);
      state.viewOff.x = state.steerGoal.x;
      state.viewOff.y = state.steerGoal.y;
    }
    state.logZoom = target;
    ensureReference(true, guard > 0);
    state.viewOff.x = state.steerGoal.x;
    state.viewOff.y = state.steerGoal.y;
    state.needsRender = true;
  },
  pause: () => {
    setAuto(false);
    state.speedNorm = 0;
    updateSpeedUI();
  },
  lockScale: (s) => {
    scaleLocked = true;
    if (renderer.setScale) renderer.setScale(s);
    state.needsRender = true;
  },
  frameLuma: (w, h) => {
    if (!renderer.capture) return null;
    const f = renderer.capture(w, h);
    // attach the view params the captured frame was rendered with, so
    // verification can predict one frame from another exactly
    return lastRendered ? { ...f, ...lastRendered } : f;
  },
  chooseTargetAt: (x, y) => chooseTarget(x, y),
  reset: resetView,
};

console.info("[深層] continuous-dive renderer:", renderer.kind, "maxLogZoom:", MAX_LOG_ZOOM);

let lastT = performance.now();
let hudAcc = 0;
let lastRendered = null;
let avgFrameDt = 1 / 60;
let scaleCheckAcc = 0;
let scaleLocked = false;

function adaptScale(rawDt) {
  if (scaleLocked || !renderer.setScale || !renderer.getScale) return;
  avgFrameDt = avgFrameDt * 0.9 + Math.min(rawDt, 0.5) * 0.1;
  scaleCheckAcc += rawDt;
  if (scaleCheckAcc < 1.2) return;
  scaleCheckAcc = 0;
  const s = renderer.getScale();
  if (avgFrameDt > 0.05 && s > 0.4) {
    renderer.setScale(s * 0.85);
    state.needsRender = true;
  } else if (avgFrameDt < 0.022 && s < 1) {
    renderer.setScale(Math.min(1, s * 1.07));
    state.needsRender = true;
  }
}

function tick(now) {
  const rawDt = Math.max(0, (now - lastT) / 1000);
  lastT = now;
  // UI timers stay capped; zoom uses real elapsed time so slow rAF
  // (headless / background tabs) does not stall the dive.
  const dt = Math.min(0.1, rawDt);
  const zoomDt = Math.min(1, rawDt);

  if (state.aimHideTimer > 0) {
    state.aimHideTimer -= dt;
    if (state.aimHideTimer <= 0) aimEl.classList.remove("show");
  }

  if (state.auto) {
    const rate = zoomRateFromSlider(state.speedNorm);
    if (rate > 0) {
      // Surfacing runs faster than diving so the round trip stays watchable.
      state.logZoom += state.dir * rate * (state.dir < 0 ? 2.4 : 1) * zoomDt;
      if (state.logZoom >= MAX_LOG_ZOOM) {
        state.logZoom = MAX_LOG_ZOOM;
        state.dir = -1;
        setLimitNote("精度の底に到達 — 映像はそのまま、ゆっくり浮上して別の谷へ潜り直します");
      } else if (state.dir < 0 && state.logZoom <= SURFACE_LOG) {
        state.dir = 1;
        setLimitNote(null);
        // Vary the next dive: nudge the aim so steering explores a new path.
        const a = Math.random() * Math.PI * 2;
        state.aimX = Math.cos(a) * 0.6;
        state.aimY = Math.sin(a) * 0.6;
      }
      state.needsRender = true;
    }
  }

  // Glide the view center toward the steering goal — smooth, span-scaled.
  const ease = 1 - Math.exp(-dt * 1.8);
  state.viewOff.x += (state.steerGoal.x - state.viewOff.x) * ease;
  state.viewOff.y += (state.steerGoal.y - state.viewOff.y) * ease;
  if (
    Math.hypot(state.steerGoal.x - state.viewOff.x, state.steerGoal.y - state.viewOff.y) >
    0.001 * currentSpan()
  ) {
    state.needsRender = true;
  }

  ensureReference();

  if (renderer.resize()) state.needsRender = true;

  const iters = iterationBudget();
  hudAcc += dt;
  if (hudAcc > 0.1) {
    hudAcc = 0;
    zoomLabel.textContent = formatZoom();
    iterLabel.textContent = String(iters);
  }

  if (state.needsRender || state.auto) {
    const span = currentSpan();
    {
      const c = centerAsDoubles();
      lastRendered = { span, cx: c.x, cy: c.y };
    }
    try {
      if (renderer.needsReference) {
        renderer.render({
          span,
          offsetX: state.viewOff.x / span,
          offsetY: state.viewOff.y / span,
          iters,
          time: now * 0.001,
          palette: state.palette,
        });
      } else {
        const c = centerAsDoubles();
        renderer.render({
          span,
          centerX: c.x,
          centerY: c.y,
          iters,
          time: now * 0.001,
          palette: state.palette,
        });
      }
    } catch (err) {
      console.error(err);
    }
    state.needsRender = false;
    adaptScale(rawDt);
  }

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
