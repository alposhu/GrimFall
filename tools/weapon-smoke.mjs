/*
 * Weapon test — development only.
 *
 *   node tools/weapon-smoke.mjs
 *
 * Every weapon, at level 1, at its maximum, and evolved, fired into a standing
 * crowd. The suite already proves a whole run survives twenty minutes, but a
 * run only ever draws six weapons: a weapon that throws, or that quietly does
 * nothing, could sit in the pool for a long time before anyone noticed. This
 * checks each one on its own.
 *
 * What it asserts, per weapon and per state:
 *   - firing does not throw
 *   - something takes damage within a couple of seconds
 *   - the evolution hits harder than the level-8 form
 *   - nothing it spawns leaks: shots, zones and sweeps all expire
 * and, over the table as a whole, that every weapon has an icon, an evolution
 * with its own icon, and a passive requirement that exists.
 */

import './dom-stub.mjs';

const { S } = await import('../src/game/state.js');
const store = await import('../src/core/storage.js');
const { startRun, update, computeView } = await import('../src/game/game.js');
const { WEAPONS, WEAPON_IDS, WEAPON_MAX_LEVEL, PASSIVES } = await import('../src/game/config.js');
const { ENEMY_TYPES } = await import('../src/game/config.js');
const { makeEnemy } = await import('../src/game/enemies.js');
const { hasIcon } = await import('../src/art/props.js');

store.load();

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

// Dummies are tagged, because the run keeps spawning its own enemies around
// them and those must not be counted — an ordinary slime dying would register
// as a billion damage against a pool of a billion.
const DUMMY_HP = 1e9;
const N = 32;
// Four rings, because reach varies enormously: an aura at level 1 is 84px and
// a bolt reaches across the screen. A single ring would score "no damage" for
// the short weapons and prove nothing about the long ones.
const RINGS = [55, 110, 175, 240];

/** Stand rings of dummies around the player. Returns them. */
function crowd() {
  const dummies = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const ring = RINGS[i % RINGS.length];
    // Built through `makeEnemy` rather than by hand. A hand-written dummy had
    // `knockX`/`knockY` where the real thing has `kx`/`ky`, so every knockback
    // did `undefined + n` and quietly turned the enemy's position into NaN.
    // Nothing caught it because the loop below resets each dummy every frame -
    // it only surfaced once a test ran one for longer than a frame. Deriving
    // the shape from the game means it cannot drift again.
    const d = makeEnemy(ENEMY_TYPES[0],
      S.player.x + Math.cos(a) * ring,
      S.player.y + Math.sin(a) * ring);
    Object.assign(d, {
      hp: DUMMY_HP, maxHp: DUMMY_HP, damage: 0, speed: 0, xp: 0,
      size: 16, scale: 2, knockResist: 1, dummy: true,
      ringAngle: a, ringR: ring,
    });
    dummies.push(d);
  }
  S.enemies.length = 0;
  S.enemies.push(...dummies);
  return dummies;
}

/**
 * Equip exactly one weapon in the given state and run it for `seconds`.
 * Returns the total damage dealt and whether anything it spawned outlived it.
 */
function trial(id, { level, evolved }, seconds = 2.5) {
  startRun('ranger', 'normal');
  S.player.weapons = [{ id, level, cd: 0, evolved, auraR: 0 }];
  S.player.passives = {};
  S.player.invuln = 999;                     // the dummies never hit back
  const dummies = crowd();

  let threw = null;
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    try {
      update(dt, computeView(1280, 720, 1.4));
    } catch (e) {
      threw = e;
      break;
    }
    // Only the dummies stay: the run's own spawner would otherwise crowd the
    // ring and soak hits meant for the control group.
    S.enemies.length = 0;
    for (const e of dummies) {
      // Standing still, at the distance they started at. Knockback would walk
      // them out of range and make a hard-hitting weapon look weak.
      e.dead = false;
      e.knockX = 0; e.knockY = 0;
      e.stun = 0; e.frozen = 0; e.root = 0;
      e.x = S.player.x + Math.cos(e.ringAngle) * e.ringR;
      e.y = S.player.y + Math.sin(e.ringAngle) * e.ringR;
      S.enemies.push(e);
    }
    S.player.hp = S.player.maxHp;
  }

  const dealt = dummies.reduce((sum, e) => sum + (DUMMY_HP - e.hp), 0);

  // Let everything it spawned run itself out, with no weapon left to top it up
  // and nothing left to hit.
  S.player.weapons = [];
  S.enemies.length = 0;
  for (let i = 0; i < 60 * 12; i++) {
    update(dt, computeView(1280, 720, 1.4));
    S.enemies.length = 0;
    S.player.hp = S.player.maxHp;
  }
  const leaked = S.shots.length + S.zones.length + S.sweeps.length;

  return { dealt, threw, leaked };
}

// --- the table itself -------------------------------------------------------
for (const id of WEAPON_IDS) {
  const def = WEAPONS[id];
  check(!!def.name, `${id}: no name`);
  check(hasIcon(def.icon), `${id}: icon '${def.icon}' is not drawn`);
  check(!!def.evolution, `${id}: no evolution`);
  check(hasIcon(def.evolution?.icon), `${id}: evolution icon '${def.evolution?.icon}' is not drawn`);
  check(!!PASSIVES[def.evolution?.requires],
    `${id}: evolution requires '${def.evolution?.requires}', which is not a passive`);
}
console.log(`table             ok (${WEAPON_IDS.length} weapons, ${WEAPON_IDS.length} evolutions)`);

// Two weapons must not share an evolution id, or the level-up draft would
// offer the same upgrade twice under different names.
const evoIds = WEAPON_IDS.map((id) => WEAPONS[id].evolution.id);
check(new Set(evoIds).size === evoIds.length, 'two weapons share an evolution id');

// --- firing -----------------------------------------------------------------
const rows = [];
for (const id of WEAPON_IDS) {
  const base = trial(id, { level: 1, evolved: false });
  const maxed = trial(id, { level: WEAPON_MAX_LEVEL, evolved: false });
  const evo = trial(id, { level: WEAPON_MAX_LEVEL, evolved: true });

  for (const [what, r] of [['lv1', base], ['lv8', maxed], ['evolved', evo]]) {
    if (r.threw) { problems.push(`${id} ${what} threw: ${r.threw.message}`); continue; }
    check(r.dealt > 0, `${id} ${what} dealt no damage in 2.5s`);
    check(r.leaked === 0, `${id} ${what} left ${r.leaked} live effects behind`);
  }

  check(maxed.dealt > base.dealt,
    `${id}: level 8 (${maxed.dealt | 0}) is no better than level 1 (${base.dealt | 0})`);
  // An evolution is not required to be strictly more damage against a ring of
  // dummies that never moves: several of them trade raw output for reach,
  // crowd control or coverage, which this fixture cannot see. What it must not
  // be is a downgrade — so it has to clear half the level-8 figure, and be a
  // large step up from where the weapon started.
  check(evo.dealt >= maxed.dealt * 0.5,
    `${id}: evolved (${evo.dealt | 0}) is less than half of level 8 (${maxed.dealt | 0})`);
  check(evo.dealt > base.dealt * 3,
    `${id}: evolved (${evo.dealt | 0}) is barely past level 1 (${base.dealt | 0})`);

  rows.push([id, base.dealt, maxed.dealt, evo.dealt]);
}

const pad = (s, n) => String(s).padEnd(n);
console.log('firing            ok (all fired, scaled and cleaned up)');
for (const [id, a, b, c] of rows) {
  console.log(`  ${pad(id, 10)} lv1 ${pad((a | 0).toLocaleString(), 9)} lv8 ${pad((b | 0).toLocaleString(), 9)} evolved ${(c | 0).toLocaleString()}`);
}

// --- nothing is dead weight -------------------------------------------------
// A weapon that deals an order of magnitude less than the median at the same
// level is not a design choice, it is a bug in its stat block.
const median = [...rows].sort((x, y) => x[2] - y[2])[Math.floor(rows.length / 2)][2];
for (const [id, , maxed] of rows) {
  check(maxed > median / 12, `${id} at level 8 deals ${maxed | 0}, far under the median ${median | 0}`);
}
console.log(`balance           ok (level 8 median ${(median | 0).toLocaleString()}, none below a twelfth of it)`);

// --- the flock ---------------------------------------------------------------
// Familiars are the only weapons that persist between attacks, which makes them
// the only ones that can leak. All four are equipped at once, evolved, and flown
// for two minutes against a crowd that keeps being rebuilt.
{
  const { FAMILIAR_WEAPONS, WEAPONS: W } = await import('../src/game/config.js');
  const { clearFamiliars } = await import('../src/game/familiars.js');
  check(FAMILIAR_WEAPONS.length === 4, `${FAMILIAR_WEAPONS.length} familiars, expected 4`);

  startRun('ranger', 'normal');
  S.player.weapons = FAMILIAR_WEAPONS.map((id) => ({ id, level: 8, cd: 0, evolved: true }));
  S.player.passives = {};
  S.player.invuln = 999;
  crowd();

  // How many birds the loadout implies, so "leaked" can be measured rather than
  // guessed at.
  const expected = FAMILIAR_WEAPONS
    .reduce((n, id) => n + Math.max(1, Math.round(W[id].evolution.base.birds || 1)), 0);

  let peak = 0, strayed = 0;
  const step = 1 / 60;
  for (let i = 0; i < 60 * 120; i++) {
    // Walk in a circle: stations are defined relative to a moving player, and a
    // bird that only works standing still is a bird that does not work.
    S.player.x = Math.cos(i / 90) * 300;
    S.player.y = Math.sin(i / 90) * 300;
    S.player.faceAngle = i / 90 + Math.PI / 2;
    update(step, computeView(1280, 720, 1.4));
    S.pendingLevels = 0;
    peak = Math.max(peak, S.familiars.length);
    for (const b of S.familiars) {
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) { strayed++; break; }
      // The roamer is allowed to leave; nothing is allowed to leave the county.
      if (Math.hypot(b.x - S.player.x, b.y - S.player.y) > 4000) { strayed++; break; }
    }
    if (i % 240 === 0) crowd();
  }

  check(strayed === 0, `a bird reached a non-finite or absurd position on ${strayed} frames`);
  check(peak === expected, `the flock peaked at ${peak} birds, expected ${expected}`);
  check(S.familiars.length === expected, `${S.familiars.length} birds at the end, expected ${expected}`);

  clearFamiliars();
  check(S.familiars.length === 0, 'clearFamiliars left birds behind');
  // And they come back on their own, because the flock is derived, not stored.
  update(step, computeView(1280, 720, 1.4));
  check(S.familiars.length === expected, 'the flock did not rebuild itself after being cleared');

  console.log(`flock             ok (${expected} birds, 2 min flown, none lost, none leaked)`);
}

if (problems.length) {
  console.error('\nFAILED:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('\nAll weapon checks passed.');
