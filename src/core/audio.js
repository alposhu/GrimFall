// ---------------------------------------------------------------------------
// audio.js — the soundtrack and every sound effect.
//
// Music is HydroGene's "28 High Quality 16-bit RPG Music" pack (see
// audio/SOURCE.txt), streamed through the Web Audio graph so it shares the
// volume bus with everything else, with crossfades between contexts and proper
// intro-then-loop playback for the tracks that ship an intro.
//
// Sound effects come from Helton Yan's "Pixel Combat" pack (audio/sfx/SOURCE.txt),
// decoded into buffers and fired with a little random pitch so a sound heard
// four times a second never sounds pasted.
//
// If any of it cannot play — offline, blocked, an unsupported codec — the
// original procedural sequencer and synthesised blips below take over, so the
// game is never silent.
// ---------------------------------------------------------------------------

import { makeRng, clamp } from './util.js';

let ctx = null;
let masterGain = null, musicGain = null, sfxGain = null, voiceGain = null;
let musicBus = null;               // dry + delay send shared by the music voices
let ready = false;

const state = {
  musicOn: true,
  musicVol: 0.5,
  sfxOn: true,
  sfxVol: 0.7,
  voiceOn: true,
  voiceVol: 0.85,
  track: null,                     // the requested context
  synthTrack: null,                // set only while the fallback synth is playing
  intensity: 0,                    // 0..1, nudges drum/lead density during a run
};

// --- music theory -----------------------------------------------------------
const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 3, 5, 7, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

function degreeToMidi(root, scale, degree) {
  const s = SCALES[scale];
  const oct = Math.floor(degree / s.length);
  const idx = ((degree % s.length) + s.length) % s.length;
  return root + oct * 12 + s[idx];
}

// Each track is a mood, not a recording: the sequencer improvises within it.
const TRACKS = {
  menu:     { bpm: 84,  root: 57, scale: 'dorian',     seed: 11, chords: [0, 5, 3, 4], lead: 0.45, drums: 0.25, bassOct: -1, pad: true,  swing: 0.16 },
  battle:   { bpm: 132, root: 55, scale: 'minor',      seed: 23, chords: [0, 0, 5, 6], lead: 0.62, drums: 0.85, bassOct: -1, pad: false, swing: 0.04 },
  battle2:  { bpm: 140, root: 52, scale: 'pentatonic', seed: 47, chords: [0, 4, 2, 5], lead: 0.68, drums: 0.90, bassOct: -1, pad: false, swing: 0.0 },
  boss:     { bpm: 152, root: 50, scale: 'harmonic',   seed: 71, chords: [0, 0, 1, 0], lead: 0.75, drums: 1.0,  bassOct: -1, pad: false, swing: 0.0 },
  battle3:  { bpm: 148, root: 53, scale: 'harmonic',   seed: 59, chords: [0, 3, 1, 5], lead: 0.70, drums: 0.95, bassOct: -1, pad: false, swing: 0.0 },
  victory:  { bpm: 108, root: 60, scale: 'lydian',     seed: 5,  chords: [0, 3, 4, 5], lead: 0.70, drums: 0.4,  bassOct: -1, pad: true,  swing: 0.1 },
  gameover: { bpm: 66,  root: 48, scale: 'minor',      seed: 93, chords: [0, 6, 5, 0], lead: 0.30, drums: 0.0,  bassOct: 0,  pad: true,  swing: 0.2 },
  // If the crowd recording cannot play, the market still needs to sound like a
  // place to catch your breath: slow, warm, no drums.
  market:   { bpm: 76,  root: 55, scale: 'dorian',     seed: 37, chords: [0, 3, 4, 2], lead: 0.28, drums: 0.0,  bassOct: -1, pad: true,  swing: 0.22 },
};

// ---------------------------------------------------------------------------
// Recorded soundtrack
// ---------------------------------------------------------------------------
// `intro` plays once, then `src` loops forever. Paths resolve against this
// module so the game still works when deployed in a subdirectory.
const MUSIC_FILES = {
  menu:      { src: 'menu.mp3' },
  battle:    { src: 'battle-1.mp3', intro: 'battle-1-intro.mp3' },
  battle2:   { src: 'battle-2.mp3', intro: 'battle-2-intro.mp3' },
  battle3:   { src: 'battle-3.mp3', intro: 'battle-3-intro.mp3' },
  boss:      { src: 'boss-magus.mp3' },
  'boss:magus':      { src: 'boss-magus.mp3' },
  'boss:demon':      { src: 'boss-demon.mp3' },
  'boss:frosttitan': { src: 'boss-frosttitan.mp3', intro: 'boss-frosttitan-intro.mp3' },
  'boss:sovereign':  { src: 'boss-sovereign.mp3', intro: 'boss-sovereign-intro.mp3' },
  'boss:parduin':    { src: 'boss-parduin.mp3' },
  victory:   { src: 'victory.mp3' },
  gameover:  { src: 'gameover.mp3' },
  // The market has no score — it has a crowd. A 48s seamless loop cut from the
  // owner's own field recording, so the hub sounds like somewhere people live.
  //
  // `layers` are extra loops mixed underneath at lower levels. They are
  // different lengths and never restart together, so a space you stand around
  // in never repeats itself in a way you can hear.
  market:    { src: 'market.wav', layers: [{ src: 'market-crowd.ogg', gain: 0.34 }] },

  // The Hearthhall has no score either — it has a room. Three loops rather
  // than one: they are different lengths and are started at different moments,
  // so they drift apart and never come back around together. A single crowd
  // loop in a room people stand around in becomes audible as a loop inside a
  // minute, and once somebody has heard the seam they hear it every time.
  //
  // The hearth sits under both crowds because a fire is the one sound in an inn
  // that never stops, and it covers the moment a crowd loop turns over.
  hall: {
    src: 'hall-crowd-1.ogg',
    layers: [
      { src: 'hall-crowd-2.ogg', gain: 0.30 },
      { src: 'hall-fire.ogg', gain: 0.22 },
    ],
  },
};

const FADE = 0.9;                 // crossfade seconds between contexts
let filesUsable = true;           // flipped off if the browser cannot play mp3
let playing = null;               // { name, gain, el, introEl, stopAt }
let pendingName = null;           // waiting on a user gesture to start

const trackUrl = (file) => new URL(`../../audio/${file}`, import.meta.url).href;

function makeElement(file, loop) {
  const el = new Audio();
  el.src = trackUrl(file);
  el.loop = loop;
  el.preload = 'auto';
  el.crossOrigin = 'anonymous';
  return el;
}

function fadeTo(gain, value, seconds = FADE) {
  const t = ctx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.linearRampToValueAtTime(value, t + seconds);
}

function stopVoice(voice, seconds = FADE) {
  if (!voice) return;
  fadeTo(voice.gain, 0, seconds);
  for (const lg of voice.layerGains) fadeTo(lg, 0, seconds);
  const els = [voice.el, voice.introEl, ...voice.layerEls].filter(Boolean);
  setTimeout(() => {
    for (const el of els) { try { el.pause(); el.currentTime = 0; } catch (e) { /* detached */ } }
  }, seconds * 1000 + 60);
}

function startFile(name) {
  const def = MUSIC_FILES[name];
  if (!def || !ctx) return false;

  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(musicGain);

  const loopEl = makeElement(def.src, true);
  const voice = { name, gain, el: loopEl, introEl: null, layerEls: [], layerGains: [] };

  let failed = false;
  const onError = () => {
    if (failed) return;
    failed = true;
    // One bad file should not silence the game — hand this context to the synth.
    filesUsable = false;
    if (playing === voice) { playing = null; startSequencerFor(name); }
  };
  loopEl.addEventListener('error', onError);

  const attach = (el) => {
    try {
      const node = ctx.createMediaElementSource(el);
      node.connect(gain);
    } catch (e) {
      el.volume = 1;
      el.__direct = true;
    }
  };

  const begin = (el) => {
    attach(el);
    const p = el.play();
    if (p && p.catch) {
      p.catch(() => {
        // Autoplay policy: remember it and start on the next user gesture.
        pendingName = name;
      });
    }
  };

  // A second ambience loop, if this context has one. It is deliberately not
  // wired to `onError`: losing the crowd under the market is not worth
  // dropping the whole context to the synthesiser for.
  for (const layer of def.layers || []) {
    const layerEl = makeElement(layer.src, true);
    const lg = ctx.createGain();
    lg.gain.value = layer.gain ?? 0.3;
    lg.connect(musicGain);
    voice.layerEls.push(layerEl);
    voice.layerGains.push(lg);
    try {
      ctx.createMediaElementSource(layerEl).connect(lg);
    } catch (e) {
      layerEl.volume = layer.gain ?? 0.3;
    }
    const lp = layerEl.play();
    // Refused layers are picked up by `retryPending` on the next gesture,
    // the same as the main loop.
    if (lp && lp.catch) lp.catch(() => { pendingName = name; });
  }

  if (def.intro) {
    const introEl = makeElement(def.intro, false);
    introEl.addEventListener('error', onError);
    voice.introEl = introEl;
    // Hand over to the loop the moment the intro finishes.
    introEl.addEventListener('ended', () => { if (playing === voice) begin(loopEl); });
    begin(introEl);
  } else {
    begin(loopEl);
  }

  playing = voice;
  fadeTo(gain, 1);
  return true;
}

/**
 * Try again to start whatever should be playing. Called on every user gesture
 * and whenever the tab comes back to the front.
 *
 * This is the piece that makes music work on a phone, and it is fussier than
 * it looks. Three things were wrong with the obvious version:
 *
 *   - It cleared the pending flag *before* retrying, so if the retry was also
 *     refused, the next tap had nothing left to retry. One blocked start and
 *     the menu was silent for the rest of the session.
 *   - It only retried when the track was still the one that had been blocked.
 *     A blocked menu theme followed by any other `playMusic` left the new one
 *     unplayed as well.
 *   - It called `play()` in the same tick as `ctx.resume()`. Resuming is
 *     asynchronous, and an element routed through the context is silent until
 *     it has actually resumed, so on iOS the call could "succeed" into nothing.
 *
 * So: retry whatever is current rather than what was blocked, clear the flag
 * only on an actual success, and retry once more after the context reports it
 * has resumed.
 */
function retryPending() {
  const voice = playing;
  if (!voice) { pendingName = null; return; }

  // The intro stinger if it has not finished, otherwise the loop.
  const el = voice.introEl && !voice.introEl.ended ? voice.introEl : voice.el;
  const els = [el, ...voice.layerEls].filter(Boolean);

  for (const target of els) {
    if (!target.paused && !target.ended) continue;      // already going
    const p = target.play();
    if (p && p.then) {
      p.then(() => { if (target === el) pendingName = null; })
        .catch(() => { if (target === el) pendingName = voice.name; });
    } else {
      pendingName = null;
    }
  }
}

// --- sequencer --------------------------------------------------------------
let seqTimer = null;
let nextStepTime = 0;
let step = 0;
let rng = makeRng(1);
let melodyLine = [];               // regenerated every 4 bars so the tune evolves

function initGraph() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  masterGain = ctx.createGain();
  masterGain.gain.value = 0.9;
  masterGain.connect(ctx.destination);

  musicGain = ctx.createGain();
  sfxGain = ctx.createGain();
  voiceGain = ctx.createGain();
  musicGain.connect(masterGain);
  sfxGain.connect(masterGain);
  voiceGain.connect(masterGain);

  // A cheap "space" send — a short feedback delay reads as reverb on chip voices.
  const delay = ctx.createDelay(0.6);
  delay.delayTime.value = 0.19;
  const fb = ctx.createGain(); fb.gain.value = 0.28;
  const wet = ctx.createGain(); wet.gain.value = 0.3;
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2200;
  delay.connect(fb); fb.connect(delay);
  delay.connect(tone); tone.connect(wet); wet.connect(musicGain);
  musicBus = { dry: musicGain, send: delay };

  ready = true;
  applyVolumes();
  loadSfxBank();
}

export function initAudio(opts = {}) {
  Object.assign(state, opts);
  initGraph();
  // Every gesture, for the whole session — not just the first. A browser can
  // refuse the first one and allow the second, and on iOS the audio context
  // can be suspended again by a phone call, a lock screen or a tab switch.
  const resume = () => {
    if (!ctx) return;
    retryPending();
    if (ctx.state !== 'suspended') {
      if (state.synthTrack) startSequencer();
      return;
    }
    const done = ctx.resume();
    // Retry again once it has actually resumed: an element routed through a
    // suspended context plays into silence.
    if (done && done.then) done.then(() => { retryPending(); }, () => {});
    if (state.synthTrack) startSequencer();
  };
  ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click'].forEach((ev) =>
    addEventListener(ev, resume, { passive: true })
  );
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { ctx.suspend(); return; }
    if (!state.musicOn && !state.sfxOn) return;
    const done = ctx.resume();
    if (done && done.then) done.then(() => { retryPending(); }, () => {});
    else retryPending();
  });
}

function applyVolumes() {
  if (!ready) return;
  const t = ctx.currentTime;
  musicGain.gain.setTargetAtTime(state.musicOn ? state.musicVol * 0.55 : 0, t, 0.08);
  sfxGain.gain.setTargetAtTime(state.sfxOn ? state.sfxVol * 0.9 : 0, t, 0.02);
  voiceGain.gain.setTargetAtTime(state.voiceOn ? state.voiceVol : 0, t, 0.02);
}

/** Where voice.js sends its barks. Null until the graph exists. */
export function voiceTarget() {
  return ready && voiceGain ? { ctx, gain: voiceGain } : null;
}

export function setVoiceVolume(v) { state.voiceVol = clamp(v, 0, 1); applyVolumes(); }
export function setVoiceBusEnabled(on) { state.voiceOn = on; applyVolumes(); }

export function setMusicEnabled(on) { state.musicOn = on; applyVolumes(); }
export function setMusicVolume(v) { state.musicVol = clamp(v, 0, 1); applyVolumes(); }
export function setSfxEnabled(on) { state.sfxOn = on; applyVolumes(); }
export function setSfxVolume(v) { state.sfxVol = clamp(v, 0, 1); applyVolumes(); }
export function setIntensity(v) { state.intensity = clamp(v, 0, 1); }

/**
 * Switch the soundtrack. `name` may be a specific key ('boss:parduin'); it falls
 * back to its family ('boss') and finally to the procedural sequencer.
 */
export function playMusic(name) {
  if (state.track === name) return;
  state.track = name;
  if (!ready) initGraph();
  if (!ready) return;

  const key = MUSIC_FILES[name] ? name
    : (name.startsWith('boss') && MUSIC_FILES.boss) ? 'boss'
    : null;

  if (filesUsable && key && canPlayFiles()) {
    stopSequencer();
    if (playing && playing.name === key) return;
    stopVoice(playing);
    if (startFile(key)) return;
  }
  stopVoice(playing);
  playing = null;
  startSequencerFor(name);
}

/** Fall back to the synthesised track that best matches this context. */
function startSequencerFor(name) {
  const base = name.startsWith('boss') ? 'boss' : name;
  const t = TRACKS[base] || TRACKS.battle;
  step = 0;
  rng = makeRng(t.seed);
  melodyLine = [];
  state.synthTrack = base;
  startSequencer();
}

let canPlayCache = null;
function canPlayFiles() {
  if (canPlayCache !== null) return canPlayCache;
  if (typeof Audio === 'undefined') return (canPlayCache = false);
  try {
    canPlayCache = !!new Audio().canPlayType('audio/mpeg');
  } catch (e) {
    canPlayCache = false;
  }
  return canPlayCache;
}

export function stopMusic() {
  state.track = null;
  state.synthTrack = null;
  stopVoice(playing, 0.3);
  playing = null;
  stopSequencer();
}

function stopSequencer() {
  state.synthTrack = null;
  if (seqTimer) { clearInterval(seqTimer); seqTimer = null; }
}

function startSequencer() {
  if (!ready || !state.synthTrack) return;
  if (seqTimer) clearInterval(seqTimer);
  nextStepTime = ctx.currentTime + 0.06;
  seqTimer = setInterval(scheduler, 25);
}

function scheduler() {
  if (!ready || !state.synthTrack) return;
  const t = TRACKS[state.synthTrack];
  if (!t) return;
  const stepDur = 60 / t.bpm / 4;                     // 16th notes
  // Guard against a long tab-suspend leaving nextStepTime far in the past.
  if (nextStepTime < ctx.currentTime - 0.5) nextStepTime = ctx.currentTime;
  while (nextStepTime < ctx.currentTime + 0.12) {
    const swing = (step % 2 === 1) ? stepDur * t.swing : 0;
    scheduleStep(step, nextStepTime + swing, t, stepDur);
    nextStepTime += stepDur;
    step++;
  }
}

function scheduleStep(s, time, t, stepDur) {
  const bar = Math.floor(s / 16);
  const beat = s % 16;
  const chordRoot = t.chords[bar % t.chords.length];
  const intensity = state.intensity;

  if (beat === 0 && bar % 4 === 0) regenerateMelody();

  // --- bass: root on downbeats plus a walking off-beat ---
  if (beat % 4 === 0 || (beat % 8 === 6 && rng() < 0.6)) {
    const deg = chordRoot + (beat % 8 === 6 ? 4 : 0);
    const m = degreeToMidi(t.root, t.scale, deg) + t.bassOct * 12;
    voiceBass(midiToFreq(m), time, stepDur * (beat % 4 === 0 ? 3.2 : 1.4));
  }

  // --- pad or chord stabs ---
  if (t.pad && beat % 8 === 0) {
    [0, 2, 4].forEach((iv, i) => {
      const m = degreeToMidi(t.root, t.scale, chordRoot + iv);
      voicePad(midiToFreq(m), time + i * 0.012, stepDur * 7);
    });
  } else if (!t.pad && (beat === 2 || beat === 10)) {
    [0, 2, 4].forEach((iv) => {
      const m = degreeToMidi(t.root, t.scale, chordRoot + iv);
      voiceStab(midiToFreq(m), time, stepDur * 1.1);
    });
  }

  // --- lead ---
  const note = melodyLine.length ? melodyLine[s % melodyLine.length] : null;
  if (note != null && rng() < t.lead + intensity * 0.15) {
    const m = degreeToMidi(t.root, t.scale, chordRoot + note) + 12;
    voiceLead(midiToFreq(m), time, stepDur * 1.6);
  }

  // --- drums ---
  const d = t.drums * (0.75 + intensity * 0.25);
  if (d > 0) {
    if (beat % 8 === 0) voiceKick(time, d);
    else if (beat === 4 || beat === 12) voiceSnare(time, d);
    else if (beat % 8 === 6 && rng() < 0.35 * d) voiceKick(time, d * 0.7);
    if (beat % 2 === 0 && rng() < 0.75 * d) voiceHat(time, d * (beat % 4 === 0 ? 0.9 : 0.5));
    if (beat === 15 && bar % 4 === 3 && d > 0.5) voiceSnare(time + stepDur * 0.5, d);
  }
}

function regenerateMelody() {
  // A 32-step phrase built from a random walk over the scale, with rests.
  melodyLine = [];
  let deg = 0;
  for (let i = 0; i < 32; i++) {
    if (rng() < 0.34) { melodyLine.push(null); continue; }
    const move = [-2, -1, -1, 0, 1, 1, 2, 3][(rng() * 8) | 0];
    deg = clamp(deg + move, -3, 8);
    melodyLine.push(deg);
  }
  melodyLine[0] = 0;
}

// --- music voices -----------------------------------------------------------
function env(gain, time, attack, decay, peak) {
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(peak, time + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
}

function voiceLead(freq, time, dur) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(freq, time);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.setValueAtTime(3400, time);
  env(g, time, 0.008, dur, 0.16);
  o.connect(f); f.connect(g); g.connect(musicBus.dry); g.connect(musicBus.send);
  o.start(time); o.stop(time + dur + 0.06);
}

function voiceBass(freq, time, dur) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(freq, time);
  const sub = ctx.createOscillator(), sg = ctx.createGain();
  sub.type = 'sine'; sub.frequency.setValueAtTime(freq / 2, time);
  env(g, time, 0.006, dur, 0.28);
  env(sg, time, 0.006, dur * 0.8, 0.18);
  o.connect(g); g.connect(musicBus.dry);
  sub.connect(sg); sg.connect(musicBus.dry);
  o.start(time); o.stop(time + dur + 0.05);
  sub.start(time); sub.stop(time + dur + 0.05);
}

function voicePad(freq, time, dur) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(freq, time);
  o.detune.setValueAtTime(6, time);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(700, time);
  f.frequency.linearRampToValueAtTime(1500, time + dur * 0.5);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(0.07, time + dur * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  o.connect(f); f.connect(g); g.connect(musicBus.dry); g.connect(musicBus.send);
  o.start(time); o.stop(time + dur + 0.05);
}

function voiceStab(freq, time, dur) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(freq, time);
  env(g, time, 0.004, dur, 0.075);
  o.connect(g); g.connect(musicBus.dry); g.connect(musicBus.send);
  o.start(time); o.stop(time + dur + 0.04);
}

let NOISE = null;
function getNoise() {
  if (!NOISE) {
    const len = Math.floor(ctx.sampleRate * 1);
    NOISE = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = NOISE.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return NOISE;
}

function voiceKick(time, amp) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, time);
  o.frequency.exponentialRampToValueAtTime(42, time + 0.11);
  g.gain.setValueAtTime(0.34 * amp, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.19);
  o.connect(g); g.connect(musicBus.dry);
  o.start(time); o.stop(time + 0.2);
}

function voiceSnare(time, amp) {
  const src = ctx.createBufferSource(); src.buffer = getNoise();
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.16 * amp, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
  src.connect(f); f.connect(g); g.connect(musicBus.dry); g.connect(musicBus.send);
  src.start(time); src.stop(time + 0.15);
}

function voiceHat(time, amp) {
  const src = ctx.createBufferSource(); src.buffer = getNoise();
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.05 * amp, time);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
  src.connect(f); f.connect(g); g.connect(musicBus.dry);
  src.start(time); src.stop(time + 0.06);
}

// ---------------------------------------------------------------------------
// Recorded sound effects
// ---------------------------------------------------------------------------
// event -> how many takes shipped. More takes for the sounds that fire most.
const SFX_TAKES = {
  shoot: 2, slash: 2, hit: 3, crit: 2, kill: 2, boom: 4, zap: 3, frost: 3,
  hurt: 2, gem: 1, gold: 3, heal: 2, levelup: 3, chest: 3, select: 1,
  hover: 1, back: 1, deny: 1, boss: 3, spawn: 3, dash: 2, death: 2, win: 2,
  // marketplace
  buy: 3, nofunds: 1, potion: 2, buff: 2, equip: 2, talk: 3,
  // Soft impacts for the player's own blasts, and Mjolnir's hammer.
  thud: 2, hammer: 2,
  'market-open': 1, 'market-close': 1, chime: 2, save: 2, revive: 2,
};

// Which takes ship as Ogg Vorbis rather than WAV.
//
// The Pixel Combat clips were converted to WAV so they could be trimmed and
// normalised; the RPG Maker MZ clips are used as they are, and MZ ships Ogg.
// Re-encoding them to WAV would only make them bigger, so the bank carries
// both and this is the one place that knows which is which. A browser that
// cannot decode Vorbis loses these takes and keeps the WAV ones — and where a
// whole event is Vorbis-only there is still the synthesised fallback, so no
// event can ever go silent.
//
// Written to by the loop below and by `tools/assets/import-rtp-audio.py`'s
// naming convention; `tools/music-smoke.mjs` checks it against the folder.
const OGG_TAKES = new Set([
  'boom-4', 'zap-3', 'frost-3', 'gold-3', 'levelup-3', 'chest-3',
  'boss-3', 'spawn-3', 'buy-3', 'save-2', 'revive-2',
  'thud-1', 'thud-2', 'hammer-1', 'hammer-2',
]);

// Levels, balanced by ear against the music bus.
const SFX_GAIN = {
  hit: 0.34, shoot: 0.32, slash: 0.42, kill: 0.34, gem: 0.3, hover: 0.28,
  // `boom` is now only a boss's ground-shaker. The player's own explosions use
  // `thud`, which is quieter on purpose: a sound that fires every second has to
  // sit under the music, not on top of it.
  crit: 0.6, boom: 0.62, boss: 0.95, hurt: 0.7, death: 0.8, win: 0.8,
  thud: 0.3, hammer: 0.34,
  levelup: 0.7, chest: 0.65, heal: 0.55, gold: 0.4, zap: 0.5, frost: 0.5,
  select: 0.45, back: 0.4, deny: 0.5, spawn: 0.4, dash: 0.45,
  buy: 0.6, nofunds: 0.5, potion: 0.6, buff: 0.6, equip: 0.55, talk: 0.22,
  'market-open': 0.5, 'market-close': 0.45, chime: 0.35, save: 0.55, revive: 0.7,
};

// Minimum seconds between repeats of the same event.
const SFX_GAP = {
  hit: 0.05, shoot: 0.045, slash: 0.06, kill: 0.05, crit: 0.07, gem: 0.03,
  gold: 0.04, hover: 0.05, boom: 0.06, zap: 0.05, frost: 0.08, hurt: 0.14,
  thud: 0.1, hammer: 0.12,
  spawn: 0.2,
  // The typewriter blip fires per character, so it needs the tightest gate here.
  talk: 0.028, chime: 1.2,
};

// Each boss has its own arrival, wind-up, attack and death, so the five are
// distinguishable with your eyes shut. Registered by loop rather than by hand
// because the shape is regular.
const BOSS_SFX_IDS = ['magus', 'demon', 'frosttitan', 'sovereign', 'parduin'];
const BOSS_SFX_EVENTS = ['arrive', 'cast', 'attack', 'die'];
const BOSS_SFX_GAIN = { arrive: 0.95, cast: 0.5, attack: 0.6, die: 0.95, breath: 0.85, wing: 0.7, land: 0.9 };
// When a specific boss sound is unavailable, degrade to the generic event.
const BOSS_SFX_FALLBACK = { arrive: 'boss', cast: 'spawn', attack: 'zap', die: 'boom', breath: 'boom', wing: 'dash', land: 'boom' };

for (const id of BOSS_SFX_IDS) {
  const events = id === 'parduin' ? [...BOSS_SFX_EVENTS, 'breath', 'wing', 'land'] : BOSS_SFX_EVENTS;
  for (const ev of events) {
    const key = `boss-${id}-${ev}`;
    // Two takes each: the Pixel Combat one, and a roar from the RPG Maker
    // library. Alternating between them is what stops a boss that casts every
    // two seconds from sounding like a loop.
    SFX_TAKES[key] = 2;
    OGG_TAKES.add(`${key}-2`);
    SFX_GAIN[key] = BOSS_SFX_GAIN[ev];
    if (ev === 'attack') SFX_GAP[key] = 0.08;
    if (ev === 'cast') SFX_GAP[key] = 0.25;
  }
}

/** Where a take lives. Exported so the tests can check the bank against disk. */
export const sfxFileName = (name, take) =>
  `${name}-${take}.${OGG_TAKES.has(`${name}-${take}`) ? 'ogg' : 'wav'}`;

// UI should sound identical every time; combat should not.
const NO_PITCH_WOBBLE = new Set([
  'select', 'hover', 'back', 'deny', 'levelup', 'win', 'chest',
  'market-open', 'market-close', 'nofunds', 'save',
]);

const sfxBuffers = new Map();
const sfxGate = Object.create(null);
let sfxFilesUsable = true;

/**
 * Fetch the bank, in two waves.
 *
 * There are well over a hundred clips and about six megabytes of them. On a
 * phone, asking for all of it at once means the sounds you need in the first
 * ten seconds are queued behind twenty-three boss roars you will not hear for
 * four minutes. So the everyday sounds go first and the rest follow once the
 * first wave has had the connection to itself for a moment.
 *
 * Nothing waits on either wave: an event with no clip yet plays its
 * synthesised version, which is the same path a failed download takes.
 */
const LATE_SFX = /^boss-|^win$|^death$|^revive$/;

function fetchTake(name, i) {
  const url = new URL(`../../audio/sfx/${sfxFileName(name, i)}`, import.meta.url).href;
  return fetch(url)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
    .then((b) => ctx.decodeAudioData(b))
    .then((buf) => sfxBuffers.set(`${name}:${i}`, buf))
    .catch(() => { /* this take stays synthesised */ });
}

function loadSfxBank() {
  if (!ready || typeof fetch === 'undefined') return;
  const names = Object.keys(SFX_TAKES);
  const early = names.filter((n) => !LATE_SFX.test(n));
  const late = names.filter((n) => LATE_SFX.test(n));

  const wave = (list) => list.forEach((name) => {
    for (let i = 1; i <= SFX_TAKES[name]; i++) fetchTake(name, i);
  });

  wave(early);
  // Long enough for the first wave to be in flight, short enough that the
  // first boss is nowhere near.
  setTimeout(() => wave(late), 3000);
}

/** Returns true if a recorded take played. */
function playSample(name) {
  const takes = SFX_TAKES[name];
  if (!sfxFilesUsable || !takes) return false;

  const pool = [];
  for (let i = 1; i <= takes; i++) {
    const buf = sfxBuffers.get(`${name}:${i}`);
    if (buf) pool.push(buf);
  }
  if (!pool.length) return false;

  const src = ctx.createBufferSource();
  src.buffer = pool[(Math.random() * pool.length) | 0];
  if (!NO_PITCH_WOBBLE.has(name)) src.playbackRate.value = 0.94 + Math.random() * 0.12;
  const g = ctx.createGain();
  g.gain.value = SFX_GAIN[name] ?? 0.5;
  src.connect(g);
  g.connect(sfxGain);
  src.start();
  return true;
}

// --- synthesised fallbacks --------------------------------------------------
const lastPlayed = Object.create(null);

function throttle(name, gap) {
  const now = ctx ? ctx.currentTime : 0;
  if (lastPlayed[name] !== undefined && now - lastPlayed[name] < gap) return false;
  lastPlayed[name] = now;
  return true;
}

function beep({ type = 'square', from, to, dur = 0.1, vol = 0.2, at = 0, filter = 0 }) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  if (to && to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filter;
    o.connect(f); node = f;
  }
  node.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + dur + 0.02);
}

function noiseBurst({ dur = 0.2, vol = 0.2, hp = 0, lp = 20000, at = 0, sweep = 0 }) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource(); src.buffer = getNoise();
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = src;
  if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
  const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass';
  lpf.frequency.setValueAtTime(lp, t);
  if (sweep) lpf.frequency.exponentialRampToValueAtTime(Math.max(80, sweep), t + dur);
  node.connect(lpf); lpf.connect(g); g.connect(sfxGain);
  src.start(t); src.stop(t + dur + 0.02);
}

const SFX = {
  shoot: () => throttle('shoot', 0.045) && beep({ type: 'square', from: 900, to: 320, dur: 0.07, vol: 0.075 }),
  slash: () => throttle('slash', 0.06) && noiseBurst({ dur: 0.13, vol: 0.10, hp: 1200, lp: 9000, sweep: 1500 }),
  hit: () => throttle('hit', 0.05) && beep({ type: 'triangle', from: 190, to: 70, dur: 0.07, vol: 0.10 }),
  crit: () => throttle('crit', 0.07) && (beep({ type: 'square', from: 1500, to: 500, dur: 0.09, vol: 0.10 }), beep({ type: 'sine', from: 2400, to: 900, dur: 0.11, vol: 0.06, at: 0.01 })),
  kill: () => throttle('kill', 0.05) && noiseBurst({ dur: 0.12, vol: 0.07, hp: 500, lp: 6000, sweep: 400 }),
  boom: () => throttle('boom', 0.06) && (beep({ type: 'sine', from: 220, to: 34, dur: 0.55, vol: 0.32 }), noiseBurst({ dur: 0.4, vol: 0.22, lp: 5000, sweep: 200 })),
  // A dull whump: a low sine with no click on the front, and noise rolled off
  // hard so there is no crack in it. This is the one that repeats.
  thud: () => throttle('thud', 0.1) && (beep({ type: 'sine', from: 132, to: 46, dur: 0.26, vol: 0.16 }), noiseBurst({ dur: 0.18, vol: 0.06, lp: 900, sweep: 180 })),
  // Struck metal: a short ring over a body hit.
  hammer: () => throttle('hammer', 0.12) && (beep({ type: 'triangle', from: 520, to: 190, dur: 0.2, vol: 0.16 }), beep({ type: 'sine', from: 150, to: 60, dur: 0.24, vol: 0.14 })),
  zap: () => throttle('zap', 0.05) && (beep({ type: 'sawtooth', from: 2600, to: 400, dur: 0.13, vol: 0.10, filter: 4000 }), noiseBurst({ dur: 0.1, vol: 0.06, hp: 3000 })),
  frost: () => throttle('frost', 0.08) && (beep({ type: 'sine', from: 1800, to: 3200, dur: 0.25, vol: 0.09 }), noiseBurst({ dur: 0.3, vol: 0.07, hp: 4000 })),
  hurt: () => throttle('hurt', 0.14) && beep({ type: 'sawtooth', from: 340, to: 90, dur: 0.2, vol: 0.2, filter: 1400 }),
  gem: () => throttle('gem', 0.03) && beep({ type: 'sine', from: 1050, to: 1550, dur: 0.06, vol: 0.06 }),
  gold: () => throttle('gold', 0.04) && (beep({ type: 'square', from: 1300, to: 1900, dur: 0.06, vol: 0.055 }), beep({ type: 'square', from: 1900, to: 2500, dur: 0.05, vol: 0.04, at: 0.05 })),
  heal: () => (beep({ type: 'sine', from: 500, to: 900, dur: 0.16, vol: 0.12 }), beep({ type: 'sine', from: 750, to: 1300, dur: 0.2, vol: 0.09, at: 0.07 })),
  levelup: () => [523, 659, 784, 1047].forEach((f, i) => beep({ type: 'square', from: f, dur: 0.2, vol: 0.11, at: i * 0.09 })),
  chest: () => [659, 784, 988, 1175, 1568].forEach((f, i) => beep({ type: 'square', from: f, dur: 0.18, vol: 0.09, at: i * 0.07 })),
  select: () => beep({ type: 'square', from: 720, to: 980, dur: 0.06, vol: 0.09 }),
  hover: () => throttle('hover', 0.05) && beep({ type: 'square', from: 480, dur: 0.03, vol: 0.045 }),
  back: () => beep({ type: 'square', from: 520, to: 320, dur: 0.08, vol: 0.08 }),
  deny: () => beep({ type: 'square', from: 200, to: 130, dur: 0.16, vol: 0.1 }),
  boss: () => { noiseBurst({ dur: 1.1, vol: 0.22, lp: 900, sweep: 120 }); beep({ type: 'sawtooth', from: 90, to: 45, dur: 1.2, vol: 0.22, filter: 500 }); },
  spawn: () => throttle('spawn', 0.2) && beep({ type: 'sawtooth', from: 120, to: 300, dur: 0.22, vol: 0.09, filter: 900 }),
  dash: () => noiseBurst({ dur: 0.2, vol: 0.1, hp: 800, lp: 8000, sweep: 900 }),
  death: () => [392, 330, 262, 196].forEach((f, i) => beep({ type: 'square', from: f, dur: 0.34, vol: 0.13, at: i * 0.16 })),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => beep({ type: 'square', from: f, dur: 0.3, vol: 0.12, at: i * 0.11 })),

  // --- marketplace ---
  buy: () => [880, 1175, 1568].forEach((f, i) => beep({ type: 'square', from: f, dur: 0.12, vol: 0.08, at: i * 0.05 })),
  nofunds: () => (beep({ type: 'square', from: 260, to: 190, dur: 0.1, vol: 0.09 }), beep({ type: 'square', from: 190, to: 120, dur: 0.16, vol: 0.09, at: 0.1 })),
  potion: () => (beep({ type: 'sine', from: 620, to: 1180, dur: 0.28, vol: 0.11 }), beep({ type: 'sine', from: 930, to: 1560, dur: 0.3, vol: 0.07, at: 0.09 })),
  buff: () => [659, 880, 1109].forEach((f, i) => beep({ type: 'triangle', from: f, to: f * 1.5, dur: 0.24, vol: 0.09, at: i * 0.06 })),
  equip: () => (beep({ type: 'square', from: 420, to: 700, dur: 0.09, vol: 0.09 }), noiseBurst({ dur: 0.1, vol: 0.06, hp: 2600, at: 0.03 })),
  talk: () => throttle('talk', 0.028) && beep({ type: 'square', from: 620 + Math.random() * 200, dur: 0.022, vol: 0.035 }),
  'market-open': () => [523, 784].forEach((f, i) => beep({ type: 'square', from: f, dur: 0.11, vol: 0.08, at: i * 0.06 })),
  'market-close': () => beep({ type: 'square', from: 620, to: 380, dur: 0.11, vol: 0.07 }),
  chime: () => throttle('chime', 1.2) && [1568, 2093].forEach((f, i) => beep({ type: 'sine', from: f, dur: 0.4, vol: 0.05, at: i * 0.12 })),
  save: () => [784, 1047, 1319].forEach((f, i) => beep({ type: 'sine', from: f, dur: 0.3, vol: 0.08, at: i * 0.08 })),
  revive: () => [392, 523, 659, 784].forEach((f, i) => beep({ type: 'triangle', from: f, dur: 0.36, vol: 0.1, at: i * 0.1 })),
};

export function sfx(name) {
  if (!ready || !state.sfxOn || !ctx || ctx.state === 'suspended') return;

  const gap = SFX_GAP[name];
  if (gap !== undefined) {
    const now = ctx.currentTime;
    if (now - (sfxGate[name] || -999) < gap) return;
    sfxGate[name] = now;
  }

  try {
    if (playSample(name)) return;
  } catch (e) { /* fall through */ }

  // A boss sound that has not loaded degrades to its generic equivalent rather
  // than to silence.
  if (name.startsWith('boss-')) {
    const generic = BOSS_SFX_FALLBACK[name.slice(name.lastIndexOf('-') + 1)];
    if (generic) {
      try { if (playSample(generic)) return; } catch (e) { /* fall through */ }
      const gfn = SFX[generic];
      if (gfn) { try { gfn(); } catch (e) { /* nodes can fail */ } }
      return;
    }
  }

  const fn = SFX[name];
  if (fn) { try { fn(); } catch (e) { /* nodes can fail while tab-switching */ } }
}
