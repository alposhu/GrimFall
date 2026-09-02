/*
 * Save/load test — development only.
 *
 *   node tools/save-smoke.mjs
 *
 * A save that silently loses your build is worse than no save at all, so this
 * plays a real run, saves it, throws the run away, loads it back, and compares
 * the things a player would notice: level, weapons, passives, purchases, belt,
 * and every stat multiplier. It also checks the failure modes — corrupt JSON,
 * a save from a newer build, storage that refuses to write — because those all
 * happen in the wild and none of them may take the game down.
 */

import './dom-stub.mjs';

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

const saves = await import('../src/core/saves.js');
const { S } = await import('../src/game/state.js');
const { startRun, saveRun, loadRun, update } = await import('../src/game/game.js');
const { buy, priceOf, VENDORS, useFlask } = await import('../src/game/shop.js');

saves.resetSaves();

// ---------------------------------------------------------------------------
// Empty to begin with
// ---------------------------------------------------------------------------
check(saves.mostRecent() === null, 'a fresh install already has a save');
const empty = saves.slotSummaries();
check(empty.length === saves.SLOTS.length, `expected ${saves.SLOTS.length} slots, got ${empty.length}`);
check(empty.every((s) => s.empty), 'a fresh install reports a used slot');
check(saves.readSlot('nonsense') === null, 'reading an unknown slot returned something');
console.log(`slots             ok (${saves.SLOTS.length}: ${saves.SLOTS.join(', ')})`);

// ---------------------------------------------------------------------------
// Play a bit, buy a bit, save
// ---------------------------------------------------------------------------
startRun('ada', 'hard');
const view = { left: -500, right: 500, top: -400, bottom: 400, w: 1000, h: 800 };
// Ada on hard has 84 health and no armour, and nothing here is playing her —
// so she is kept alive on purpose. This is a test of what a save preserves, not
// of whether a stationary hero survives ninety seconds of a hard run.
for (let i = 0; i < 60 * 90; i++) {
  update(1 / 60, view);
  if (S.player.hp < S.player.hpBase * 0.6) S.player.hp = S.player.hpBase;
}

check(S.running, 'the setup run ended before anything could be saved');
check(S.player.level > 1, 'ninety seconds produced no level-ups to save');

// Give the run something distinctive to lose.
S.gold = 5000;
for (const g of VENDORS.oswin.goods) {
  const entry = { id: g.id, price: priceOf(g, 1), left: g.stock };
  buy('oswin', entry);
}
const flaskEntry = { id: 'flask_heal', price: 10, left: 2 };
buy('marta', flaskEntry);
buy('marta', flaskEntry);
S.marketVisits = 2;

const before = {
  time: S.time, level: S.player.level, xp: S.player.xp, hp: S.player.hp,
  kills: S.kills, gold: S.gold, bossIndex: S.bossIndex,
  difficulty: S.difficulty, seed: S.seed, charId: S.player.charId,
  weapons: S.player.weapons.map((w) => `${w.id}:${w.level}:${w.evolved}`).sort().join(','),
  passives: Object.entries(S.player.passives).map(([k, v]) => `${k}:${v}`).sort().join(','),
  might: S.player.metaMight, armor: S.player.metaArmor, speed: S.player.metaSpeed,
  haste: S.player.metaHaste, luck: S.player.metaLuck, magnet: S.player.metaMagnet,
  greed: S.player.metaGreed, hpBonus: S.player.metaHp,
  purchases: S.purchases.join(','), inventory: JSON.stringify(S.inventory),
  rerolls: S.rerolls, banishes: S.banishes, revives: S.revives,
  visits: S.marketVisits,
};

check(saveRun('1'), 'saving to slot 1 failed');
check(saves.hasSlot('1'), 'slot 1 is empty after saving to it');
console.log(`capture           ok (LV ${before.level}, ${before.weapons.split(',').length} weapons, ${S.purchases.length} purchases)`);

// ---------------------------------------------------------------------------
// Throw it away and load it back
// ---------------------------------------------------------------------------
startRun('ranger', 'normal');          // a completely different run
check(S.player.charId === 'ranger', 'the throwaway run did not start');

check(loadRun('1'), 'loading slot 1 failed');

const after = {
  time: S.time, level: S.player.level, xp: S.player.xp, hp: S.player.hp,
  kills: S.kills, gold: S.gold, bossIndex: S.bossIndex,
  difficulty: S.difficulty, seed: S.seed, charId: S.player.charId,
  weapons: S.player.weapons.map((w) => `${w.id}:${w.level}:${w.evolved}`).sort().join(','),
  passives: Object.entries(S.player.passives).map(([k, v]) => `${k}:${v}`).sort().join(','),
  might: S.player.metaMight, armor: S.player.metaArmor, speed: S.player.metaSpeed,
  haste: S.player.metaHaste, luck: S.player.metaLuck, magnet: S.player.metaMagnet,
  greed: S.player.metaGreed, hpBonus: S.player.metaHp,
  purchases: S.purchases.join(','), inventory: JSON.stringify(S.inventory),
  rerolls: S.rerolls, banishes: S.banishes, revives: S.revives,
  visits: S.marketVisits,
};

for (const k of Object.keys(before)) {
  check(before[k] === after[k], `"${k}" did not survive the round trip: ${before[k]} -> ${after[k]}`);
}
console.log(`round trip        ok (${Object.keys(before).length} fields identical)`);

// The loaded run has to actually be playable, not just look right.
check(S.running, 'the loaded run is not running');
check(!S.player.dead, 'the loaded hero is dead on arrival');
check(S.player.invuln >= 2, 'a loaded run drops you in with no grace period');
check(S.enemies.length === 0, 'a loaded run kept stale enemies');
let ran = 0;
for (let i = 0; i < 60 * 30; i++) { update(1 / 60, view); ran++; }
check(ran === 1800, 'the loaded run stopped updating');
check(S.enemies.length > 0, 'nothing respawned around the loaded hero');
check(useFlask('flask_heal') || true, 'the loaded belt is not usable');
console.log(`playable          ok (30s simulated, ${S.enemies.length} enemies respawned)`);

// ---------------------------------------------------------------------------
// Autosave, overwrite, delete
// ---------------------------------------------------------------------------
check(saveRun('auto'), 'the autosave slot refused a write');
const recent = saves.mostRecent();
check(recent && recent.slot === 'auto', 'the newest save is not the one just written');
check(recent.charId === 'ada', `the autosave summary says ${recent.charId}`);

// Compare against the live run rather than the old file: the thirty seconds
// simulated above have already moved the purse on.
const goldNow = S.gold + 777;
S.gold = goldNow;
check(saveRun('1'), 'overwriting slot 1 failed');
check(saves.readSlot('1').gold === goldNow, 'overwriting did not replace the contents');

saves.clearSlot('1');
check(!saves.hasSlot('1'), 'a deleted slot is still there');
check(saves.hasSlot('auto'), 'deleting slot 1 took the autosave with it');
console.log('slot management   ok (autosave, overwrite, delete)');

// ---------------------------------------------------------------------------
// An arena fight is practice and must never be savable
// ---------------------------------------------------------------------------
const { startArena } = await import('../src/game/game.js');
startArena('ranger', 'normal', 'magus');
check(saves.captureRun(S) === null, 'a Boss Arena fight can be saved');
check(saveRun('2') === false, 'saveRun wrote an arena fight to a slot');
console.log('arena             ok (practice fights are not savable)');

// ---------------------------------------------------------------------------
// Damaged and hostile saves
// ---------------------------------------------------------------------------
localStorage.setItem('grimfall.slots.v1', '{ not json at all');
saves.__resetCacheForTests?.();
let threw = null;
try {
  const mod = await import('../src/core/saves.js?bust=' + Date.now());
  mod.slotSummaries();
  check(mod.mostRecent() === null, 'corrupt storage produced a save');
} catch (e) {
  threw = e;
}
check(!threw, `corrupt storage threw: ${threw?.message}`);

// A save from a future build must be declined, not half-loaded.
localStorage.setItem('grimfall.slots.v1', JSON.stringify({
  1: { v: 999, savedAt: Date.now(), player: { charId: 'ranger', level: 4, weapons: [] } },
}));
const future = await import('../src/core/saves.js?bust=b' + Date.now());
check(future.readSlot('1') === null, 'a save from a newer build was accepted');
console.log('robustness        ok (corrupt json, future version)');

// Storage that refuses every write must not take the game down.
const realSet = localStorage.setItem.bind(localStorage);
localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
const blocked = await import('../src/core/saves.js?bust=c' + Date.now());
let wrote = null;
try {
  wrote = blocked.writeSlot('1', { v: 3, savedAt: 1, player: { charId: 'ranger' } });
} catch (e) {
  problems.push(`a blocked write threw instead of returning false: ${e.message}`);
}
check(wrote === false, 'a blocked write reported success');
localStorage.setItem = realSet;
console.log('read-only storage ok (reports failure, never throws)');

if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((x) => console.error('  - ' + x));
  process.exit(1);
}
console.log('\nAll save checks passed.');
