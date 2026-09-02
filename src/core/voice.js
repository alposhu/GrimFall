// ---------------------------------------------------------------------------
// voice.js — the hero speaks.
//
// Clips come from Dillon Becker's "Super Dialogue Audio Pack v1" (CC BY 4.0);
// see audio/voice/SOURCE.txt. Each playable hero is cast to one of the pack's
// five voice actors, so the character you picked is the one grunting when a
// slime connects.
//
// Barks are short, so they are decoded into Web Audio buffers and fired through
// the voice bus — no latency, and a new line cuts the previous one rather than
// letting two takes talk over each other.
// ---------------------------------------------------------------------------

import { pick } from './util.js';
import { voiceTarget } from './audio.js';

/**
 * Hero id -> the actor who plays them, and the rate their takes are played at.
 *
 * The pack ships five actors and the game has seven heroes and three vendors,
 * so the last few share an actor and are separated by playback rate instead —
 * cheaper than shipping the same performance twice, and you only ever hear one
 * hero per run anyway.
 */
export const CASTING = {
  ranger:      { who: 'alex',   rate: 1 },
  warden:      { who: 'sean',   rate: 1 },
  pyromancer:  { who: 'karen',  rate: 1 },
  frostwarden: { who: 'meghan', rate: 1 },
  revenant:    { who: 'ian',    rate: 1 },
  leon:        { who: 'ian',    rate: 1.07 },
  ada:         { who: 'karen',  rate: 0.94 },
};

/** The market's cast. Same clips, held apart by register. */
export const VENDOR_CASTING = {
  oswin:      { who: 'sean',   rate: 0.87 },   // an old ironmonger
  marta:      { who: 'meghan', rate: 1.02 },
  coinweigher:{ who: 'alex',   rate: 1.14 },   // reedy and quick
  crier:      { who: 'ian',    rate: 0.96 },
};

const castOf = (id) => CASTING[id] || CASTING.ranger;

/** event -> how many takes shipped for it (see tools/extract, EVENTS table). */
const TAKES = {
  hurt: 4, die: 2, effort: 2, battlecry: 2, levelup: 2, confirm: 3,
  greet: 2, farewell: 2, refuse: 2, lowhp: 1, getready: 1, gameover: 1,
  wow: 1, enemy: 1,
};

// Per-event pacing. A hero who yelps at every single contact hit becomes
// unbearable within a minute, so the frequent ones are held well apart.
const COOLDOWN = {
  hurt: 4.5, effort: 6, battlecry: 8, levelup: 2.5, confirm: 0.8,
  lowhp: 14, enemy: 10, wow: 3, refuse: 1.2,
};
const GLOBAL_GAP = 0.85;          // no two lines closer together than this

const buffers = new Map();        // url -> AudioBuffer | Promise
let actor = 'alex';
let actorRate = 1;
let lastAt = Object.create(null);
let lastAny = 0;
let current = null;               // the source that is speaking right now
let enabled = true;
let loadedFor = null;

const clipUrl = (who, event, n) =>
  new URL(`../../audio/voice/${who}/${event}-${n}.wav`, import.meta.url).href;

export function setVoiceEnabled(on) { enabled = on; if (!on) stopVoice(); }

/** Cast the run's hero and warm their clips in the background. */
export function setVoiceActor(heroId) {
  const cast = castOf(heroId);
  actor = cast.who;
  actorRate = cast.rate;
  if (loadedFor === cast.who) return;
  loadedFor = cast.who;
  preload(cast.who);
}

function preload(who) {
  const target = voiceTarget();
  if (!target) return;
  for (const [event, n] of Object.entries(TAKES)) {
    for (let i = 1; i <= n; i++) load(clipUrl(who, event, i));
  }
}

function load(url) {
  const hit = buffers.get(url);
  if (hit) return hit;
  const target = voiceTarget();
  if (!target) return null;

  const p = fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((buf) => target.ctx.decodeAudioData(buf))
    .then((decoded) => { buffers.set(url, decoded); return decoded; })
    .catch(() => { buffers.set(url, null); return null; });   // a missing clip is silence, not a crash

  buffers.set(url, p);
  return p;
}

export function stopVoice() {
  if (!current) return;
  try { current.stop(); } catch (e) { /* already finished */ }
  current = null;
}

/**
 * Say a line. Silently does nothing when the clip is still loading, the event
 * is on cooldown, or audio is unavailable — callers never have to check.
 */
export function say(event, opts = {}) {
  if (!enabled) return;
  const target = voiceTarget();
  if (!target || !TAKES[event]) return;

  const now = target.ctx.currentTime;
  if (now - lastAny < GLOBAL_GAP && !opts.force) return;
  const gap = opts.force ? 0 : (COOLDOWN[event] ?? 1.5);
  if (now - (lastAt[event] || -999) < gap) return;

  const n = pick([...Array(TAKES[event]).keys()]) + 1;
  const url = clipUrl(actor, event, n);
  const buf = buffers.get(url);

  if (!buf) { load(url); return; }              // first ask warms it for next time
  if (typeof buf.then === 'function') return;   // still decoding

  lastAt[event] = now;
  lastAny = now;

  stopVoice();
  current = fire(target, buf, opts.gain ?? 1, opts.rate ?? actorRate, true);
}

function fire(target, buf, gain, rate, exclusive) {
  const src = target.ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = target.ctx.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(target.gain);
  if (exclusive) src.onended = () => { if (current === src) current = null; };
  src.start();
  return src;
}

/**
 * Speak as somebody who is not the run's hero — a vendor, or a voice in the
 * crowd. Bypasses the hero's cooldown table (a merchant greeting you is not
 * competing with your own barks) but still cuts the previous vendor line.
 *
 * `id` is a key in VENDOR_CASTING, or `{ who, rate }` for one-offs.
 */
export function speakAs(id, event, opts = {}) {
  if (!enabled) return;
  const target = voiceTarget();
  if (!target || !TAKES[event]) return;

  const cast = typeof id === 'string' ? (VENDOR_CASTING[id] || CASTING.ranger) : id;
  const n = pick([...Array(TAKES[event]).keys()]) + 1;
  const url = clipUrl(cast.who, event, n);
  const buf = buffers.get(url);

  if (!buf) { load(url); return; }
  if (typeof buf.then === 'function') return;

  const rate = (cast.rate ?? 1) * (opts.rateJitter ? 1 + (Math.random() - 0.5) * opts.rateJitter : 1);
  if (opts.background) {
    // Crowd noise: never interrupts anyone, never becomes the current line.
    fire(target, buf, opts.gain ?? 0.22, rate, false);
    return;
  }
  lastAny = target.ctx.currentTime;
  stopVoice();
  current = fire(target, buf, opts.gain ?? 1, rate, true);
}

/** Warm a vendor's clips so the first line of dialogue is not silent. */
export function preloadVendor(id) {
  const cast = typeof id === 'string' ? (VENDOR_CASTING[id] || CASTING.ranger) : id;
  for (const event of ['greet', 'confirm', 'refuse', 'farewell', 'wow']) {
    for (let i = 1; i <= (TAKES[event] || 0); i++) load(clipUrl(cast.who, event, i));
  }
}

/** True once at least one clip for the current hero is ready to play. */
export function voiceReady() {
  for (const [url, v] of buffers) {
    if (url.includes(`/${actor}/`) && v && typeof v.then !== 'function') return true;
  }
  return false;
}
