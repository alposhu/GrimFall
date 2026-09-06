// ---------------------------------------------------------------------------
// main.js — boot, the frame loop and the wiring between UI, input and the run.
// ---------------------------------------------------------------------------

import { clamp, seedRandom } from './core/util.js';
import * as store from './core/storage.js';
import {
  initAudio, playMusic, sfx, setMusicEnabled, setMusicVolume,
  setSfxEnabled, setSfxVolume, setVoiceVolume, setVoiceBusEnabled,
} from './core/audio.js';
import { setVoiceEnabled } from './core/voice.js';
import { initInput, setJoystickMode, showJoystick, resetStick, consumePressed, clearPressed, pollInput, input, IS_TOUCH } from './core/input.js';
import { initQuality, setQualityMode, sampleFrame, canvasSize } from './core/quality.js';
import { CHARACTERS, heroSprites, heroPortrait } from './art/hero.js';
import { preloadHeroSheets, loadedSheets } from './art/sheets.js';
import { preloadRtp, loadedAtlases, rtpFolkCount } from './art/rtp.js';
import { preloadInterface, PRELOAD_STEPS } from './core/preload.js';
import { folkSprites, FOLK_COUNT } from './art/folk.js';
import { MOB_KEYS, CHAMPION_KEYS, mobSprite, championSprite } from './art/bestiary.js';
import { REDESIGNED, bossArt, bossPortraitArt } from './art/bosses.js';
import { dragonParts } from './art/dragon.js';
import { propSprite, pickupSprite, iconSprite } from './art/props.js';
import { budgieSprite, BUDGIE_IDS, BUDGIE_FRAMES } from './art/familiars.js';
import { FOOD_IDS, foodSprite } from './art/food.js';
import { BIOMES } from './game/world.js';
import { WEAPONS, WEAPON_IDS, PASSIVES, PASSIVE_IDS } from './game/config.js';
import { S, showBanner } from './game/state.js';
import { render, renderBackdrop } from './game/render.js';
import { renderTitle, resetTitle } from './game/title.js';
import { setWorldSeed } from './game/world.js';
import { startCoopRun, endCoopRun, tickCoop, setPauseHandler, session } from './net/coopRun.js';
import * as netlink from './net/connection.js';
import { renderCutscene, skipCutscene } from './game/cutscene.js';
import {
  startRun, startArena, endRun, update, updateCamera, computeView, on,
  suspendForMarket, resumeFromMarket, pressOn, saveRun, loadRun,
} from './game/game.js';
import { M, enterMarket, updateMarket, interact, closeShop } from './game/market.js';
import { renderMarket } from './game/marketRender.js';
import { enterHub, updateHub, hubTarget, talkToFolk, goToArea, beginLeaving } from './game/hub.js';
import { renderHub } from './game/hubRender.js';
import { joinHubNet, leaveHubNet, tickHubNet, handleHubRelay, inHubNet } from './net/hubNet.js';
import { useFlask, FLASK_IDS } from './game/shop.js';
import { STALL_KINDS, PROP_KINDS, VENDOR_IDS, stallSprite, marketProp, vendorSprite, cobbleTile } from './art/market.js';
import { ITEM_ICONS, itemIcon, goodIcon, GOOD_ICONS } from './art/items.js';
const GOOD_IDS = Object.keys(GOOD_ICONS);
import { BALLOON_KINDS, balloonGlyph, balloonBubble } from './art/balloons.js';
import * as ui from './ui/ui.js';
import { initCursor } from './ui/cursor.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

let zoom = 1;
const VIEW_SHORT = 340;     // world units across the shorter side of the viewport
let lastW = -1, lastH = -1;  // the backing store we last asked for
let cssW = 0, cssH = 0;
let mode = 'boot';           // 'boot' | 'intro' | 'menu' | 'run' | 'market' | 'hub'
let lastTime = 0;
let attractT = 0;
let levelUpOpen = false;
let portalOpen = false;      // the portal's two doors are up
// Someone else is choosing an upgrade. Held as a set of who, not a flag, so two
// players levelling at once cannot have the first to finish unpause the second.
const pausedBy = new Set();
let teamPaused = false;
let netHudOn = false;

// ---------------------------------------------------------------------------
// Canvas sizing
// ---------------------------------------------------------------------------
function resize() {
  // Measured from the element, not from the window.
  //
  // This used to size the canvas from `visualViewport` and then write the
  // result back as an inline width and height - which overrode the `100%` in
  // the stylesheet, so the moment the two disagreed the canvas stopped filling
  // its box and the gap showed as a black band down the edge. They disagree
  // more often than you would think: a hidden scrollbar, a fractional device
  // pixel, and on a phone the whole time the toolbar is sliding.
  //
  // Reading the box back instead means CSS owns the LAYOUT (#app is inset to
  // the viewport with a `dvh` fallback, and #game fills it) and this owns the
  // RESOLUTION. They cannot contradict each other, because only one of them is
  // deciding.
  cssW = Math.round(canvas.clientWidth || window.innerWidth);
  cssH = Math.round(canvas.clientHeight || window.innerHeight);

  // The quality tier caps the backing store: honouring a 3x phone screen would
  // mean filling four million pixels a frame for no visible gain.
  const { w, h, dpr } = canvasSize(cssW, cssH);

  // Assigning `canvas.width` reallocates the backing store and wipes the
  // canvas EVEN WHEN THE VALUE IS UNCHANGED, so it is guarded rather than set
  // every time. This matters on iOS specifically: the address bar slides in and
  // out as you play, the visual viewport reports a resize for every frame of
  // that animation, and the game was throwing away and re-allocating a
  // multi-megapixel buffer on each one - in the middle of a fight, which is
  // exactly when the toolbar tends to move.
  if (w !== lastW || h !== lastH) {
    canvas.width = w;
    canvas.height = h;
    lastW = w;
    lastH = h;
  }

  // How many world units fit across the SHORTER side of the screen. Tying the
  // scale to the short side is what makes a phone in portrait and a monitor in
  // landscape the same game: whichever way the screen is turned, the direction
  // you can see least far is the one that decides how much warning you get.
  //
  // The old constants were 480 with a floor of 0.85, and the floor was doing
  // all the work - every phone landed on it and every desktop on the 1.6
  // ceiling, so the two were effectively hard-coded. A mob came out 26 CSS
  // pixels on a phone against 48 on a desktop: half the size, on the smaller
  // screen, which is the wrong way round. Pixel art that small stops reading as
  // a creature at arm's length.
  //
  // 340 keeps the desktop exactly where it was (the ceiling still binds
  // anywhere the short side is 544px or more) and lifts a phone to a mob of
  // about 34px. That does mean a phone sees less ground than it used to - it
  // has to, because the screen is smaller and something has to give - but the
  // enemy spawn radius is derived from the view, so they still arrive from just
  // off-screen rather than materialising in your lap.
  zoom = dpr * clamp(Math.min(cssW, cssH) / VIEW_SHORT, 1.0, 1.6);
  ctx.imageSmoothingEnabled = false;
  resetTitle();      // its buffer is sized to the canvas, so it cannot outlive one
}
// Coalesced. A window resize is a drag on a desktop and a sliding toolbar on a
// phone, and both arrive as a burst of events describing sizes nobody will ever
// see - only the last one is real. Boot calls `resize` directly, so the first
// frame is never delayed by this.
let resizeTimer = null;
function resizeSoon() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resize, 120);
}
addEventListener('resize', resizeSoon);
addEventListener('orientationchange', () => setTimeout(resize, 150));
window.visualViewport?.addEventListener('resize', resizeSoon);

// ---------------------------------------------------------------------------
// Boot: build every sprite up front so the first frame of a run never stutters
// ---------------------------------------------------------------------------
function* bootTasks() {
  for (const ch of CHARACTERS) { heroSprites(ch.id, 3); heroPortrait(ch.id, 4); yield; }
  for (const k of MOB_KEYS) { mobSprite(k); yield; }
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
  initCursor();
  setJoystickMode(resolveJoystick(st.joystick));

  ui.initUI({
    onSkipCutscene: skipCutscene,
    // A room stops being a form the moment there is somebody in it, so that is
    // when the hall opens and the party panel steps aside. This is the ONLY
    // way in: the hall is the lobby, not a place on the menu.
    onCoopRoom: toHub,
    onStart: beginRun,
    onStartArena: beginArena,
    onPause: togglePause,
    onResume: () => setPaused(false),
    onAbandon: () => { endRun('dead'); },
    onTitle: toTitle,
    onLevelUpDone: () => { levelUpOpen = false; session.announceResumed(); },
    onSetting: applySetting,
    // marketplace
    onInteract: () => {
      const r = interact();
      if (r?.kind === 'vendor') ui.openShop(r.vendor);
    },
    onLeaveShop: closeShop,
    onPortalChoice: choosePortal,
    onDrinkFlask: drinkFlask,
    // saves
    onSaveRun: (slot) => saveRun(slot),
    onLoadRun: resumeSaved,
    // An imported backup changes gold, unlocks and records, so the menus
    // that display them have to be rebuilt rather than left stale.
    onProgressImported: () => { ui.refreshMeta?.(); },

    // The lobby says go. The run is started exactly the way a solo run is —
    // same character, same difficulty, same code path — and only then are the
    // other players attached to it. Co-op is additive right down to here.
    onCoopStart: (m) => {
      // The same entry point a solo run uses, with the same character screen
      // behind it — co-op is additive right down to here. The seed is replaced
      // before anything is generated from it so every client builds the same
      // world, and only then are the other players attached.
      beginRun(m.charId || 'ranger', m.difficulty || 'normal');
      S.seed = m.seed;
      setWorldSeed(m.seed);
      seedRandom(m.seed);
      startCoopRun(m, m.selfId);
    },
  });

  // Hand-drawn character art has to finish decoding before any sprite is
  // warmed, or the cache would fill with the fallback versions of characters
  // that do have artwork. This never rejects: a sheet that cannot load simply
  // leaves that hero drawn in code.
  // The market's artwork decodes in the same breath. Both always resolve, so
  // a blocked file costs that one thing its art and nothing else.
  // The interface's own artwork and fonts go in the same wait. Without this the
  // boot bar finishes, the menu appears, and only THEN do the panel frames and
  // the display face start downloading — which on a phone is a second of
  // hollow buttons after the game has already said it is ready.
  let uiDone = 0;
  const uiJob = preloadInterface(() => { uiDone++; });

  await Promise.all([preloadHeroSheets(), preloadRtp()]);

  // The generator is consumed a few milliseconds at a time so the progress bar
  // animates instead of the page freezing while sprites are rasterised.
  const gen = bootTasks();
  const total = CHARACTERS.length + MOB_KEYS.length + CHAMPION_KEYS.length +
    REDESIGNED.length + 1 + BIOMES.length + 8 + FOOD_IDS.length +
    WEAPON_IDS.length + PASSIVE_IDS.length + 1 +
    4 + STALL_KINDS.length + PROP_KINDS.length + VENDOR_IDS.length + FOLK_COUNT +
    ITEM_ICONS.length + GOOD_IDS.length + BALLOON_KINDS.length + BUDGIE_IDS.length +
    PRELOAD_STEPS;
  let done = 0;
  await new Promise((resolve) => {
    const step = () => {
      const started = performance.now();
      while (performance.now() - started < 8) {
        const r = gen.next();
        if (r.done) { resolve(); return; }
        done++;
        ui.setBootProgress(Math.min(0.99, (done + uiDone) / total));
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  // Whichever of the two finishes last is what the player is really waiting
  // for. Awaited here rather than earlier so the sprite work and the downloads
  // overlap instead of queueing.
  await uiJob;
  ui.setBootProgress(1);

  const drawn = loadedSheets();
  if (drawn.length) console.info(`Grimfall: hand-drawn character art loaded for ${drawn.join(', ')}.`);
  const atlases = loadedAtlases();
  if (atlases.length) {
    console.info(`Grimfall: market art loaded (${atlases.join(', ')}); ${rtpFolkCount()} townsfolk.`);
  }

  await new Promise((r) => setTimeout(r, 260));

  // Straight to the title. There used to be a thirteen-second cinematic here,
  // and before that a rendered film; the title screen now does that job itself
  // — the sky is already moving, the wordmark drops in, and the prompt asks for
  // the one input the player was going to give anyway. An opening you have to
  // sit through is the fastest way to make somebody resent a game they have not
  // played yet, and this one is over in a second and starts the moment they
  // touch it.
  ui.hideAll();
  showBuildStamp();
  toTitle();
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// Mode transitions
// ---------------------------------------------------------------------------
/** Someone entered or left an upgrade screen. */
netlink.on('lost', () => {
  if (!session.isActive()) return;
  // The run is not discarded. Every creature is already simulated here, so what
  // is lost is the other people — the world carries on, alone, which is far
  // kinder than dropping someone out of a twenty-minute run at minute
  // seventeen because their wifi blinked.
  endCoopRun();
  S.toast = { text: 'Connection lost — playing on alone', color: '#ff9aa8', life: 4, maxLife: 4 };
});

setPauseHandler((who, paused) => {
  if (paused) pausedBy.add(who); else pausedBy.delete(who);
  teamPaused = pausedBy.size > 0;
});

/**
 * The diagnostics panel. Only ever built while a networked run is going, so on
 * your own this costs one boolean per frame and touches no DOM at all.
 */
function updateNetHud() {
  const el = document.getElementById('netHud');
  if (!el) return;
  const want = netHudOn && session.isActive();
  el.hidden = !want;
  if (!want) return;
  el.textContent = session.debugLines().join('\n');
}

/**
 * Show which build this is, on screen and in the console.
 *
 * The tag is written by tools/build.mjs, so it exists in a build and not in the
 * source tree — running from source says "dev", which is itself the answer to
 * "am I looking at a build or at my working copy?".
 */
function showBuildStamp() {
  const id = document.querySelector('meta[name="grimfall-build"]')?.getAttribute('content') || 'dev';
  const el = document.getElementById('buildStamp');
  if (el) el.textContent = `build ${id}`;
  console.info(`Grimfall: build ${id}`);
}

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
  portalOpen = false;
  ui.showHUD(true);
  showJoystick(IS_TOUCH);
  clearPressed();
  requestWakeLock();
  return true;
}

// ---------------------------------------------------------------------------
// The Hearthhall
// ---------------------------------------------------------------------------
//
// The co-op lobby, as a room. Reached from Play Together and from nowhere else
// — it is not a destination on the menu, it is what a lobby looks like once you
// are standing in one.
function toHub() {
  mode = 'hub';
  ui.hideAll();
  ui.showHUD(false);
  showJoystick(IS_TOUCH);
  clearPressed();
  enterHub();
  playMusic('hall');
  if (netlink.lobbyState()) joinHubNet();
}

/**
 * Step out of the hall.
 *
 * Somebody in a party has not left co-op because they walked away from the
 * fire, so this puts them back on the party panel and keeps them in the room.
 * Leaving the room itself is the panel's job, not this one's.
 */
function leaveHub(toPanel = true) {
  mode = 'menu';
  showJoystick(false);
  if (toPanel && netlink.lobbyState()) { ui.action('coop'); return; }
  leaveHubNet();
  playMusic('menu');
  toTitle();
}

/**
 * The button, pressed.
 *
 * Somebody to talk to comes first — the hall decides who is nearest, and a
 * person standing between you and a door should be the thing you address.
 */
function useHubPoint() {
  if (talkToFolk()) { sfx('select'); return; }
  const at = hubTarget();
  if (!at) return;
  sfx('select');

  // The map says where things are; this says what they mean. Both the head
  // table and the hearth open the party panel — one is where the host sets the
  // terms and the other is where you read the room, and they are the same panel
  // because splitting it would mean two places to look for one answer.
  // Stairs stay inside the inn — they are the one thing here that moves you
  // without leaving.
  if (at.id === 'upstairs') { goToArea('upper'); return; }
  if (at.id === 'downstairs') { goToArea('ground'); return; }

  // The front door is walked THROUGH. The hall keeps running while it happens —
  // the door swings, the player walks out, the screen goes with them — and the
  // run is started when they are actually gone rather than when they pressed.
  if (at.id === 'door') { beginLeaving(); return; }

  // The inn's games are the same game alone or in company; the only difference
  // is whether there is anybody to send a result to.
  //
  // The inn is NOT torn down to open one. The panel sits over the room, the
  // room keeps running behind it, and closing the panel puts the player back in
  // their chair — which is what leaving a table is.
  if (at.id === 'dice' || at.id === 'cups' || at.id === 'knives' || at.id === 'supper') {
    ui.openGame(at.id, netlink.lobbyState() ? 'table' : 'solo', () => { clearPressed(); });
    return;
  }

  const WHERE = {
    settings: 'coop', party: 'coop', variants: 'coop',
    sanctuary: 'sanctuary', help: 'help', arena: 'arena',
  };
  const dest = WHERE[at.id];
  if (!dest) return;
  leaveHub(true);
  if (dest !== 'coop') ui.action(dest);
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

/**
 * Which door was taken. `market` hands off to the existing market flow;
 * `onward` is a transit inside the run, so the HUD never leaves the screen.
 */
function choosePortal(door) {
  portalOpen = false;
  const info = S.pendingPortal;
  if (!info) return;
  if (door === 'market') {
    S.pendingMarket = { bossName: info.bossName };
    S.pendingPortal = null;
    sfx('select');
    return;                      // the loop picks it up next frame
  }
  pressOn();
  clearPressed();
  showBanner('OPEN COUNTRY', '#9ad4ff', 'The hunt goes on');
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

  // Read by the dev server's live-reload snippet, and by nothing else. A
  // stylesheet edit is swapped in place, but a script edit needs the document
  // rebuilt, and doing that mid-run throws the run away. Published here so the
  // reloader can wait for a natural break instead.
  window.__grimfallRunning = S.running && !S.paused;

  handleKeys();

  const settings = store.settings();
  const opts = { shakeEnabled: settings.screenShake };
  const frameStart = performance.now();

  if (mode === 'hub') {
    // A panel open over the room takes the controls with it. The room still
    // draws — the point of an overlay is that you can see where you are — but
    // WASD belongs to whatever is on top, and a player walking blindly out of
    // their chair while typing into a game is the bug that produces.
    const overlay = !!ui.currentScreen();
    if (!overlay) pollInput();
    // Returns true on the frame the walk-out through the front door finishes.
    const gone = updateHub(dt, overlay ? { x: 0, y: 0 } : input,
      { w: canvas.width / zoom, h: canvas.height / zoom });
    if (inHubNet()) tickHubNet(dt);
    renderHub(ctx, canvas, zoom);
    if (gone) { leaveHub(false); ui.action('heroes'); }
  } else if (mode === 'market') {
    const view = computeView(canvas.width, canvas.height, zoom);
    updateMarket(dt, { w: canvas.width / zoom, h: canvas.height / zoom });
    renderMarket(ctx, canvas, zoom);
    ui.updateMarketBar();
    void view;
  } else if (mode === 'run' && S.player) {
    const view = computeView(canvas.width, canvas.height, zoom);
    S.view = view;
    // A co-op run stops for everyone while anyone is choosing an upgrade, so
    // the test is "is ANY of us in a menu", not "am I".
    if (!S.paused && !levelUpOpen && !teamPaused) {
      update(dt, view);
      updateCamera(dt, canvas.width, canvas.height);
      // After the simulation: corrections land on a world that has finished
      // thinking, and the outgoing snapshot says where things ended up rather
      // than where they started.
      tickCoop(dt);
    }
    render(ctx, canvas, zoom, opts);
    if (S.cutscene) renderCutscene(ctx, canvas.width, canvas.height);
    ui.updateHUD();
    ui.showSkip(!!S.cutscene);
    updateNetHud();

    if (S.pendingLevels > 0 && !levelUpOpen && S.running) {
      levelUpOpen = true;
      resetStick();
      // Everyone else stops too. Announced before the card is drawn so the
      // pause reaches the others while this player is still reading.
      session.announceLevelUp();
      ui.openLevelUp();
    }
    // Stepping into the portal asks where it lets you out — but only once the
    // level-ups the boss's death earned have been taken, so the two overlays
    // can never be up at the same time.
    if (S.pendingPortal && !portalOpen && !levelUpOpen && S.pendingLevels === 0 && S.running && !S.paused) {
      portalOpen = true;
      resetStick();
      ui.openPortal(S.pendingPortal.bossName);
    }
    if (S.pendingMarket && !levelUpOpen && S.pendingLevels === 0 && S.running && !S.paused) {
      toMarket();
    }
  } else {
    attractT += dt;
    // The title screen gets its own sky; every other menu keeps the game world
    // drifting behind it, which is what tells you the run is still there.
    if (ui.currentScreen() === 'titleScreen') renderTitle(ctx, canvas, attractT);
    else renderBackdrop(ctx, canvas, zoom * 0.9, attractT);
  }

  sampleFrame(performance.now() - frameStart);
}

function handleKeys() {
  // Diagnostics, before anything that can swallow a key. F3 rather than a menu
  // toggle because it is read while tuning, not while playing, and wanting it
  // usually happens mid-fight.
  if (consumePressed('F3')) netHudOn = !netHudOn;

  // Any key gets you past a boss entrance you have already seen.
  if (S.cutscene) {
    if (consumePressed('Escape') || consumePressed('Space') || consumePressed('Enter')) skipCutscene();
    return;
  }

  if (mode === 'hub') {
    // With a panel open, Escape closes the panel rather than the inn.
    if (ui.currentScreen()) {
      if (consumePressed('Escape')) ui.back();
      return;
    }
    if (consumePressed('Escape')) { leaveHub(true); return; }
    if (consumePressed('Space') || consumePressed('Enter') || consumePressed('KeyE')) {
      useHubPoint();
    }
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
