// ---------------------------------------------------------------------------
// intro.js — the opening cinematic.
//
// It plays once at launch, before the title screen, and any key, click or tap
// gets you past it. Nothing in the game waits on it: `playIntro()` always
// resolves, and if anything at all goes wrong it resolves immediately, because
// an intro that can strand you on a black screen is worse than no intro.
//
// Two sources, in order of preference:
//
//   1. `video/intro.mp4`, if it is there. That is where a rendered film goes —
//      drop the file in and it plays with no code change.
//   2. Otherwise a cinematic drawn here, on the same canvas the game uses. It
//      is not a fallback in the apologetic sense: it is four beats built from
//      the game's own logo and its own particle vocabulary, and it is what
//      ships today, because the project has no video in it.
//
// The drawn version is deliberately short. An unskippable-feeling intro is the
// fastest way to make somebody resent a game they have not played yet, so it
// runs about thirteen seconds, tells you the premise, and gets out.
// ---------------------------------------------------------------------------

import { TAU, clamp, rand } from '../core/util.js';

const VIDEO_URL = new URL('../../video/intro.mp4', import.meta.url).href;
const LOGO_URL = new URL('../../img/logo.png', import.meta.url).href;

// How long to wait for the video to say whether it can play at all.
const VIDEO_PROBE = 2500;
const LOGO_TIMEOUT = 3000;

/** The four beats, in seconds. The sum is the length of the drawn cinematic. */
const BEATS = [
  { t: 3.4, line: 'The sky broke, and the long hour began.' },
  { t: 3.4, line: 'What fell did not stop falling.' },
  { t: 3.2, line: 'One of you is still standing.' },
  { t: 3.4, line: null },                      // the logo, alone
];
const TOTAL = BEATS.reduce((n, b) => n + b.t, 0);

let skipRequested = false;

/** Ask the running intro to end. Safe to call when nothing is playing. */
export function skipIntro() { skipRequested = true; }

function loadLogo() {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve(null); return; }
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(() => done(null), LOGO_TIMEOUT);
    const img = new Image();
    img.onload = () => done(img.naturalWidth ? img : null);
    img.onerror = () => done(null);
    img.src = LOGO_URL;
    if (img.complete && img.naturalWidth) done(img);
  });
}

/**
 * Play the intro. Resolves when it finishes or is skipped — never rejects, and
 * never takes longer than the cinematic plus the probe.
 *
 * @param {object} io  { canvas, ctx, onSkipShown }  the surface to draw on
 * @returns {Promise<'video'|'drawn'|'skipped'|'none'>} what actually happened
 */
export async function playIntro(io) {
  skipRequested = false;
  const { canvas, ctx } = io || {};
  if (!canvas || !ctx) return 'none';

  const stop = listen();
  try {
    if (await canPlayVideo()) return await playVideo(io, stop);
    return await playDrawn(io);
  } catch (e) {
    return 'none';                              // never strand the player
  } finally {
    stop.remove();
  }
}

// ---------------------------------------------------------------------------
// Skipping
// ---------------------------------------------------------------------------
// Everything skips: any key, any click, any tap. Space and Enter are named in
// the prompt because they are what people reach for, but nothing is fussy.
function listen() {
  if (typeof window === 'undefined') return { remove() {} };
  const go = () => { skipRequested = true; };
  const opts = { passive: true };
  window.addEventListener('keydown', go, opts);
  window.addEventListener('pointerdown', go, opts);
  return {
    remove() {
      // Guarded: a host that can add a listener but not remove one is a broken
      // host, and it must not take the intro — or the boot — down with it.
      window.removeEventListener?.('keydown', go, opts);
      window.removeEventListener?.('pointerdown', go, opts);
    },
  };
}

// ---------------------------------------------------------------------------
// The video path
// ---------------------------------------------------------------------------
async function canPlayVideo() {
  if (typeof document === 'undefined' || typeof fetch === 'undefined') return false;
  const probe = document.createElement('video');
  if (!probe.canPlayType || !probe.canPlayType('video/mp4')) return false;
  // A HEAD request rather than loading it: a missing file must cost nothing.
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl?.abort(), VIDEO_PROBE);
    const res = await fetch(VIDEO_URL, { method: 'HEAD', signal: ctrl?.signal });
    clearTimeout(timer);
    return !!res && res.ok;
  } catch (e) {
    return false;
  }
}

function playVideo(io, stop) {
  const { canvas, ctx } = io;
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.src = VIDEO_URL;
    v.playsInline = true;
    v.preload = 'auto';
    // Sound is attempted first and given up only if the browser refuses. On a
    // cold first visit there has been no gesture yet, so it will refuse and the
    // film plays muted; on any later visit, or once the page has been clicked,
    // the score is heard. Starting muted unconditionally would throw that away
    // for everyone, forever.
    v.muted = false;
    v.volume = 1;

    let raf = 0;
    let finished = false;
    const end = (how) => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      try { v.pause(); } catch (e) { /* already gone */ }
      v.src = '';
      resolve(how);
    };

    v.addEventListener('ended', () => end('video'));
    v.addEventListener('error', () => end('none'));

    const frame = () => {
      if (skipRequested) { end('skipped'); return; }
      const w = canvas.width, h = canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      if (v.videoWidth) {
        // Contain, so a film of any aspect is letterboxed rather than cropped.
        const k = Math.min(w / v.videoWidth, h / v.videoHeight);
        const dw = v.videoWidth * k, dh = v.videoHeight * k;
        ctx.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
      }
      drawSkipHint(ctx, w, h, v.currentTime);
      raf = requestAnimationFrame(frame);
    };

    const p = v.play();
    if (p && p.catch) {
      p.catch(() => {
        // Refused for having sound. Mute and try once more; only a second
        // refusal means the film genuinely cannot play.
        v.muted = true;
        const q = v.play();
        if (q && q.catch) q.catch(() => end('none'));
      });
    }
    raf = requestAnimationFrame(frame);
  });
}

// ---------------------------------------------------------------------------
// The drawn path
// ---------------------------------------------------------------------------
async function playDrawn(io) {
  const { canvas, ctx } = io;
  const logo = await loadLogo();
  const embers = [];

  return new Promise((resolve) => {
    let t = 0;
    let last = performance.now();
    let raf = 0;

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;

      if (skipRequested) { cancelAnimationFrame(raf); resolve('skipped'); return; }
      if (t >= TOTAL) { cancelAnimationFrame(raf); resolve('drawn'); return; }

      drawFrame(ctx, canvas, t, dt, embers, logo);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  });
}

/** Which beat we are in, and how far through it, at time `t`. */
function beatAt(t) {
  let acc = 0;
  for (let i = 0; i < BEATS.length; i++) {
    if (t < acc + BEATS[i].t) return { i, p: (t - acc) / BEATS[i].t, def: BEATS[i] };
    acc += BEATS[i].t;
  }
  const last = BEATS.length - 1;
  return { i: last, p: 1, def: BEATS[last] };
}

function drawFrame(ctx, canvas, t, dt, embers, logo) {
  const w = canvas.width, h = canvas.height;
  const { i, p, def } = beatAt(t);
  const s = Math.min(w, h) / 720;              // one scale for the whole scene

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#07050c';
  ctx.fillRect(0, 0, w, h);

  // A slow warm gradient from below: the fire the world is lit by.
  const g = ctx.createLinearGradient(0, h, 0, h * 0.3);
  g.addColorStop(0, `rgba(120, 34, 12, ${0.3 + Math.sin(t * 0.7) * 0.05})`);
  g.addColorStop(1, 'rgba(120, 34, 12, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // --- embers ---------------------------------------------------------------
  // Spawned continuously and drifting up, so every beat has motion under it.
  if (embers.length < 150 && Math.random() < dt * 90) {
    embers.push({
      x: rand(0, w), y: h + 10,
      vx: rand(-14, 14) * s, vy: rand(-70, -22) * s,
      life: rand(2.4, 5.2), age: 0, r: rand(1, 2.6) * s,
    });
  }
  for (let k = embers.length - 1; k >= 0; k--) {
    const e = embers[k];
    e.age += dt;
    if (e.age >= e.life) { embers.splice(k, 1); continue; }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vx += Math.sin(t * 1.3 + e.y * 0.01) * 6 * s * dt;
    const a = (1 - e.age / e.life) * 0.8;
    ctx.globalAlpha = a;
    ctx.fillStyle = e.age < e.life * 0.5 ? '#ffb648' : '#c2431a';
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // --- per-beat imagery -----------------------------------------------------
  if (i === 0) drawSky(ctx, w, h, s, p, t);
  else if (i === 1) drawFalling(ctx, w, h, s, p, t);
  else if (i === 2) drawHorde(ctx, w, h, s, p, t);

  // --- the logo -------------------------------------------------------------
  // It fades up under the last two beats and lands on its own.
  if (i >= 2) {
    const grow = i === 3 ? clamp(p * 2.4, 0, 1) : clamp((p - 0.4) * 2, 0, 1);
    const alpha = i === 3 ? clamp(p * 3, 0, 1) : clamp((p - 0.5) * 1.6, 0, 0.35);
    drawLogo(ctx, w, h, logo, alpha, 0.94 + grow * 0.06, i === 3);
  }

  // --- the line -------------------------------------------------------------
  if (def.line) {
    // In over the first fifth, out over the last fifth, so lines cross-fade
    // rather than cutting.
    const a = Math.min(clamp(p * 5, 0, 1), clamp((1 - p) * 5, 0, 1));
    ctx.globalAlpha = a * 0.92;
    ctx.fillStyle = '#e8dcc0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(22 * s)}px 'Chakra Petch', system-ui, sans-serif`;
    ctx.fillText(def.line, w / 2, h * (i === 2 ? 0.2 : 0.5));
    ctx.globalAlpha = 1;
  }

  // Letterbox bars: the cheapest possible way to say "this is a cutscene".
  ctx.fillStyle = '#000';
  const bar = h * 0.07;
  ctx.fillRect(0, 0, w, bar);
  ctx.fillRect(0, h - bar, w, bar);

  drawSkipHint(ctx, w, h, t);
}

/** Beat 1: a star field with one seam of light across it. */
function drawSky(ctx, w, h, s, p, t) {
  ctx.save();
  for (let k = 0; k < 90; k++) {
    // Hashed rather than stored: the same stars every run, no array to keep.
    const x = ((k * 9301 + 49297) % 233280) / 233280 * w;
    const y = ((k * 4021 + 1301) % 233280) / 233280 * h * 0.7;
    ctx.globalAlpha = 0.25 + ((k * 37) % 10) / 20 + Math.sin(t * 2 + k) * 0.12;
    ctx.fillStyle = '#c9e8ff';
    ctx.fillRect(x, y, 1.5 * s, 1.5 * s);
  }
  // The break itself, opening across the sky.
  const k = clamp((p - 0.25) * 1.8, 0, 1);
  if (k > 0) {
    ctx.globalAlpha = k * (1 - p * 0.4);
    ctx.strokeStyle = '#ffd75e';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - w * 0.42 * k, h * 0.3);
    for (let seg = 0; seg <= 8; seg++) {
      const f = seg / 8;
      ctx.lineTo(
        w * 0.5 + (f - 0.5) * w * 0.84 * k,
        h * 0.3 + Math.sin(f * 9 + t) * 12 * s,
      );
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Beat 2: something enormous coming down, trailing fire. */
function drawFalling(ctx, w, h, s, p, t) {
  ctx.save();
  const x = w * (0.18 + p * 0.5);
  const y = h * (-0.1 + p * 0.85);
  // Trail first, so the head sits on top of it.
  for (let k = 12; k >= 0; k--) {
    const f = k / 12;
    const tx = x - f * w * 0.22;
    const ty = y - f * h * 0.36;
    ctx.globalAlpha = (1 - f) * 0.5;
    ctx.fillStyle = k % 3 ? '#ff8a2a' : '#ffd75e';
    ctx.beginPath();
    ctx.arc(tx, ty, (1 - f) * 9 * s + 2, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(x, y, 11 * s + Math.sin(t * 18) * 1.5 * s, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Beat 3: the horizon fills with what is coming for you. */
function drawHorde(ctx, w, h, s, p, t) {
  ctx.save();
  const baseline = h * 0.82;
  const n = 34;
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1);
    // They rise in a ragged order rather than all at once.
    const delay = ((k * 61) % 100) / 100 * 0.45;
    const up = clamp((p - delay) * 3.2, 0, 1);
    if (up <= 0) continue;
    const hh = (26 + ((k * 43) % 22)) * s;
    const x = f * w;
    const y = baseline + (1 - up) * hh;
    ctx.globalAlpha = 0.9 * up;
    ctx.fillStyle = '#14101c';
    ctx.beginPath();
    ctx.ellipse(x, y - hh * 0.5, hh * 0.32, hh * 0.5, 0, 0, TAU);
    ctx.fill();
    // Two eyes, because a silhouette with eyes is a threat and one without is
    // a rock.
    ctx.fillStyle = '#ff5a3c';
    ctx.globalAlpha = up * (0.6 + Math.sin(t * 5 + k) * 0.3);
    ctx.fillRect(x - hh * 0.16, y - hh * 0.7, 2.4 * s, 2.4 * s);
    ctx.fillRect(x + hh * 0.08, y - hh * 0.7, 2.4 * s, 2.4 * s);
  }
  ctx.restore();
}

function drawLogo(ctx, w, h, logo, alpha, scale, settled) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (logo) {
    const maxW = Math.min(w * 0.62, 560 * (Math.min(w, h) / 720));
    const dw = maxW * scale;
    const dh = dw * (logo.naturalHeight / logo.naturalWidth);
    ctx.drawImage(logo, (w - dw) / 2, h * 0.44 - dh / 2, dw, dh);
  } else {
    // No artwork: the wordmark still has to arrive.
    const s = Math.min(w, h) / 720;
    ctx.fillStyle = '#e8dcc0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(64 * s * scale)}px 'Silkscreen', 'Courier New', monospace`;
    ctx.fillText('GRIMFALL', w / 2, h * 0.44);
  }
  if (settled) {
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = '#a89e8c';
    ctx.textAlign = 'center';
    ctx.font = `${Math.round(15 * (Math.min(w, h) / 720))}px 'Chakra Petch', system-ui, sans-serif`;
    ctx.fillText('A game by Alperen Karabıyık', w / 2, h * 0.72);
  }
  ctx.restore();
}

/** The prompt, held back a beat so it does not pre-empt the first shot. */
function drawSkipHint(ctx, w, h, t) {
  if (t < 1.2) return;
  ctx.save();
  ctx.globalAlpha = 0.38 + Math.sin(t * 2.4) * 0.12;
  ctx.fillStyle = '#c9c2d8';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  const s = Math.min(w, h) / 720;
  ctx.font = `${Math.round(13 * s)}px 'Chakra Petch', system-ui, sans-serif`;
  ctx.fillText('Space / Enter to skip', w - 24 * s, h - 20 * s);
  ctx.restore();
}

/** For the tests: how long the drawn cinematic runs. */
export const introLength = TOTAL;
