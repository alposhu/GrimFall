/*
 * Food test — development only.
 *
 *   node tools/food-smoke.mjs
 *
 * Food is the only pickup with two possible outcomes, and which one you get
 * depends on how hurt you are when you walk over it: it heals what it can, and
 * whatever it could not heal becomes experience instead. That split is easy to
 * get subtly wrong — double-paying, paying nothing at a hair below full health,
 * or scaling so badly that a dumpling is two levels at minute one — so each
 * case is walked through here with a real pickup and a real collection.
 */

import './dom-stub.mjs';

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

const { S, spawnPickup, maxHp } = await import('../src/game/state.js');
const { startRun, update } = await import('../src/game/game.js');
const { FOODS, FOOD_IDS, foodHeal, foodName } = await import('../src/art/food.js');
const { xpForLevel } = await import('../src/game/config.js');

const view = { left: -600, right: 600, top: -400, bottom: 400, w: 1200, h: 800 };

/** Drop one meal on the player's head and let the pickup loop collect it. */
function eat(variant) {
  const p = S.player;
  const before = { hp: p.hp, xp: p.xp, level: p.level, pending: S.pendingLevels };
  spawnPickup('food', p.x, p.y, 0, variant);
  const it = S.pickups[S.pickups.length - 1];
  it.vx = 0; it.vy = 0;
  for (let i = 0; i < 60 && S.pickups.includes(it); i++) update(1 / 60, view);
  check(!S.pickups.includes(it), `${variant} was never picked up`);
  // Levels consume xp, so measure the gain in total experience earned.
  let gained = p.xp - before.xp;
  for (let l = before.level; l < p.level; l++) gained += xpForLevel(l);
  return { healed: p.hp - before.hp, xp: gained, levels: p.level - before.level, before };
}

/** Strip everything that would let something other than the meal change hp/xp. */
function cleanRun(hpFraction) {
  startRun('warden', 'normal');
  S.enemies.length = 0;
  S.pickups.length = 0;
  S.player.weapons = [];
  S.player.passives = {};
  S.player.invuln = 9999;
  S.player.metaGrowth = 1;
  S.spawnAccum = -1e9;               // no reinforcements mid-measurement
  S.player.hp = maxHp() * hpFraction;
  S.pendingLevels = 0;
  return S.player;
}

// ---------------------------------------------------------------------------
// 1. Hurt: it all goes into health
// ---------------------------------------------------------------------------
{
  const p = cleanRun(0.1);
  const r = eat('etli_ekmek');
  check(r.healed > 0, 'a hurt hero got no health from a meal');
  check(Math.abs(r.healed - foodHeal('etli_ekmek')) < 0.001,
    `etli ekmek healed ${r.healed}, expected ${foodHeal('etli_ekmek')}`);
  check(r.xp === 0, `a meal eaten while hurt paid ${r.xp} experience it should not have`);
  void p;
  console.log(`hurt              ok (+${r.healed} health, no experience)`);
}

// ---------------------------------------------------------------------------
// 2. Full: it all becomes experience
// ---------------------------------------------------------------------------
{
  const p = cleanRun(1);
  check(p.hp === maxHp(), 'the test did not start at full health');
  const r = eat('lasagna');
  check(r.healed === 0, `a full-health hero healed ${r.healed}`);
  check(r.xp > 0, 'a meal eaten at full health was wasted — it should pay experience');
  check(p.hp === maxHp(), 'eating at full health changed the health total');
  console.log(`full              ok (+${r.xp} experience, no health)`);
}

// ---------------------------------------------------------------------------
// 3. Nearly full: the split, with nothing lost or double-paid
// ---------------------------------------------------------------------------
{
  const p = cleanRun(1);
  const heal = foodHeal('dumpling');
  p.hp = maxHp() - heal * 0.25;      // room for a quarter of the meal
  const r = eat('dumpling');
  check(Math.abs(r.healed - heal * 0.25) < 0.01, `expected to heal ${heal * 0.25}, healed ${r.healed}`);
  check(r.xp > 0, 'the three quarters that could not heal paid nothing');

  // The same meal on a hero with only a sliver of room must pay more experience
  // than one with plenty of room — the split has to be proportional.
  const p2 = cleanRun(1);
  p2.hp = maxHp() - heal * 0.9;
  const r2 = eat('dumpling');
  check(r2.xp < r.xp, 'a hero with more room to heal was paid the same experience');
  check(r2.healed > r.healed, 'the hungrier hero healed less');
  console.log(`partial           ok (a quarter eaten -> ${r.xp} xp, nine tenths eaten -> ${r2.xp} xp)`);
}

// ---------------------------------------------------------------------------
// 4. The payout is priced against the level, not flat
// ---------------------------------------------------------------------------
{
  const at = (level) => {
    const p = cleanRun(1);
    p.level = level;
    p.xpNext = xpForLevel(level);
    return eat('lasagna').xp;
  };
  const early = at(2), mid = at(25), late = at(60);
  check(early > 0 && mid > early && late > mid,
    `the payout does not scale with level: ${early} / ${mid} / ${late}`);
  // A whole meal should be worth a useful slice of a level at any point, and
  // never a free level.
  for (const [lvl, xp] of [[2, early], [25, mid], [60, late]]) {
    const share = xp / xpForLevel(lvl);
    check(share > 0.05 && share < 0.4,
      `at level ${lvl} a meal is worth ${(share * 100).toFixed(0)}% of a level — out of range`);
  }
  console.log(`scaling           ok (lv2 ${early}xp, lv25 ${mid}xp, lv60 ${late}xp — ~a fifth of a level each)`);
}

// ---------------------------------------------------------------------------
// 5. Every dish on the menu works, hurt and full
// ---------------------------------------------------------------------------
{
  let healedAll = 0, paidAll = 0;
  for (const id of FOOD_IDS) {
    cleanRun(0.05);
    const hurt = eat(id);
    check(hurt.healed > 0, `${foodName(id)} healed nothing when hurt`);
    check(hurt.xp === 0, `${foodName(id)} paid experience while hurt`);
    healedAll++;

    cleanRun(1);
    const full = eat(id);
    check(full.healed === 0, `${foodName(id)} healed at full health`);
    check(full.xp > 0, `${foodName(id)} paid nothing at full health`);
    paidAll++;
  }
  check(healedAll === FOOD_IDS.length && paidAll === FOOD_IDS.length, 'a dish behaved differently');
  console.log(`every dish        ok (${FOOD_IDS.length} meals, both outcomes)`);
}

// ---------------------------------------------------------------------------
// 6. It cannot be farmed into a level
// ---------------------------------------------------------------------------
{
  cleanRun(1);
  const r = eat(FOOD_IDS.reduce((a, b) => (FOODS[a].heal > FOODS[b].heal ? a : b)));
  check(r.levels === 0, 'the richest meal on the menu granted a whole level at full health');
  console.log('no free level     ok (the richest dish does not level you on its own)');
}

if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((x) => console.error('  - ' + x));
  process.exit(1);
}
console.log('\nAll food checks passed.');
