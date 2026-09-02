// ---------------------------------------------------------------------------
// quality.js — how much the renderer is allowed to spend.
//
// Phones vary enormously, and asking a player to guess a graphics setting is a
// bad trade. So the game measures its own frame time and moves between tiers on
// its own: it starts conservative on touch hardware, steps down when frames get
// expensive, and steps back up once it has been comfortable for a while.
// A manual override is still available in Options.
// ---------------------------------------------------------------------------

const TIERS = {
  high: {
    name: 'High',
    glows: true, ambient: true,
    particleBudget: 1200, textBudget: 60,
    decorDensity: 1, propDensity: 1,
    enemyScale: 1, maxPixels: 2.6e6, maxDpr: 2,
  },
  medium: {
    name: 'Medium',
    glows: true, ambient: true,
    particleBudget: 650, textBudget: 32,
    decorDensity: 0.6, propDensity: 0.85,
    enemyScale: 0.8, maxPixels: 1.7e6, maxDpr: 1.75,
  },
  low: {
    name: 'Low',
    glows: false, ambient: false,
    particleBudget: 280, textBudget: 14,
    decorDensity: 0.32, propDensity: 0.65,
    enemyScale: 0.6, maxPixels: 1.0e6, maxDpr: 1.35,
  },
};

const ORDER = ['low', 'medium', 'high'];

/** Live settings the renderer reads. Mutated in place so imports stay valid. */
export const q = { ...TIERS.high, tier: 'high' };

let mode = 'auto';            // 'auto' | 'high' | 'medium' | 'low'
let onChange = null;

/**
 * Touch hardware starts at medium and earns its way up, rather than starting
 * high and stuttering through the first thirty seconds of someone's first run.
 */
function detectTier() {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (cores <= 4 || mem <= 2) return 'low';
  if (coarse) return 'medium';
  return 'high';
}

function applyTier(tier) {
  if (q.tier === tier) return;
  Object.assign(q, TIERS[tier], { tier });
  onChange?.(tier);
}

export function initQuality(savedMode = 'auto', changed = null) {
  onChange = changed;
  setQualityMode(savedMode);
}

export function setQualityMode(next) {
  mode = next || 'auto';
  applyTier(mode === 'auto' ? detectTier() : mode);
  resetGovernor();
}

export const qualityMode = () => mode;
export const tierName = () => TIERS[q.tier].name;

// --- the governor -----------------------------------------------------------
let slowFrames = 0, fastFrames = 0, avgMs = 16;

function resetGovernor() { slowFrames = 0; fastFrames = 0; avgMs = 16; }

/**
 * Feed one frame's wall-clock cost. Sustained pressure moves a tier; a single
 * spike (a boss spawn, a GC pause) never does.
 */
export function sampleFrame(ms) {
  if (mode !== 'auto' || !(ms > 0) || ms > 500) return;
  avgMs += (ms - avgMs) * 0.06;

  if (avgMs > 23) { slowFrames++; fastFrames = 0; }
  else if (avgMs < 13) { fastFrames++; slowFrames = 0; }
  else { slowFrames = Math.max(0, slowFrames - 1); fastFrames = Math.max(0, fastFrames - 1); }

  const i = ORDER.indexOf(q.tier);
  if (slowFrames > 75 && i > 0) {
    applyTier(ORDER[i - 1]);
    resetGovernor();
  } else if (fastFrames > 480 && i < ORDER.length - 1) {
    applyTier(ORDER[i + 1]);
    resetGovernor();
  }
}

export function frameStats() { return { avgMs, fps: Math.round(1000 / Math.max(1, avgMs)) }; }

/**
 * Backing-store size for the canvas. Device pixel ratio is honoured only up to
 * the tier's pixel budget — a 3x tablet screen would otherwise ask the GPU to
 * fill four million pixels a frame.
 */
export function canvasSize(cssW, cssH) {
  let dpr = Math.min(window.devicePixelRatio || 1, q.maxDpr);
  let w = Math.round(cssW * dpr);
  let h = Math.round(cssH * dpr);
  const pixels = w * h;
  if (pixels > q.maxPixels) {
    const k = Math.sqrt(q.maxPixels / pixels);
    dpr *= k;
    w = Math.round(cssW * dpr);
    h = Math.round(cssH * dpr);
  }
  return { w, h, dpr };
}

export const QUALITY_MODES = ['auto', 'high', 'medium', 'low'];
