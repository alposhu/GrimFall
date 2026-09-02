// ---------------------------------------------------------------------------
// main.js — boot, the frame loop and the wiring between UI, input and the run.
// ---------------------------------------------------------------------------

import { clamp } from './core/util.js';
import * as store from './core/storage.js';
import {
  initAudio, playMusic, sfx, setMusicEnabled, setMusicVolume,
  setSfxEnabled, setSfxVolume, setVoiceVolume, setVoiceBusEnabled,
} from './core/audio.js';
import { setVoiceEnabled } from './core/voice.js';
import { initInput, setJoystickMode, showJoystick, resetStick, consumePressed, clearPressed, IS_TOUCH } from './core/input.js';
import { initQuality, setQualityMode, sampleFrame, canvasSize } from './core/quality.js';
import { CHARACTERS, heroSprites, heroPortrait } from './art/hero.js';
import { preloadHeroSheets, loadedSheets } from './art/sheets.js';
import { preloadRtp, loadedAtlases, rtpFolkCount } from './art/rtp.js';
import { folkSprites, FOLK_COUNT } from './art/folk.js';
import { MOB_KEYS, CHAMPION_KEYS, mobSprite, championSprite } from './art/bestiary.js';
import { REDESIGNED, bossArt, bossPortraitArt } from './art/bosses.js';
import { dragonParts } from './art/dragon.js';
import { propSprite, pickupSprite, iconSprite } from './art/props.js';
import { budgieSprite, BUDGIE_IDS, BUDGIE_FRAMES } from './art/familiars.js';
import { FOOD_IDS, foodSprite } from './art/food.js';
import { BIOMES } from './game/world.js';
import { WEAPONS, WEAPON_IDS, PASSIVES, PASSIVE_IDS } from './game/config.js';
import { S } from './game/state.js';
import { render, renderBackdrop } from './game/render.js';
import { renderCutscene, skipCutscene } from './game/cutscene.js';
import { playIntro } from './game/intro.js';
import {
  startRun, startArena, endRun, update, updateCamera, computeView, on,
  suspendForMarket, resumeFromMarket, saveRun, loadRun,
} from './game/game.js';
import { M, enterMarket, updateMarket, interact, closeShop } from './game/market.js';
import { renderMarket } from './game/marketRender.js';
import { useFlask, FLASK_IDS } from './game/shop.js';
import { STALL_KINDS, PROP_KINDS, VENDOR_IDS, stallSprite, marketProp, vendorSprite, cobbleTile } from './art/market.js';
import { ITEM_ICONS, itemIcon, goodIcon, GOOD_ICONS } from './art/items.js';
const GOOD_IDS = Object.keys(GOOD_ICONS);
import { BALLOON_KINDS, balloonGlyph, balloonBubble } from './art/balloons.js';
import * as ui from './ui/ui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

let zoom = 1;
let cssW = 0, cssH = 0;
let mode = 'boot';           // 'boot' | 'intro' | 'menu' | 'run' | 'market'
let lastTime = 0;
let attractT = 0;
let levelUpOpen = false;

// ---------------------------------------------------------------------------
// Canvas sizing
// ---------------------------------------------------------------------------
function resize() {
  // On iOS the toolbar slides away as you play, so trust the visual viewport
  // when it exists rather than window.innerHeight.
  const vv = window.visualViewport;
  cssW = Math.round(vv?.width || window.innerWidth);
  cssH = Math.round(vv?.height || window.innerHeight);

  // The quality tier caps the backing store: honouring a 3x phone screen would
  // mean filling four million pixels a frame for no visible gain.
  const { w, h, dpr } = canvasSize(cssW, cssH);
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  // Keep a comparable slice of the world visible on any screen: phones zoom in
  // a little, large screens zoom out, and neither ends up rendering an
  // unreasonable amount of world.
  zoom = dpr * clamp(Math.min(cssW, cssH) / 480, 0.85, 1.6);
  ctx.imageSmoothingEnabled = false;
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 150));
window.visualViewport?.addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// Boot: build every sprite up front so the first frame of a run never stutters
// ---------------------------------------------------------------------------
function* bootTasks() {
  for (const ch of CHARACTERS) { heroSprites(ch.id, 3); heroPortrait(ch.id, 4); yield; }
  for (const k of MOB_KEYS) { mobSprite(k, 2); yield; }
  for (const k of CHAMPION_KEYS) { championSprite(k, 2); yield; }
  for (const k of REDESIGNED) { bossArt(k, 2); bossPortraitArt(k, 1); yield; }
  dragonParts(2); yield;
  for (const b of BIOMES) {
    for (const [kind] of b.props) for (let v = 0; v < 4; v++) propSprite(kind, v, b.tint, 2);
    for (const [kind] of b.decor) for (let v = 0; v < 4; v++) propSprite(kind, v, b.tint, 2);
    yield;
  }
  for (const k of ['gem1', 'gem2', 'gem3', 'coin', 'heart', 'magnet', 'bombpick', 'chest']) {
    pickupSprite(k, 2); pickupSprite(k, 3); yield;
  }
  for (const k of FOOD_IDS) { foodSprite(k, 2); foodSprite(k, 3); yield; }
  for (let v = 0; v < 4; v++) { cobbleTile(v, 32); yield; }
  for (const k of STALL_KINDS) { stallSprite(k, 2); yield; }
  for (const k of PROP_KINDS) { marketProp(k, 2); yield; }
  for (const k of VENDOR_IDS) { vendorSprite(k, 3); yield; }
  for (let v = 0; v < FOLK_COUNT; v++) { folkSprites(v, 3); folkSprites(v, 2); yield; }
  // Warmed by good id, which is what the shop asks for, rather than by drawn
  // icon name — otherwise the first shop opened would rasterise on the frame it
  // opened on.
  for (const id of GOOD_IDS) { goodIcon(id, 3); yield; }
  for (const k of ITEM_ICONS) { itemIcon(k, 2); yield; }
  balloonBubble(1.4); balloonBubble(1.6); balloonBubble(1.7); balloonBubble(2);
  for (const k of BALLOON_KINDS) { balloonGlyph(k, 1.4); balloonGlyph(k, 1.6); balloonGlyph(k, 1.7); balloonGlyph(k, 2); yield; }
  // Every weapon, its evolution and every passive — derived from the tables so
  // a new weapon cannot be added without its icon being warmed with it.
  for (const id of WEAPON_IDS) { iconSprite(WEAPONS[id].icon, 4); iconSprite(WEAPONS[id].evolution.icon, 4); yield; }
  for (const id of [...PASSIVE_IDS, 'luck']) { iconSprite(PASSIVES[id]?.icon || id, 4); yield; }
  // The flock. Every frame, both facings, both palettes — a budgie appears the
  // instant its card is taken, and rasterising sixteen frames on that frame is
  // exactly the hitch you would notice.
  for (const id of BUDGIE_IDS) {
    for (let f = 0; f < BUDGIE_FRAMES; f++) {
      for (const west of [false, true]) {
        budgieSprite(id, f, 2, west, false);
        budgieSprite(id, f, 2, west, true);
      }
    }
    yield;
  }
}

async function boot() {
  store.load();
  resize();

  const st = store.settings();
  initQuality(st.quality, () => resize());
  resize();
  initAudio({
    musicOn: st.music, musicVol: st.musicVol,
    sfxOn: st.sfx, sfxVol: st.sfxVol,
    voiceOn: st.voice, voiceVol: st.voiceVol,
  });
  setVoiceEnabled(st.voice);

  initInput({
    zoneEl: document.getElementById('joystick'),
    baseEl: document.getElementById('joyBase'),
    thumbEl: document.getElementById('joyThumb'),
  });
  setJoystickMode(resolveJoystick(st.joystick));

  ui.initUI({
    onSkipCutscene: skipCutscene,
    onStart: beginRun,
    onStartArena: beginArena,
    onPause: togglePause,
    onResume: () => setPaused(false),
    onAbandon: () => { endRun('dead'); },
    onTitle: toTitle,
    onLevelUpDone: () => { levelUpOpen = false; },
    onSetting: applySetting,
    // marketplace
    onInteract: () => {
      const r = interact();
      if (r?.kind === 'vendor') ui.openShop(r.vendor);
    },
    onLeaveShop: closeShop,
    onDrinkFlask: drinkFlask,
    // saves
    onSaveRun: (slot) => saveRun(slot),
    onLoadRun: resumeSaved,
    // An imported backup changes gold, unlocks and records, so the menus
    // that display them have to be rebuilt rather than left stale.
    onProgressImported: () => { ui.refreshMeta?.(); },
  });

  // Hand-drawn character art has to finish decoding before any sprite is
  // warmed, or the cache would fill with the fallback versions of characters
  // that do have artwork. This never rejects: a sheet that cannot load simply
  // leaves that hero drawn in code.
  // The market's artwork decodes in the same breath. Both always resolve, so
  // a blocked file costs that one thing its art and nothing else.
  await Promise.all([preloadHeroSheets(), preloadRtp()]);

  // The generator is consumed a few milliseconds at a time so the progress bar
  // animates instead of the page freezing while sprites are rasterised.
  const gen = bootTasks();
  const total = CHARACTERS.length + MOB_KEYS.length + CHAMPION_KEYS.length +
    REDESIGNED.length + 1 + BIOMES.length + 8 + FOOD_IDS.length +
    WEAPON_IDS.length + PASSIVE_IDS.length + 1 +
    4 + STALL_KINDS.length + PROP_KINDS.length + VENDOR_IDS.length + FOLK_COUNT +
    ITEM_ICONS.length + GOOD_IDS.length + BALLOON_KINDS.length + BUDGIE_IDS.length;
  let done = 0;
  await new Promise((resolve) => {
    const step = () => {
      const started = performance.now();
      while (performance.now() - started < 8) {
        const r = gen.next();
        if (r.done) { ui.setBootProgress(1); resolve(); return; }
        done++;
        ui.setBootProgress(Math.min(0.99, done / total));
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  const drawn = loadedSheets();
  if (drawn.length) console.info(`Grimfall: hand-drawn character art loaded for ${drawn.join(', ')}.`);
  const atlases = loadedAtlases();
  if (atlases.length) {
    console.info(`Grimfall: market art loaded (${atlases.join(', ')}); ${rtpFolkCount()} townsfolk.`);
  }

  await new Promise((r) => setTimeout(r, 260));

  // The cinematic, then the menu. `playIntro` always resolves — a missing
  // video, a blocked autoplay, a thrown frame all land on the title screen
  // just the same, so this can never be the thing that stops the game booting.
  ui.hideAll();
  mode = 'intro';
  const how = await playIntro({ canvas, ctx });
  if (how !== 'none') console.info(`Grimfall: intro (${how}).`);

  toTitle();
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// Mode transitions
// ---------------------------------------------------------------------------
function toTitle() {
  mode = 'menu';
  S.running = false;
  S.paused = false;
  showJoystick(false);
  ui.showTitle();
  playMusic('menu');
}

function beginRun(charId, difficulty) {
  mode = 'run';
  levelUpOpen = false;
  startRun(charId, difficulty);
  ui.showHUD(true);
  showJoystick(IS_TOUCH);
  clearPressed();
  requestWakeLock();
  if (IS_TOUCH && store.settings().joystick !== 'fixed') {
    showToastHint('Drag anywhere to move');
  }
}

function showToastHint(text) {
  S.toast = { text, color: '#ffd75e', life: 3.2, maxLife: 3.2 };
}

// --- keep the screen awake during a run -------------------------------------
let wakeLock = null;
async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) { /* unsupported or denied */ }
}
function releaseWakeLock() {
  try { wakeLock?.release(); } catch (e) { /* already gone */ }
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Coming back to a phone game mid-swarm is how runs get lost to a phone call.
    if (mode === 'run' && S.running && !S.paused && !levelUpOpen) setPaused(true);
    releaseWakeLock();
  } else if (mode === 'run' && S.running) {
    requestWakeLock();
  }
});

function beginArena(charId, difficulty, bossId) {
  mode = 'run';
  levelUpOpen = false;
  startArena(charId, difficulty, bossId);
  ui.showHUD(true);
  showJoystick(IS_TOUCH);
  clearPressed();
  requestWakeLock();
}

function resumeSaved(slot) {
  if (!loadRun(slot)) return false;
  mode = 'run';
  levelUpOpen = false;
  ui.showHUD(true);
  showJoystick(IS_TOUCH);
  clearPressed();
  requestWakeLock();
  return true;
}

// ---------------------------------------------------------------------------
// The market
// ---------------------------------------------------------------------------
function toMarket() {
  const info = suspendForMarket();
  mode = 'market';
  ui.showHUD(false);
  ui.showMarketBar(true);
  showJoystick(IS_TOUCH);
  clearPressed();
  // The market is the game's checkpoint: arriving here writes the autosave.
  const saved = saveRun('auto');
  enterMarket({
    visit: info.visit,
    bossName: info.bossName,
    onExit: () => {
      ui.closeShop();
      ui.showMarketBar(false);
      ui.showHUD(true);
      mode = 'run';
      resumeFromMarket();
    },
  });
  ui.announceMarket(info, saved);
}

function setPaused(on) {
  if (!S.running) return;
  S.paused = on;
  if (on) { resetStick(); ui.openPause(); sfx('back'); }
  else { ui.hideAll(); sfx('select'); }
}

function togglePause() {
  if (!S.running || levelUpOpen) return;
  setPaused(!S.paused);
}

function applySetting(key, value) {
  switch (key) {
    case 'music': setMusicEnabled(value); break;
    case 'musicVol': setMusicVolume(value); break;
    case 'sfx': setSfxEnabled(value); break;
    case 'sfxVol': setSfxVolume(value); break;
    case 'voice': setVoiceEnabled(value); setVoiceBusEnabled(value); break;
    case 'voiceVol': setVoiceVolume(value); break;
    case 'joystick': setJoystickMode(resolveJoystick(value)); break;
    case 'quality': setQualityMode(value); resize(); break;
  }
}

/** 'auto' means: a floating stick under your thumb on touch, a pad otherwise. */
function resolveJoystick(mode) {
  if (mode === 'fixed' || mode === 'dynamic') return mode;
  return IS_TOUCH ? 'dynamic' : 'fixed';
}

on('runEnd', (payload) => {
  mode = 'menu';
  showJoystick(false);
  releaseWakeLock();
  ui.showResults(payload);
});

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
  lastTime = now;

  handleKeys();

  const settings = store.settings();
  const opts = { shakeEnabled: settings.screenShake };
  const frameStart = performance.now();

  if (mode === 'market') {
    const view = computeView(canvas.width, canvas.height, zoom);
    updateMarket(dt, { w: canvas.width / zoom, h: canvas.height / zoom });
    renderMarket(ctx, canvas, zoom);
    ui.updateMarketBar();
    void view;
  } else if (mode === 'run' && S.player) {
    const view = computeView(canvas.width, canvas.height, zoom);
    S.view = view;
    if (!S.paused && !levelUpOpen) {
      update(dt, view);
      updateCamera(dt, canvas.width, canvas.height);
    }
    render(ctx, canvas, zoom, opts);
    if (S.cutscene) renderCutscene(ctx, canvas.width, canvas.height);
    ui.updateHUD();
    ui.showSkip(!!S.cutscene);

    if (S.pendingLevels > 0 && !levelUpOpen && S.running) {
      levelUpOpen = true;
      resetStick();
      ui.openLevelUp();
    }
    // A defeated boss clears the road to the market — but only once the
    // level-ups its death earned have been taken.
    if (S.pendingMarket && !levelUpOpen && S.pendingLevels === 0 && S.running && !S.paused) {
      toMarket();
    }
  } else {
    attractT += dt;
    renderBackdrop(ctx, canvas, zoom * 0.9, attractT);
  }

  sampleFrame(performance.now() - frameStart);
}

function handleKeys() {
  // Any key gets you past a boss entrance you have already seen.
  if (S.cutscene) {
    if (consumePressed('Escape') || consumePressed('Space') || consumePressed('Enter')) skipCutscene();
    return;
  }

  if (mode === 'market') {
    if (consumePressed('Escape')) {
      if (M.talking) { ui.closeShop(); closeShop(); }
    }
    if (consumePressed('Space') || consumePressed('Enter') || consumePressed('KeyE')) {
      if (M.talking) { ui.closeShop(); closeShop(); }
      else {
        const r = interact();
        if (r?.kind === 'vendor') ui.openShop(r.vendor);
      }
    }
    return;
  }

  if (consumePressed('Escape') || consumePressed('KeyP')) {
    if (mode === 'run' && !levelUpOpen) togglePause();
    else if (ui.currentScreen() && !['titleScreen', 'levelScreen'].includes(ui.currentScreen())) ui.back();
  }
  // Digits pick a level-up card while the draft is open, and drink from the
  // belt while it is not. The two are never on screen at the same time.
  if (levelUpOpen) {
    for (let i = 1; i <= 4; i++) {
      if (consumePressed(`Digit${i}`)) {
        const cards = document.querySelectorAll('#cards .card');
        cards[i - 1]?.click();
      }
    }
  } else if (mode === 'run' && S.running && !S.paused) {
    for (let i = 0; i < FLASK_IDS.length; i++) {
      if (consumePressed(`Digit${i + 1}`)) drinkFlask(FLASK_IDS[i]);
    }
  }
}

function drinkFlask(id) {
  if (useFlask(id)) sfx('potion');
  else sfx('nofunds');
}

boot();
