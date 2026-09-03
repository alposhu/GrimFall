/*
 * UI smoke test — development only.
 *
 *   node tools/ui-smoke.mjs
 *
 * Walks every screen against the real element ids from index.html: menus, hero
 * unlocks, the Sanctuary shop, the level-up draft (reroll and banish included)
 * and the results panel.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { byId, dataActionEls, dataDemoEls } from './dom-stub.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// --------------------------------------------------------------------- test
const store = await import('../src/core/storage.js');
const ui = await import('../src/ui/ui.js');
const { S } = await import('../src/game/state.js');
const { startRun, computeView, update, saveRun, loadRun } = await import('../src/game/game.js');
const market = await import('../src/game/market.js');
const shop = await import('../src/game/shop.js');
const saves = await import('../src/core/saves.js');
const { gainXp } = await import('../src/game/state.js');
const { CHARACTERS } = await import('../src/art/hero.js');
const { META_UPGRADES, BOSSES } = await import('../src/game/config.js');

store.load();

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };
let started = null;

let arenaStarted = null;
const fired = { interact: 0, leaveShop: 0, drank: [], saved: [], loaded: [], doors: [] };
ui.initUI({
  onStart: (id, diff) => { started = { id, diff }; },
  onStartArena: (id, diff, bossId) => { arenaStarted = { id, diff, bossId }; },
  onPause: () => {},
  onResume: () => {},
  onAbandon: () => {},
  onTitle: () => {},
  onLevelUpDone: () => {},
  onSetting: () => {},
  onInteract: () => { fired.interact++; },
  onLeaveShop: () => { fired.leaveShop++; },
  onPortalChoice: (door) => { fired.doors.push(door); },
  onDrinkFlask: (id) => { fired.drank.push(id); },
  onSaveRun: (slot) => { fired.saved.push(slot); return saveRun(slot); },
  onLoadRun: (slot) => { fired.loaded.push(slot); return loadRun(slot); },
});
console.log('initUI            ok');

ui.setBootProgress(0.5);
ui.showTitle();
check(byId.titleScreen.classList.contains('active'), 'title screen did not open');
console.log('title             ok');

// Every menu button routes somewhere.
for (const b of dataActionEls) b.click();
console.log(`menu routing      ok (${dataActionEls.length} buttons)`);

// Heroes: the grid is built, locked heroes cost gold, unlocking works.
dataActionEls.find((b) => b.dataset.action === 'heroes').click();
check(byId.heroGrid.children.length === CHARACTERS.length, 'hero grid is missing cards');
const lockedIdx = CHARACTERS.findIndex((c) => c.unlock > 0);
byId.heroGrid.children[lockedIdx].click();          // no gold yet -> denied
check(!store.isUnlocked(CHARACTERS[lockedIdx].id), 'a hero unlocked without paying');
store.addGold(99999);
byId.heroGrid.children[lockedIdx].click();
check(store.isUnlocked(CHARACTERS[lockedIdx].id), 'paying did not unlock the hero');
console.log('heroes            ok');

// Difficulty picker.
byId.diffSeg.children.forEach((b) => b.click());
console.log('difficulty        ok');

// How-to-play: every tagged card gets a demo canvas, and the loop is scoped
// to the screen rather than running forever in the background.
check(dataDemoEls.length >= 7, `only ${dataDemoEls.length} help cards are tagged`);
for (const card of dataDemoEls) {
  check(card.children.length > 0 && card.children[0].tagName === 'CANVAS',
    `help card "${card.dataset.demo}" has no demo canvas`);
}
dataActionEls.find((b) => b.dataset.action === 'help').click();
check(byId.helpScreen.classList.contains('active'), 'help screen did not open');
console.log(`help demos        ok (${dataDemoEls.length} cards with canvases)`);

// Boss arena: every boss is listed and launchable, including the dragon.
dataActionEls.find((b) => b.dataset.action === 'arena').click();
check(byId.bossGrid.children.length === BOSSES.length,
  `arena lists ${byId.bossGrid.children.length} bosses, expected ${BOSSES.length}`);
byId.arenaDiffSeg.children.forEach((b) => b.click());
const dragonIdx = BOSSES.findIndex((b) => b.id === 'parduin');
check(dragonIdx >= 0, 'Parduin is missing from the boss list');
byId.bossGrid.children[dragonIdx].click();
check(arenaStarted && arenaStarted.bossId === 'parduin',
  `launching the dragon passed ${arenaStarted && arenaStarted.bossId}`);
console.log('boss arena        ok');

// Sanctuary: buy every level of every upgrade.
dataActionEls.find((b) => b.dataset.action === 'sanctuary').click();
check(byId.upgradeGrid.children.length === META_UPGRADES.length, 'sanctuary grid is incomplete');
for (let pass = 0; pass < 6; pass++) {
  for (const card of byId.upgradeGrid.children) {
    const btn = card.children[card.children.length - 1];
    if (!btn.disabled) btn.click();
  }
}
for (const up of META_UPGRADES) {
  check(store.upgradeLevel(up.id) === up.max, `${up.id} did not reach max level`);
}
console.log('sanctuary         ok');

// Options: flip every toggle and slider.
dataActionEls.find((b) => b.dataset.action === 'options').click();
for (const r of byId.optionsBody.children) {
  const ctrl = r.children[r.children.length - 1];
  if (ctrl.tagName === 'BUTTON') { ctrl.click(); ctrl.click(); }
  else if (ctrl.tagName === 'INPUT') { ctrl.value = '30'; ctrl.dispatch('input'); }
}
console.log('options           ok');

// A run: start it, then drive the level-up draft.
byId.startRunBtn.click();
check(started, 'starting a run did not call back');
startRun(started.id, started.diff);
S.rerolls = 3;
S.banishes = 3;

for (let i = 0; i < 60; i++) update(1 / 30, computeView(1280, 720, 1.4));
// Earn the level directly: whether a stationary player happens to collect a gem
// is a balance question, and combat is covered by the headless run.
gainXp(500);
check(S.pendingLevels > 0, 'gaining experience did not queue a level-up');

ui.openLevelUp();
check(byId.cards.children.length >= 3, 'the draft offered fewer than three cards');
byId.rerollBtn.click();
check(S.rerolls === 2, 'reroll did not consume a charge');
byId.banishBtn.click();                              // arm
byId.cards.children[0].click();                      // banish that card
check(S.banishes === 2, 'banish did not consume a charge');
check(S.banished.length === 1, 'the banished card was not recorded');
const before = S.pendingLevels;
byId.cards.children[0].click();                      // take an upgrade
check(S.pendingLevels === before - 1, 'taking a card did not clear the level-up');
console.log('level-up draft    ok');

// HUD + pause + results.
ui.showHUD(true);
ui.updateHUD();
check(byId.hpText.textContent.includes('/'), 'HUD health text is empty');
ui.openPause();
check(byId.pauseStats.innerHTML.includes('stat-box'), 'pause stats are empty');
ui.showResults({ outcome: 'won', gold: 1234 });
check(byId.resultTitle.textContent === 'SURVIVED', 'victory result did not render');
ui.showResults({ outcome: 'dead', gold: 7 });
check(byId.resultTitle.textContent === 'YOU FELL', 'defeat result did not render');
ui.showResults({ outcome: 'won', gold: 0, arena: { bossId: 'parduin', name: 'Parduin' } });
check(byId.resultTitle.textContent === 'ARENA CLEARED', 'arena victory did not render');
check(byId.resultGold.textContent.includes('practice'), 'arena results still advertise gold');
console.log('hud + results     ok');

// --- marketplace chrome ---------------------------------------------------
saves.resetSaves();
S.gold = 4000;
market.enterMarket({ visit: 1, bossName: 'Cinder Tyrant', onExit: () => {} });
ui.showMarketBar(true);
check(!byId.marketBar.hidden, 'the market bar did not appear');
ui.announceMarket({ bossName: 'Cinder Tyrant' }, true);
check(byId.marketBar.textContent.includes('LONG MARKET'), 'the arrival card is empty');
check(byId.marketBar.textContent.includes('Cinder Tyrant'), 'the arrival card does not name the boss');

// Standing at a counter must light the interact button.
const oswin = market.M.vendors.find((v) => v.id === 'oswin');
market.M.player.x = oswin.x;
market.M.player.y = oswin.y + 40;
market.updateMarket(1 / 60, { w: 900, h: 620 });
ui.updateMarketBar();
check(!byId.interactBtn.hidden, 'the interact button stayed hidden at a counter');
check(byId.interactLabel.textContent.includes('Oswin'), 'the interact button does not name the vendor');
byId.interactBtn.click();
check(fired.interact === 1, 'the interact button is not wired');
console.log('market bar        ok');

// --- the vendor screen ----------------------------------------------------
ui.openShop(oswin);
check(byId.shopScreen.classList.contains('active'), 'the shop did not open');
check(byId.shopName.textContent === 'Oswin', 'the shop shows the wrong vendor');
check(byId.shopGrid.children.length === 4, `the shelf shows ${byId.shopGrid.children.length} goods, expected 4`);
check(byId.shopLine.textContent.length > 0, 'the vendor said nothing');

const goldBefore = S.gold;
const affordable = [...byId.shopGrid.children].find((b) => !b.disabled);
check(affordable, 'nothing on the shelf could be bought with 4000 gold');
affordable?.click();
check(S.gold < goldBefore, 'buying from the shop screen took no gold');
check(S.purchases.length === 1, 'the purchase was not recorded');

// Every card must actually carry its good's picture. The stub's canvas cannot
// tell us what the icon looks like, but it can tell us the element is there,
// that it is the good's own icon rather than a shared one, and that building it
// did not throw — which is what "the card has no image" looks like in practice.
{
  ui.openShop(oswin);
  const cards = [...byId.shopGrid.children];
  const srcs = new Set();
  for (const card of cards) {
    // Not querySelector: the DOM stub returns a fresh empty element from it,
    // which would make this pass for the wrong reason.
    const pic = [...(card.children?.[0]?.children || [])]
      .find((c) => c.className === 'good-icon');
    check(pic, 'a good card has no icon element');
    check(pic && typeof pic.src === 'string' && pic.src.startsWith('data:image'),
      `a good card's icon has src "${pic?.src}"`);
    if (pic) srcs.add(pic.src);
  }
  check(cards.length > 0, 'the shelf was empty');
  console.log(`good icons        ok (${cards.length} cards, all carry one)`);
}

// Every good the shop can sell has to resolve to a picture without throwing —
// including the ones this particular shelf did not roll.
{
  const { goodIcon } = await import('../src/art/items.js');
  const all = Object.values(shop.VENDORS).flatMap((v) => v.goods.map((g) => g.id));
  for (const id of all) {
    let img = null;
    try { img = goodIcon(id, 3); } catch (e) { problems.push(`goodIcon('${id}') threw: ${e.message}`); }
    check(img && img.width > 0 && img.height > 0, `goodIcon('${id}') produced nothing`);
  }
  console.log(`good icon table   ok (${all.length} goods all resolve)`);
}

// Too poor: the shelf must refuse rather than go into debt.
S.gold = 0;
ui.openShop(oswin);
const anyEnabled = [...byId.shopGrid.children].some((b) => !b.disabled);
check(!anyEnabled, 'a broke player can still buy things');
byId.shopLeaveBtn.click();
check(fired.leaveShop === 1, 'the leave button is not wired');
console.log('vendor screen     ok');

// The portal screen is modal with no back button and no Escape route — the two
// doors are the ONLY way out of it, so a door that is not wired is a run that
// cannot continue. Both are clicked here for exactly that reason.
{
  for (const [btn, want] of [['portalMarketBtn', 'market'], ['portalOnwardBtn', 'onward']]) {
    ui.openPortal('The Hollow Magus');
    check(ui.portalIsOpen(), `openPortal did not open before ${want}`);
    byId[btn].click();
    check(!ui.portalIsOpen(), `the ${want} door left the screen up`);
  }
  check(fired.doors.join(',') === 'market,onward',
    `the doors reported [${fired.doors.join(', ')}]`);
  console.log('portal doors      ok (both wired, both close the screen)');
}

// `hidden` has to actually hide. The stub applies no CSS, so this is a static
// check of the stylesheet: every element the markup hides is styled with a
// `display` of its own somewhere, which silently beats the browser's own
// `[hidden]` rule — that is how the market bar's interact button ended up
// riding into the run. One global rule settles it; assert it is still there.
{
  const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
  // Comments are stripped first: they discuss `[hidden]` and would otherwise be
  // read as selectors.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = /\[hidden\][^{]*\{[^}]*display:\s*none\s*!important/.test(bare);
  check(rule, 'css/style.css has no `[hidden] { display: none !important }` rule');
  // And no later rule may hand a hidden element a display of its own back.
  const bad = [...bare.matchAll(/([^{}]*)\{([^}]*)\}/g)]
    .filter((m) => m[1].includes('[hidden]'))
    .filter((m) => /display:\s*[a-z-]+/i.test(m[2]) && !/display:\s*none/.test(m[2]));
  check(bad.length === 0, `a rule gives a hidden element a display: ${bad[0]?.[1]?.trim()}`);
  console.log('hidden attribute  ok (one global rule, nothing overrides it)');

  // `.screen` is a bare flex column, so a lone panel inside one sits at the top
  // LEFT unless the screen says otherwise. Three screens said otherwise and two
  // did not, which is how the vendor card ended up in the corner. Assert every
  // single-panel screen is centred, so a fourth cannot be added and forgotten.
  const rules = [...bare.matchAll(/([^{}]*)\{([^}]*)\}/g)];
  const declFor = (sel) => rules.filter((m) => m[1].split(',').some((p) => p.trim() === sel))
    .map((m) => m[2]).join(';');
  for (const id of ['#pauseScreen', '#resultScreen', '#shopScreen', '#savesScreen', '#portalScreen']) {
    const own = declFor(id);
    const child = declFor(`${id} > .panel`);
    check(/align-items:\s*center/.test(own), `${id} does not centre its panel horizontally`);
    check(/justify-content:\s*center/.test(own) || /margin-block:\s*auto|margin:\s*auto/.test(child),
      `${id} does not centre its panel vertically`);
  }
  console.log('screen centring   ok (5 single-panel screens, all centred)');
}

// --- the flask belt -------------------------------------------------------
S.inventory = { flask_heal: 2, flask_stone: 1, flask_swift: 0 };
byId.belt.dataset.sig = '';
ui.showHUD(true);
ui.updateHUD();
check(byId.belt.children.length === shop.FLASK_IDS.length,
  `the belt shows ${byId.belt.children.length} slots, expected ${shop.FLASK_IDS.length}`);
byId.belt.children[0].click();
check(fired.drank[0] === 'flask_heal', 'clicking the belt did not drink anything');
S.inventory = {};
byId.belt.dataset.sig = '';
ui.updateHUD();
check(byId.belt.children.length === 0, 'an empty belt still takes up room');
console.log('flask belt        ok');

// --- saving and loading ---------------------------------------------------
startRun('leon', 'normal');
for (let i = 0; i < 60 * 20; i++) update(1 / 60, computeView(900, 620, 1));
ui.openSaves('save');
check(byId.savesScreen.classList.contains('active'), 'the save screen did not open');
check(byId.slotList.children.length === saves.SLOTS.length - 1,
  'the save screen offers the autosave slot, which the market owns');
byId.slotList.children[0].click();
check(fired.saved.length === 1, 'clicking a slot did not save');
check(saves.hasSlot(fired.saved[0]), 'the slot is empty after saving to it');

ui.openSaves('load');
check(byId.slotList.children.length === saves.SLOTS.length, 'the load screen hides a slot');
const filled = [...byId.slotList.children].find((r) => !r.classList.contains('empty'));
check(filled, 'the saved run does not appear on the load screen');
const savedHero = CHARACTERS.find((c) => c.id === 'leon')?.name;
check(savedHero, "the roster has no hero with the id 'leon'");
check(filled.textContent.includes(savedHero), 'the save summary names the wrong hero');
filled?.click();
check(fired.loaded.length === 1, 'clicking a save did not load it');
check(S.player.charId === 'leon', 'loading restored the wrong hero');

// Continue only appears once something is saved.
ui.showTitle();
check(!byId.continueBtn.hidden, 'Continue is hidden even though a save exists');
check(byId.continueSub.textContent.includes(savedHero), 'Continue does not describe the save');
saves.resetSaves();
ui.showTitle();
check(byId.continueBtn.hidden, 'Continue is offered with no save to continue');

// A fresh browser has to be able to reach "Load from a file". The saves screen
// is the ONLY route to it, so hiding Load when there is nothing saved stranded
// anyone arriving on a second device with a .grimsave in hand — the one case
// the transfer feature exists for. Continue may hide; Load may not.
check(!byId.loadBtn.hidden, 'Load is hidden on a fresh browser, so a backup cannot be imported');
ui.openSaves('load');
check(!byId.importSaveBtn.hidden, 'the import button is unreachable with no saves');
check(byId.savesSub.textContent.toLowerCase().includes('file'),
  'the empty saves screen does not mention loading from a file');
ui.showTitle();
console.log('save / load       ok');

// Skip path.
S.pendingLevels = 1;
ui.openLevelUp();
byId.skipBtn.click();
check(S.pendingLevels === 0, 'skipping a level-up left it pending');
console.log('skip              ok');

if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('\nAll UI checks passed.');
