/*
 * Save-transfer test — development only.
 *
 *   node tools/backup-smoke.mjs
 *
 * The export/import pair is the one feature whose failure costs a player
 * something they cannot get back, and both halves run on data that has been
 * off the machine. So this checks the round trip, and then spends most of its
 * time on malformed input: truncated files, the wrong file entirely, negative
 * gold, a slot list that is not a list, a version from the future.
 *
 * The rule being enforced is narrow and worth stating. A hand-edited save is
 * allowed to cheat — that is the player's own game. It is not allowed to break
 * the game, lock the player out of every hero, or make a menu throw.
 */

import './dom-stub.mjs';

const store = await import('../src/core/storage.js');
const saves = await import('../src/core/saves.js');
const backup = await import('../src/core/backup.js');
const { S } = await import('../src/game/state.js');
const { startRun, saveRun } = await import('../src/game/game.js');

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

store.load();

// The UI reads real element ids, so it has to be initialised before any check
// that says "and the menus still build" can mean anything.
const ui = await import('../src/ui/ui.js');
ui.initUI({});

// --- a round trip keeps everything -----------------------------------------
{
  store.resetAll();
  store.addGold(4321);
  store.unlock('leon');
  store.unlock('ada');
  store.setUpgradeLevel('m_might', 4);
  store.recordRun({ time: 733, kills: 9120, level: 61, won: true });

  startRun('leon', 'hard');
  S.gold = 250;
  S.kills = 88;
  saveRun('2');

  const file = JSON.stringify(backup.collect());
  check(file.length > 200, 'the backup is suspiciously small');

  const found = backup.inspect(file);
  check(found.ok, `a freshly written backup did not inspect: ${found.error}`);
  check(found.gold === 4321, `backup reports ${found.gold} gold, expected 4321`);
  check(found.slots.includes('2'), 'the saved run is not in the backup');

  // Wipe the machine, then put it back.
  backup.wipe();
  check(store.meta().gold === 0, 'wipe left gold behind');
  check(!saves.hasSlot('2'), 'wipe left a run behind');

  const res = backup.apply(file);
  check(res.ok, 'apply refused a backup this build had just written');
  check(store.meta().gold === 4321, `gold came back as ${store.meta().gold}`);
  check(store.isUnlocked('leon') && store.isUnlocked('ada'), 'unlocked heroes did not come back');
  check(store.upgradeLevel('m_might') === 4, 'sanctuary upgrades did not come back');
  check(store.records().bestKills === 9120, 'records did not come back');
  check(saves.hasSlot('2'), 'the saved run did not come back');

  const back = saves.readSlot('2');
  check(back && back.kills === 88, 'the restored run lost its detail');
  console.log(`round trip        ok (${res.slots} run, ${res.gold} gold, ${res.unlocked} heroes)`);
}

// --- a filename to file it under -------------------------------------------
{
  const name = backup.suggestedName(new Date(2026, 8, 2, 14, 5));
  check(name === 'grimfall-2026-09-02-1405.grimsave', `filename is "${name}"`);
  console.log(`filename          ok (${name})`);
}

// --- rubbish is refused, not swallowed -------------------------------------
{
  const good = JSON.stringify(backup.collect());
  const bad = [
    ['empty', ''],
    ['not json', 'hello there'],
    ['truncated', good.slice(0, good.length / 2)],
    ['an array', '[]'],
    ['null', 'null'],
    ['some other json', '{"hello":"world"}'],
    ['no magic', JSON.stringify({ format: 1, meta: { gold: 9 } })],
    ['from the future', JSON.stringify({ magic: 'grimfall.backup', format: 99 })],
  ];
  for (const [what, text] of bad) {
    let r;
    try { r = backup.inspect(text); } catch (e) { problems.push(`inspect threw on ${what}: ${e.message}`); continue; }
    check(r && r.ok === false, `${what} was accepted as a save file`);
    check(r && typeof r.error === 'string' && r.error.length > 0, `${what} was refused with no reason`);
  }
  console.log(`bad input         ok (${bad.length} kinds refused with a reason)`);
}

// --- a hostile file may cheat, but must not break anything -----------------
{
  const hostile = {
    magic: 'grimfall.backup',
    format: 1,
    meta: {
      gold: -5000,                       // negative money
      upgrades: { m_might: 'lots', __proto__: 'x' },
      unlocked: [],                      // every hero locked, including the first
      lastCharacter: 42,
    },
    records: { bestTime: 'ages', runs: -3, totalKills: null },
    slots: { auto: 'not an object', '9': { player: {} } },
  };
  const r = backup.apply(hostile);
  check(r.ok, 'a survivable-but-nasty file was rejected outright');
  check(store.meta().gold >= 0, `gold went negative: ${store.meta().gold}`);
  check(store.isUnlocked('ranger'), 'the starting hero got locked out');
  check(Number.isFinite(store.records().bestTime), 'bestTime is not a number');
  check(store.records().runs >= 0, 'run count went negative');
  check(typeof store.meta().lastCharacter === 'string', 'lastCharacter is not a string');
  check(Object.getPrototypeOf(store.meta().upgrades) === Object.prototype,
    'the upgrades map had its prototype replaced');
  check({}.m_might === undefined && {}.polluted === undefined,
    'a key from the file reached Object.prototype');
  check(Object.values(store.meta().upgrades).every(Number.isFinite), 'a non-numeric upgrade level got through');
  // And the menus still build from it.
  try { ui.refreshMeta(); } catch (e) { problems.push(`refreshMeta threw after a hostile import: ${e.message}`); }
  console.log('hostile input     ok (clamped and coerced, menus still build)');
}

// --- importing an old backup does not delete newer runs --------------------
{
  store.resetAll();
  startRun('ranger', 'normal');
  saveRun('1');
  const onlySlot1 = JSON.stringify(backup.collect());

  startRun('ranger', 'normal');
  saveRun('3');
  check(saves.hasSlot('3'), 'setup: slot 3 was not written');

  backup.apply(onlySlot1);
  check(saves.hasSlot('3'), 'importing an older backup deleted a run it did not mention');
  console.log('non-destructive   ok (slots the file omits are left alone)');
}

// --- settings only come across when asked -----------------------------------
{
  store.resetAll();
  store.setSetting('musicVol', 0.11);
  const file = backup.collect();
  file.settings = { ...file.settings, musicVol: 0.99 };

  backup.apply(file);
  check(store.settings().musicVol === 0.11, 'settings were imported without being asked for');
  backup.apply(file, { settings: true });
  check(store.settings().musicVol === 0.99, 'settings were not imported when asked for');
  console.log('settings          ok (opt-in, not automatic)');
}

if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('\nAll backup checks passed.');
