// ---------------------------------------------------------------------------
// ui.js — every DOM screen: menus, HUD, the level-up draft and the results.
// The canvas owns the world; this module owns everything with a border.
// ---------------------------------------------------------------------------

import { clamp, formatTime, formatNumber } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { say, setVoiceActor } from '../core/voice.js';
import * as store from '../core/storage.js';
import { CHARACTERS, characterById, heroPortrait, heroFace } from '../art/hero.js';
import { iconSprite } from '../art/props.js';
import { bossPortraitArt } from '../art/bosses.js';
import { DEMOS } from './demos.js';
import { dragonPortrait } from '../art/dragon.js';
import {
  WEAPONS, PASSIVES, META_UPGRADES, DIFFICULTIES, DIFFICULTY_ORDER,
  WEAPON_MAX_LEVEL, RUN_LENGTH, BOSSES,
} from '../game/config.js';
import { S, weaponIcon, weaponDisplayName, maxHp } from '../game/state.js';
import { rollChoices, takeLevelUp, skipLevelUp, banishCard, useReroll } from '../game/game.js';
import { QUALITY_MODES, tierName, qualityMode } from '../core/quality.js';
import { mostRecent, slotSummaries, clearSlot } from '../core/saves.js';
import * as backup from '../core/backup.js';
import { VENDORS, goodById, buy, purchaseBlocked, FLASKS, FLASK_IDS, flaskCount } from '../game/shop.js';
import { vendorPortrait } from '../art/market.js';
import { rtpVendorFace } from '../art/rtp.js';
import { goodIcon } from '../art/items.js';
import { M, vendorReact, playerReact } from '../game/market.js';

const $ = (id) => document.getElementById(id);

const el = {};
let hooks = {};
let selectedHero = 'ranger';
let selectedDiff = 'normal';
let currentChoices = [];
let lastLaunch = { mode: 'run', bossId: null };
let banishArmed = false;
let screenStack = [];

// --- sprite -> <img> ---------------------------------------------------------
const dataUrlCache = new Map();
function spriteUrl(key, build) {
  let url = dataUrlCache.get(key);
  if (!url) { url = build().toDataURL(); dataUrlCache.set(key, url); }
  return url;
}
function iconImg(name, size = 32) {
  const img = new Image(size, size);
  img.src = spriteUrl(`icon:${name}`, () => iconSprite(name, 4));
  img.width = size; img.height = size;
  img.alt = '';
  return img;
}

// ---------------------------------------------------------------------------
export function initUI(callbacks) {
  hooks = callbacks;
  [
    'bootScreen', 'bootFill', 'titleScreen', 'heroScreen', 'sanctuaryScreen',
    'optionsScreen', 'helpScreen', 'pauseScreen', 'levelScreen', 'resultScreen',
    'hud', 'xpFill', 'hudLevel', 'hudTime', 'hudGold', 'hudKills', 'hpFill', 'hpText',
    'slots', 'bossBar', 'bossName', 'bossFill', 'toast', 'banner', 'bannerMain', 'bannerSub',
    'pauseBtn', 'resumeBtn', 'abandonBtn', 'againBtn', 'toTitleBtn',
    'heroGrid', 'heroGold', 'sanctGold', 'titleGold', 'titleBest', 'diffSeg',
    'startRunBtn', 'upgradeGrid', 'optionsBody', 'cards', 'levelNum', 'levelTitle',
    'rerollBtn', 'banishBtn', 'skipBtn', 'rerollCount', 'banishCount',
    'resultKicker', 'resultTitle', 'resultStats', 'resultGold', 'pauseStats',
    'resetProgressBtn', 'skipCutBtn',
    'arenaScreen', 'bossGrid', 'arenaDiffSeg',
    'belt', 'marketBar', 'marketBelt', 'marketGold', 'interactBtn', 'interactLabel',
    'shopScreen', 'shopFace', 'shopName', 'shopTrade', 'shopGold', 'shopLine',
    'shopGrid', 'shopBelt', 'shopLeaveBtn',
    'savesScreen', 'savesTitle', 'savesSub', 'slotList',
    'savesNote', 'exportSaveBtn', 'importSaveBtn', 'importSaveInput',
    'continueBtn', 'continueSub', 'loadBtn',
  ].forEach((id) => { el[id] = $(id); });

  selectedHero = store.meta().lastCharacter || 'ranger';
  selectedDiff = store.settings().difficulty || 'normal';

  // Menu routing
  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action;
      sfx('select');
      if (a === 'back') back();
      else if (a === 'play') openHeroes();
      else if (a === 'heroes') openHeroes();
      else if (a === 'arena') openArena();
      else if (a === 'sanctuary') openSanctuary();
      else if (a === 'options') openOptions();
      else if (a === 'help') go('helpScreen');
      else if (a === 'continue') continueRun();
      else if (a === 'load') openSaves('load');
      else if (a === 'saveRun') openSaves('save');
    });
    btn.addEventListener('pointerenter', () => sfx('hover'));
  });

  el.interactBtn.addEventListener('click', () => hooks.onInteract?.());

  // Taking your progress off this browser, and putting it back.
  el.exportSaveBtn.addEventListener('click', () => {
    sfx('select');
    const r = backup.exportToFile();
    savesMessage(r.ok
      ? `Saved to ${r.name}. Keep it somewhere you will find it again.`
      : `Could not write the file: ${r.error}`, !r.ok);
  });
  el.importSaveBtn.addEventListener('click', () => {
    sfx('select');
    el.importSaveInput.value = '';       // so re-picking the same file fires
    el.importSaveInput.click();
  });
  el.importSaveInput.addEventListener('change', () => {
    const file = el.importSaveInput.files && el.importSaveInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => savesMessage('That file could not be read.', true);
    reader.onload = () => {
      const found = backup.inspect(String(reader.result || ''));
      if (!found.ok) { savesMessage(found.error, true); sfx('deny'); return; }
      // Importing overwrites gold, unlocks and records. That is not something
      // to do because a finger slipped.
      const when = found.exportedAt ? new Date(found.exportedAt).toLocaleString() : 'an unknown date';
      const ok = confirm(
        `Load this save?

From ${when}
`
        + `${found.slots.length} saved run${found.slots.length === 1 ? '' : 's'}, `
        + `${formatNumber(found.gold)} gold, ${found.unlocked} hero${found.unlocked === 1 ? '' : 'es'}.

`
        + 'This replaces the gold, unlocks and records in this browser.');
      if (!ok) return;
      const res = backup.apply(found.data);
      if (!res.ok) { savesMessage(res.error, true); sfx('deny'); return; }
      sfx('levelup');
      savesMessage(`Loaded: ${res.slots} run${res.slots === 1 ? '' : 's'} and ${formatNumber(res.gold)} gold.`);
      buildSaves();
      hooks.onProgressImported?.();
    };
    reader.readAsText(file);
  });
  el.shopLeaveBtn.addEventListener('click', () => { closeShop(); hooks.onLeaveShop?.(); });

  el.startRunBtn.addEventListener('click', () => {
    const ch = characterById(selectedHero);
    if (!store.isUnlocked(ch.id)) { sfx('deny'); return; }
    store.meta().lastCharacter = ch.id;
    store.setSetting('difficulty', selectedDiff);
    store.save();
    lastLaunch = { mode: 'run', bossId: null };
    hideAll();
    hooks.onStart?.(ch.id, selectedDiff);
  });

  el.pauseBtn.addEventListener('click', () => hooks.onPause?.());
  el.skipCutBtn.addEventListener('click', () => hooks.onSkipCutscene?.());
  el.resumeBtn.addEventListener('click', () => { sfx('select'); hooks.onResume?.(); });
  el.abandonBtn.addEventListener('click', () => { sfx('back'); hooks.onAbandon?.(); });
  el.againBtn.addEventListener('click', () => {
    sfx('select');
    hideAll();
    // Repeat whatever was launched last: a full run, or the same boss.
    if (lastLaunch.mode === 'arena') hooks.onStartArena?.(selectedHero, selectedDiff, lastLaunch.bossId);
    else hooks.onStart?.(selectedHero, selectedDiff);
  });
  el.toTitleBtn.addEventListener('click', () => { sfx('back'); say('farewell', { force: true }); hooks.onTitle?.(); });

  el.rerollBtn.addEventListener('click', () => {
    if (!useReroll()) { sfx('deny'); return; }
    drawCards();
  });
  el.banishBtn.addEventListener('click', () => {
    if (S.banishes <= 0) { sfx('deny'); return; }
    banishArmed = !banishArmed;
    sfx('hover');
    renderCards();
  });
  el.skipBtn.addEventListener('click', () => {
    skipLevelUp();
    closeLevelUp();
  });

  el.resetProgressBtn.addEventListener('click', () => {
    if (!confirm('Erase all gold, upgrades and unlocked heroes?')) return;
    store.resetAll();
    sfx('back');
    buildSanctuary();
    refreshGold();
  });

  buildDifficultySeg();
  buildOptions();
  buildDemos();
}

// ---------------------------------------------------------------------------
// How-to-play demonstrations
// ---------------------------------------------------------------------------
const demoCards = [];
let demoRaf = 0;
let demoStart = 0;

/** Give every tagged help card a canvas to draw its loop into. */
function buildDemos() {
  for (const card of document.querySelectorAll('[data-demo]')) {
    const key = card.dataset.demo;
    if (!DEMOS[key]) continue;
    const canvas = document.createElement('canvas');
    canvas.className = 'demo';
    card.prepend(canvas);
    demoCards.push({ canvas, ctx: canvas.getContext('2d'), draw: DEMOS[key] });
  }
}

function sizeDemos() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const d of demoCards) {
    const r = d.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (d.canvas.width !== w || d.canvas.height !== h) {
      d.canvas.width = w;
      d.canvas.height = h;
    }
    d.dpr = dpr;
  }
}

function demoFrame(now) {
  demoRaf = requestAnimationFrame(demoFrame);
  const t = (now - demoStart) / 1000;
  for (const d of demoCards) {
    const { ctx, canvas } = d;
    ctx.setTransform(d.dpr || 1, 0, 0, d.dpr || 1, 0, 0);
    d.draw(ctx, canvas.width / (d.dpr || 1), canvas.height / (d.dpr || 1), t);
  }
}

/** Only runs while the help screen is actually on screen. */
function startDemos() {
  if (demoRaf || !demoCards.length) return;
  sizeDemos();
  demoStart = performance.now();
  demoRaf = requestAnimationFrame(demoFrame);
}

function stopDemos() {
  if (!demoRaf) return;
  cancelAnimationFrame(demoRaf);
  demoRaf = 0;
}

// ---------------------------------------------------------------------------
// Screen routing
// ---------------------------------------------------------------------------
const SCREENS = ['bootScreen', 'titleScreen', 'heroScreen', 'arenaScreen', 'sanctuaryScreen', 'optionsScreen', 'helpScreen', 'pauseScreen', 'levelScreen', 'resultScreen', 'shopScreen', 'savesScreen'];

export function go(name, remember = true) {
  const current = SCREENS.find((s) => el[s]?.classList.contains('active'));
  if (remember && current && current !== name) screenStack.push(current);
  hideAll(false);
  el[name]?.classList.add('active');
  if (name === 'helpScreen') startDemos(); else stopDemos();
}

export function hideAll(clearStack = true) {
  SCREENS.forEach((s) => el[s]?.classList.remove('active'));
  if (clearStack) screenStack = [];
  stopDemos();
}

export function back() {
  const prev = screenStack.pop();
  if (prev === 'pauseScreen' || (!prev && S.running && S.paused)) { go('pauseScreen', false); return; }
  go(prev || 'titleScreen', false);
}

export function currentScreen() {
  return SCREENS.find((s) => el[s]?.classList.contains('active')) || null;
}

export function setBootProgress(p) {
  if (el.bootFill) el.bootFill.style.width = `${Math.round(clamp(p, 0, 1) * 100)}%`;
}

export function showTitle() {
  hideAll();
  go('titleScreen', false);
  el.hud.hidden = true;
  el.marketBar.hidden = true;
  refreshGold();
  refreshContinue();
}

/** Continue and Load only exist when there is actually something to resume. */
function refreshContinue() {
  const recent = mostRecent();
  el.continueBtn.hidden = !recent;
  el.loadBtn.hidden = !recent;
  if (recent) {
    const ch = characterById(recent.charId);
    el.continueSub.textContent =
      `${ch.name} · LV ${recent.level} · ${formatTime(recent.time)}${recent.slot === 'auto' ? ' · autosave' : ` · slot ${recent.slot}`}`;
  }
}

function continueRun() {
  const recent = mostRecent();
  if (!recent) { sfx('deny'); return; }
  hideAll();
  if (!hooks.onLoadRun?.(recent.slot)) { sfx('deny'); showTitle(); }
}

// ---------------------------------------------------------------------------
// Heroes
// ---------------------------------------------------------------------------
function openHeroes() {
  buildHeroes();
  go('heroScreen');
  refreshGold();
}

function buildHeroes() {
  el.heroGrid.innerHTML = '';
  for (const ch of CHARACTERS) {
    const unlocked = store.isUnlocked(ch.id);
    const card = document.createElement('div');
    card.className = `hero-card${ch.id === selectedHero ? ' selected' : ''}${unlocked ? '' : ' locked'}`;

    // A character with a drawn portrait shows it; the rest show their sprite.
    const face = heroFace(ch.id, 144);
    const img = new Image();
    img.src = face
      ? spriteUrl(`face:${ch.id}`, () => face)
      : spriteUrl(`hero:${ch.id}`, () => heroPortrait(ch.id, 4));
    img.className = face ? 'hero-face' : '';
    img.width = 64; img.height = 72;
    img.alt = ch.name;

    const info = document.createElement('div');
    info.className = 'hero-info';
    const s = ch.stats;
    info.innerHTML = `
      <div class="role">${ch.title}</div>
      <h3>${ch.name}</h3>
      <p>${ch.blurb}</p>
      <div class="hero-stats">
        <span class="stat-tag">${s.hp} HP</span>
        <span class="stat-tag">${s.speed} spd</span>
        <span class="stat-tag">${WEAPONS[ch.weapon].name}</span>
        ${s.armor ? `<span class="stat-tag">${s.armor} armour</span>` : ''}
        ${s.revives ? `<span class="stat-tag">${s.revives} revive</span>` : ''}
      </div>`;

    card.append(img, info);

    if (!unlocked) {
      const lock = document.createElement('div');
      lock.className = 'hero-lock';
      lock.textContent = `🔒 ${ch.unlock} gold`;
      card.appendChild(lock);
    }

    card.addEventListener('click', () => {
      if (!unlocked) {
        if (store.spendGold(ch.unlock)) {
          store.unlock(ch.id);
          selectedHero = ch.id;
          sfx('chest');
          setVoiceActor(ch.id);
          say('greet', { force: true });
          buildHeroes();
          refreshGold();
        } else { sfx('deny'); say('refuse', { force: true }); }
        return;
      }
      selectedHero = ch.id;
      sfx('select');
      // Hear who you are picking.
      setVoiceActor(ch.id);
      say('greet', { force: true });
      buildHeroes();
    });
    el.heroGrid.appendChild(card);
  }
  el.startRunBtn.disabled = !store.isUnlocked(selectedHero);
}

function buildDifficultySeg() {
  el.diffSeg.innerHTML = '';
  for (const id of DIFFICULTY_ORDER) {
    const b = document.createElement('button');
    b.textContent = DIFFICULTIES[id].label;
    b.className = id === selectedDiff ? 'active' : '';
    b.addEventListener('click', () => {
      selectedDiff = id;
      sfx('select');
      buildDifficultySeg();
    });
    el.diffSeg.appendChild(b);
  }
}

// ---------------------------------------------------------------------------
// Boss arena
// ---------------------------------------------------------------------------
function openArena() {
  buildArena();
  go('arenaScreen');
}

/** Boss portraits: sprite blits for most, the composed dragon for Parduin. */
function bossPortrait(def) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (def.sprite === 'parduin') {
    const art = dragonPortrait(2);
    const k = Math.min(120 / art.width, 96 / art.height);
    c.width = Math.round(art.width * k);
    c.height = Math.round(art.height * k);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art, 0, 0, c.width, c.height);
  } else {
    const art = bossPortraitArt(def.sprite, 1);
    const k = Math.min(96 / art.width, 108 / art.height);
    c.width = Math.round(art.width * k);
    c.height = Math.round(art.height * k);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art, 0, 0, c.width, c.height);
  }
  return c;
}

function buildArena() {
  el.bossGrid.innerHTML = '';
  for (const def of BOSSES) {
    const isFinal = def === BOSSES[BOSSES.length - 1];
    const card = document.createElement('div');
    card.className = `boss-card${isFinal ? ' final' : ''}`;
    card.style.setProperty('--accent', def.color);

    const info = document.createElement('div');
    info.className = 'boss-info';
    info.innerHTML = `
      <div class="when">Minute ${def.at}${isFinal ? ' · final' : ''}</div>
      <h3>${def.cutsceneName || def.name}</h3>
      <p>${def.title}</p>`;

    card.append(bossPortrait(def), info);
    card.addEventListener('pointerenter', () => sfx('hover'));
    card.addEventListener('click', () => {
      sfx('select');
      lastLaunch = { mode: 'arena', bossId: def.id };
      hideAll();
      hooks.onStartArena?.(selectedHero, selectedDiff, def.id);
    });
    el.bossGrid.appendChild(card);
  }

  // A compact difficulty control in the header.
  el.arenaDiffSeg.innerHTML = '';
  for (const id of DIFFICULTY_ORDER) {
    const b = document.createElement('button');
    b.textContent = DIFFICULTIES[id].label;
    b.className = id === selectedDiff ? 'active' : '';
    b.addEventListener('click', () => {
      selectedDiff = id;
      sfx('select');
      buildArena();
      buildDifficultySeg();
    });
    el.arenaDiffSeg.appendChild(b);
  }
}

// ---------------------------------------------------------------------------
// Sanctuary
// ---------------------------------------------------------------------------
function openSanctuary() {
  buildSanctuary();
  go('sanctuaryScreen');
  refreshGold();
}

function buildSanctuary() {
  el.upgradeGrid.innerHTML = '';
  for (const up of META_UPGRADES) {
    const lvl = store.upgradeLevel(up.id);
    const maxed = lvl >= up.max;
    const cost = maxed ? 0 : up.cost[lvl];

    const card = document.createElement('div');
    card.className = 'upgrade-card';

    const body = document.createElement('div');
    body.className = 'upgrade-body';
    body.innerHTML = `
      <h4>${up.name}</h4>
      <div class="eff">${lvl > 0 ? up.fmt(lvl) : 'not yet purchased'}</div>
      <div class="pips">${Array.from({ length: up.max }, (_, i) => `<span class="pip${i < lvl ? ' on' : ''}"></span>`).join('')}</div>`;

    const btn = document.createElement('button');
    btn.className = `buy-btn${maxed ? ' maxed' : ''}`;
    btn.textContent = maxed ? 'MAX' : `${cost} g`;
    btn.disabled = maxed || store.meta().gold < cost;
    btn.addEventListener('click', () => {
      if (!store.spendGold(cost)) { sfx('deny'); say('refuse', { force: true }); return; }
      store.setUpgradeLevel(up.id, lvl + 1);
      sfx('chest');
      buildSanctuary();
      refreshGold();
    });

    card.append(iconImg(up.icon, 34), body, btn);
    el.upgradeGrid.appendChild(card);
  }
}

/**
 * Rebuild everything that reads from stored progression. Called after a backup
 * is imported, when gold, unlocks and records have all changed underneath the
 * menus at once.
 */
export function refreshMeta() {
  refreshGold();
  buildHeroes();
}

function refreshGold() {
  const g = formatNumber(store.meta().gold);
  el.heroGold.textContent = g;
  el.sanctGold.textContent = g;
  el.titleGold.textContent = `${g} gold`;
  const r = store.records();
  el.titleBest.textContent = r.runs
    ? `best ${formatTime(r.bestTime)} · ${formatNumber(r.totalKills)} slain${r.wins ? ` · ${r.wins} won` : ''}`
    : 'no runs yet';
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------
function openOptions() { buildOptions(); go('optionsScreen'); }

function row(label, hint, control) {
  const r = document.createElement('div');
  r.className = 'opt-row';
  const l = document.createElement('div');
  l.innerHTML = `<span class="opt-label">${label}${hint ? `<span class="opt-hint">${hint}</span>` : ''}</span>`;
  r.append(l, control);
  return r;
}

function toggle(initial, onChange) {
  const t = document.createElement('button');
  t.className = `toggle${initial ? ' on' : ''}`;
  t.setAttribute('aria-pressed', String(!!initial));
  t.addEventListener('click', () => {
    const next = !t.classList.contains('on');
    t.classList.toggle('on', next);
    t.setAttribute('aria-pressed', String(next));
    sfx('select');
    onChange(next);
  });
  return t;
}

/** A small segmented control, used for anything with more than two states. */
function segmented(options, current, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'seg';
  const paint = () => {
    wrap.innerHTML = '';
    for (const o of options) {
      const b = document.createElement('button');
      b.textContent = o.label;
      b.className = o.value === current ? 'active' : '';
      b.addEventListener('click', () => {
        current = o.value;
        sfx('select');
        paint();
        onChange(o.value);
      });
      wrap.appendChild(b);
    }
  };
  paint();
  return wrap;
}

function slider(initial, onChange) {
  const s = document.createElement('input');
  s.type = 'range'; s.min = '0'; s.max = '100'; s.value = String(Math.round(initial * 100));
  s.addEventListener('input', () => onChange(Number(s.value) / 100));
  return s;
}

function qualityHint() {
  return qualityMode() === 'auto'
    ? `Adjusts itself as you play — currently ${tierName()}`
    : 'Fixed at your choice';
}

function buildOptions() {
  const st = store.settings();
  el.optionsBody.innerHTML = '';
  el.optionsBody.append(
    row('Music', 'Procedural soundtrack', toggle(st.music, (v) => { store.setSetting('music', v); hooks.onSetting?.('music', v); })),
    row('Music volume', '', slider(st.musicVol, (v) => { store.setSetting('musicVol', v); hooks.onSetting?.('musicVol', v); })),
    row('Sound effects', '', toggle(st.sfx, (v) => { store.setSetting('sfx', v); hooks.onSetting?.('sfx', v); })),
    row('Effects volume', '', slider(st.sfxVol, (v) => { store.setSetting('sfxVol', v); hooks.onSetting?.('sfxVol', v); })),
    row('Hero voice', 'Your hero reacts out loud', toggle(st.voice, (v) => { store.setSetting('voice', v); hooks.onSetting?.('voice', v); })),
    row('Voice volume', '', slider(st.voiceVol, (v) => { store.setSetting('voiceVol', v); hooks.onSetting?.('voiceVol', v); })),
    row('Screen shake', 'Camera kick on impacts', toggle(st.screenShake, (v) => store.setSetting('screenShake', v))),
    row('Damage numbers', 'Show damage as it lands', toggle(st.damageNumbers, (v) => {
      store.setSetting('damageNumbers', v);
      if (S.player) S.player.showDamage = v;
    })),
    row('Graphics', qualityHint(), segmented(
      QUALITY_MODES.map((m) => ({ value: m, label: m === 'auto' ? 'Auto' : m[0].toUpperCase() + m.slice(1) })),
      st.quality,
      (v) => {
        store.setSetting('quality', v);
        hooks.onSetting?.('quality', v);
        buildOptions();          // the hint reports the live tier, so redraw it
      },
    )),
    row('Touch controls', 'Where the movement stick lives', segmented(
      [{ value: 'auto', label: 'Auto' }, { value: 'dynamic', label: 'Floating' }, { value: 'fixed', label: 'Fixed pad' }],
      st.joystick,
      (v) => {
        store.setSetting('joystick', v);
        hooks.onSetting?.('joystick', v);
      },
    )),
  );
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
export function showHUD(on) { el.hud.hidden = !on; }

/** The skip control only exists while a boss entrance is playing. */
export function showSkip(on) {
  if (el.skipCutBtn.hidden !== !on) el.skipCutBtn.hidden = !on;
}

let lastSlotSig = '';
export function updateHUD() {
  const p = S.player;
  if (!p) return;

  const hpMax = maxHp();
  el.xpFill.style.width = `${clamp(p.xp / p.xpNext, 0, 1) * 100}%`;
  el.hudLevel.textContent = `LV ${p.level}`;
  el.hudTime.textContent = `${formatTime(S.time)} / ${formatTime(RUN_LENGTH)}`;
  el.hudGold.textContent = formatNumber(S.gold);
  el.hudKills.textContent = formatNumber(S.kills);
  el.hpFill.style.width = `${clamp(p.hp / hpMax, 0, 1) * 100}%`;
  el.hpText.textContent = `${Math.max(0, Math.ceil(p.hp))} / ${Math.round(hpMax)}`;

  if (S.boss) {
    el.bossBar.hidden = false;
    el.bossName.textContent = S.boss.name;
    el.bossFill.style.width = `${clamp(S.boss.hp / S.boss.maxHp, 0, 1) * 100}%`;
  } else el.bossBar.hidden = true;

  renderBelt(el.belt, true);

  // Inventory row, rebuilt only when it actually changed.
  const sig = p.weapons.map((w) => `${w.id}${w.level}${w.evolved ? 'E' : ''}`).join(',') +
    '|' + Object.entries(p.passives).map(([k, v]) => `${k}${v}`).join(',');
  if (sig !== lastSlotSig) {
    lastSlotSig = sig;
    el.slots.innerHTML = '';
    for (const w of p.weapons) {
      const d = document.createElement('div');
      d.className = `slot${w.evolved ? ' evolved' : ''}${w.level >= WEAPON_MAX_LEVEL ? ' maxed' : ''}`;
      d.title = weaponDisplayName(w);
      d.append(iconImg(weaponIcon(w), 26));
      const lv = document.createElement('span');
      lv.className = 'lvl';
      lv.textContent = w.evolved ? '★' : w.level;
      d.appendChild(lv);
      el.slots.appendChild(d);
    }
    for (const [id, lvl] of Object.entries(p.passives)) {
      const def = PASSIVES[id];
      const d = document.createElement('div');
      d.className = 'slot passive';
      d.title = `${def.name} ${lvl}`;
      d.append(iconImg(def.icon, 22));
      const lv = document.createElement('span');
      lv.className = 'lvl';
      lv.textContent = lvl;
      d.appendChild(lv);
      el.slots.appendChild(d);
    }
  }

  // Toast + banner
  if (S.toast) {
    el.toast.hidden = false;
    el.toast.textContent = S.toast.text;
    el.toast.style.color = S.toast.color;
    el.toast.style.opacity = String(clamp(S.toast.life / 0.4, 0, 1));
  } else el.toast.hidden = true;

  if (S.banner) {
    el.banner.hidden = false;
    el.bannerMain.textContent = S.banner.text;
    el.bannerMain.style.color = S.banner.color;
    el.bannerSub.textContent = S.banner.sub || '';
    el.banner.style.opacity = String(clamp(S.banner.life / 0.5, 0, 1));
  } else el.banner.hidden = true;
}

// ---------------------------------------------------------------------------
// Level-up draft
// ---------------------------------------------------------------------------
export function openLevelUp() {
  banishArmed = false;
  el.levelNum.textContent = String(S.player.level);
  drawCards();
  go('levelScreen', false);
  sfx('levelup');
}

function drawCards() {
  currentChoices = rollChoices();
  renderCards();
}

function renderCards() {
  el.cards.innerHTML = '';
  const hasEvo = currentChoices.some((c) => c.rarity === 'evolution');
  el.levelTitle.textContent = hasEvo ? 'An evolution is within reach' : 'Choose an upgrade';

  for (const c of currentChoices) {
    const card = document.createElement('div');
    card.className = `card ${c.rarity}${banishArmed ? ' banish-mode' : ''}`;

    const text = document.createElement('div');
    text.className = 'card-text';
    text.innerHTML = `
      <div class="rarity">${c.rarity === 'evolution' ? 'Evolution' : c.rarity === 'new' ? 'New' : 'Upgrade'}</div>
      <h3>${c.label}</h3>
      ${c.sub ? `<div class="sub">${c.sub}</div>` : ''}
      <p>${c.desc}</p>`;

    card.append(iconImg(c.icon, 46), text);
    card.addEventListener('pointerenter', () => sfx('hover'));
    card.addEventListener('click', () => {
      if (banishArmed) {
        if (banishCard(c)) {
          banishArmed = false;
          drawCards();
          updateDraftButtons();
        }
        return;
      }
      takeLevelUp(c);
      say('confirm');
      closeLevelUp();
    });
    el.cards.appendChild(card);
  }
  updateDraftButtons();
}

function updateDraftButtons() {
  el.rerollCount.textContent = String(S.rerolls);
  el.banishCount.textContent = String(S.banishes);
  el.rerollBtn.disabled = S.rerolls <= 0;
  el.banishBtn.disabled = S.banishes <= 0;
  el.banishBtn.classList.toggle('armed', banishArmed);
}

function closeLevelUp() {
  if (S.pendingLevels > 0) { openLevelUp(); return; }
  hideAll();
  hooks.onLevelUpDone?.();
}

// ---------------------------------------------------------------------------
// Pause + results
// ---------------------------------------------------------------------------
function statBox(value, key) {
  return `<div class="stat-box"><div class="v">${value}</div><div class="k">${key}</div></div>`;
}

export function openPause() {
  el.pauseStats.innerHTML = [
    statBox(formatTime(S.time), 'survived'),
    statBox(formatNumber(S.kills), 'slain'),
    statBox(`LV ${S.player.level}`, 'level'),
    statBox(formatNumber(S.gold), 'gold'),
  ].join('');
  go('pauseScreen', false);
}

export function showResults({ outcome, gold, arena }) {
  const won = outcome === 'won';
  const panel = el.resultScreen.querySelector('.panel');
  panel.className = `panel result ${won ? 'win' : 'lose'}`;

  if (arena) {
    el.resultKicker.textContent = 'Boss Arena';
    el.resultTitle.textContent = won ? 'ARENA CLEARED' : 'DEFEATED';
  } else {
    el.resultKicker.textContent = won ? 'The long hour ends' : 'The horde closes over you';
    el.resultTitle.textContent = won ? 'SURVIVED' : 'YOU FELL';
  }

  el.resultStats.innerHTML = [
    statBox(arena ? arena.name : formatTime(S.time), arena ? 'opponent' : 'survived'),
    statBox(formatNumber(S.kills), 'slain'),
    statBox(`LV ${S.player.level}`, 'level'),
    statBox(formatNumber(Math.round(S.damageDealt)), 'damage'),
  ].join('');
  el.resultGold.textContent = arena ? 'practice — nothing banked' : formatNumber(gold);
  el.resultGold.classList.toggle('muted', !!arena);
  hideAll();
  go('resultScreen', false);
  el.hud.hidden = true;
  refreshGold();
}

// ---------------------------------------------------------------------------
// The flask belt
// ---------------------------------------------------------------------------
/**
 * Three fixed slots, always in the same order, so the key under each one never
 * moves. An empty slot stays visible and greyed rather than collapsing — you
 * should be able to see at a glance that you are out of draughts.
 */
function renderBelt(host, interactive) {
  if (!host) return;
  const sig = FLASK_IDS.map((id) => flaskCount(id)).join(',') + (interactive ? 'i' : '');
  if (host.dataset.sig === sig) return;
  host.dataset.sig = sig;
  host.innerHTML = '';
  if (FLASK_IDS.every((id) => !flaskCount(id))) return;

  FLASK_IDS.forEach((id, i) => {
    const def = FLASKS[id];
    const n = flaskCount(id);
    const d = document.createElement('div');
    d.className = `belt-slot${n ? '' : ' empty'}${n && interactive ? ' usable' : ''}`;
    d.title = `${def.name} — ${def.desc}`;
    const pic = new Image(22, 22);
    pic.src = spriteUrl(`flask:${id}`, () => goodIcon(id, 3));
    pic.width = 22; pic.height = 22; pic.alt = '';
    d.append(pic);
    const key = document.createElement('span');
    key.className = 'k';
    key.textContent = i + 1;
    d.appendChild(key);
    const count = document.createElement('span');
    count.className = 'n';
    count.textContent = n;
    d.appendChild(count);
    if (n && interactive) {
      d.addEventListener('click', () => {
        hooks.onDrinkFlask?.(id);
        host.dataset.sig = '';       // force a redraw on the next frame
      });
    }
    host.appendChild(d);
  });
}

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------
export function showMarketBar(on) {
  el.marketBar.hidden = !on;
  if (!on) { el.interactBtn.hidden = true; el.marketBelt.dataset.sig = ''; }
}

export function updateMarketBar() {
  el.marketGold.textContent = formatNumber(S.gold);
  renderBelt(el.marketBelt, false);

  const p = M.prompt;
  const show = !!p && !M.talking && !M.leaving;
  if (el.interactBtn.hidden === show) el.interactBtn.hidden = !show;
  if (show) el.interactLabel.textContent = p.kind === 'exit' ? 'Leave' : p.label;

  // Keep the open shop honest while you spend.
  if (M.talking) el.shopGold.textContent = formatNumber(S.gold);
}

/**
 * The arrival card. This gets its own element rather than borrowing the HUD's
 * banner, because the HUD is hidden in the market and its banner's opacity is
 * driven by the run clock, which is stopped.
 */
let arrivalCard = null;
export function announceMarket({ bossName }, saved) {
  if (!arrivalCard) {
    arrivalCard = document.createElement('div');
    arrivalCard.className = 'market-arrival';
    el.marketBar.appendChild(arrivalCard);
  }
  const card = arrivalCard;
  card.innerHTML = `<b>THE LONG MARKET</b><span>${
    bossName ? `${bossName} is dead — the traders came back` : 'the traders came back'
  }${saved ? ' · run saved' : ''}</span>`;
  card.classList.remove('show');
  void card.offsetWidth;
  card.classList.add('show');
}

// ---------------------------------------------------------------------------
// The vendor screen
// ---------------------------------------------------------------------------
let openVendor = null;

export function openShop(vendor) {
  if (!vendor) return;
  openVendor = vendor;
  const def = VENDORS[vendor.id];
  // The merchant's own portrait if the atlas decoded, the code-drawn one if
  // not. The cache key carries which of the two it is, so the fallback drawn
  // during a slow first load cannot be handed out again once the real face has
  // arrived.
  const face = rtpVendorFace(vendor.id, 192);
  el.shopFace.src = face
    ? spriteUrl(`vendorface:rtp:${vendor.id}`, () => face)
    : spriteUrl(`vendorface:drawn:${vendor.id}`, () => vendorPortrait(vendor.id, 6));
  el.shopName.textContent = def.name;
  el.shopTrade.textContent = def.trade;
  el.shopLine.textContent = def.greeting[Math.min(def.greeting.length - 1, S.marketVisits - 1)] || def.greeting[0];
  buildShop();
  go('shopScreen', false);
}

export function closeShop() {
  if (!openVendor) return;
  openVendor = null;
  hideAll();
}

function buildShop() {
  const v = openVendor;
  if (!v) return;
  el.shopGold.textContent = formatNumber(S.gold);
  el.shopGrid.innerHTML = '';

  for (const entry of v.stock) {
    const good = goodById(v.id, entry.id);
    const blocked = purchaseBlocked(v.id, entry);
    const btn = document.createElement('button');
    btn.className = 'good';
    btn.disabled = !!blocked;

    const top = document.createElement('div');
    top.className = 'good-top';
    const pic = new Image(28, 28);
    pic.src = spriteUrl(`good:${entry.id}`, () => goodIcon(entry.id, 3));
    pic.className = 'good-icon';
    pic.alt = '';
    top.appendChild(pic);
    const name = document.createElement('span');
    name.className = 'good-name';
    name.textContent = good.name;
    const price = document.createElement('span');
    price.className = `good-price${S.gold < entry.price ? ' cant' : ''}`;
    price.textContent = `${entry.price}g`;
    top.append(name, price);

    const desc = document.createElement('div');
    desc.className = 'good-desc';
    desc.textContent = good.desc;

    const foot = document.createElement('div');
    foot.className = 'good-foot';
    foot.textContent = blocked || (entry.left > 1 ? `${entry.left} left` : 'last one');

    btn.append(top, desc, foot);
    btn.addEventListener('pointerenter', () => sfx('hover'));
    btn.addEventListener('click', () => attemptBuy(entry));
    el.shopGrid.appendChild(btn);
  }
  renderBelt(el.shopBelt, false);
}

function attemptBuy(entry) {
  const v = openVendor;
  if (!v) return;
  const why = purchaseBlocked(v.id, entry);
  if (why) {
    sfx(why === 'not enough gold' ? 'nofunds' : 'deny');
    // The vendor's face is behind the panel, but you see the balloon when you
    // close it — and it tells you which kind of "no" that was.
    vendorReact(v.id, why === 'not enough gold' ? 'anger' : 'sweat', 2.2);
    el.shopLine.textContent = why === 'not enough gold'
      ? 'Come back when your purse is heavier.'
      : `No — ${why}.`;
    return;
  }
  const good = goodById(v.id, entry.id);
  if (!buy(v.id, entry)) { sfx('deny'); return; }

  sfx('buy');
  setTimeout(() => sfx(good.flask ? 'potion' : 'equip'), 140);
  say('confirm');
  vendorReact(v.id, entry.left > 0 ? 'note' : 'heart', 2.4);
  playerReact(good.flask ? 'note' : 'idea', 2);
  el.shopLine.textContent = `“${good.name}.” ${entry.left > 0 ? 'Anything else?' : 'That was the last.'}`;
  buildShop();
  el.shopBelt.dataset.sig = '';
  renderBelt(el.shopBelt, false);
}

// ---------------------------------------------------------------------------
// Saved runs
// ---------------------------------------------------------------------------
let savesMode = 'load';

export function openSaves(mode) {
  savesMode = mode;
  el.savesTitle.textContent = mode === 'save' ? 'Save Run' : 'Saved Runs';
  el.savesSub.textContent = mode === 'save'
    ? 'Pick a slot. Saving overwrites whatever is in it.'
    : 'The market writes to Auto every time you walk in.';
  buildSaves();
  go('savesScreen');
}

/** Say what just happened, in the sub-line under the title. */
function savesMessage(text, bad = false) {
  el.savesNote.textContent = text;
  el.savesNote.style.color = bad ? 'var(--blood)' : 'var(--ember-2)';
}

function buildSaves() {
  el.slotList.innerHTML = '';
  for (const s of slotSummaries()) {
    // You cannot save over the autosave by hand: the market owns that slot.
    if (savesMode === 'save' && s.slot === 'auto') continue;

    const row = document.createElement('button');
    row.className = `save-slot${s.empty ? ' empty' : ''}`;

    if (!s.empty) {
      const img = new Image(44, 44);
      img.src = spriteUrl(`portrait:${s.charId}`, () => heroPortrait(s.charId, 3));
      img.alt = '';
      row.appendChild(img);
    }

    const body = document.createElement('div');
    body.className = 'save-body';
    if (s.empty) {
      body.innerHTML = `<div class="save-title">Slot ${s.slot === 'auto' ? 'Auto' : s.slot}</div>
        <div class="save-meta">empty</div>`;
    } else {
      const ch = characterById(s.charId);
      body.innerHTML = `<div class="save-title">${ch.name} — LV ${s.level}</div>
        <div class="save-meta">${formatTime(s.time)} · ${formatNumber(s.kills)} slain · ${formatNumber(s.gold)}g · ${DIFFICULTIES[s.difficulty]?.label || s.difficulty}</div>
        <div class="save-when">${s.visits} market visit${s.visits === 1 ? '' : 's'} · ${whenText(s.savedAt)}</div>`;
    }
    row.appendChild(body);

    if (s.slot === 'auto') {
      const tag = document.createElement('span');
      tag.className = 'save-tag';
      tag.textContent = 'AUTO';
      row.appendChild(tag);
    }

    row.addEventListener('click', () => useSlot(s));
    row.addEventListener('pointerenter', () => sfx('hover'));
    el.slotList.appendChild(row);

    if (!s.empty && savesMode === 'load') {
      const del = document.createElement('button');
      del.className = 'save-del';
      del.textContent = '×';
      del.title = 'Delete this save';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        clearSlot(s.slot);
        sfx('back');
        buildSaves();
      });
      row.appendChild(del);
    }
  }
}

function useSlot(s) {
  if (savesMode === 'save') {
    const ok = hooks.onSaveRun?.(s.slot);
    sfx(ok ? 'save' : 'deny');
    el.savesSub.textContent = ok
      ? 'Saved. You can close the game and come back to it.'
      : 'This browser will not let the game store anything.';
    buildSaves();
    return;
  }
  if (s.empty) { sfx('deny'); return; }
  hideAll();
  if (!hooks.onLoadRun?.(s.slot)) { sfx('deny'); showTitle(); }
}

function whenText(ts) {
  if (!ts) return 'unknown';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleDateString();
}

export { refreshGold, renderBelt };
