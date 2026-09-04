/*
 * Boss arena test — development only.
 *
 *   node tools/arena-smoke.mjs
 *
 * Drops into every boss fight the way the Boss Arena button does, and plays it
 * out with a simple kiting bot. Checks the things the arena has to get right:
 * the granted loadout scales with the boss, the fight is actually winnable, no
 * other boss gate-crashes, and practice runs never pay out gold.
 */

import './dom-stub.mjs';        // installs the fake DOM

const { S } = await import('../src/game/state.js');
const store = await import('../src/core/storage.js');
const { startArena, update, computeView } = await import('../src/game/game.js');
const { render } = await import('../src/game/render.js');
const { BOSSES } = await import('../src/game/config.js');

store.load();
const goldBefore = store.meta().gold;

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

const canvas = document.createElement('canvas');
canvas.width = 1280; canvas.height = 720;
const ctx = canvas.getContext('2d');
// Recomputed every frame, not hoisted: `computeView` reads the camera at the
// moment it is called, so a view captured once stays pinned to wherever the
// camera was at the start. Targeting is now scoped to what is on screen, and
// a stale view means the bot kites the boss out of a frame that never moves.
const view = () => computeView(1280, 720, 1.4);

/** Keep away from the boss and from bullets; drift towards loot. */
function think() {
  const p = S.player;
  let fx = 0, fy = 0;
  for (const e of S.enemies) {
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy);
    const want = e.isBoss ? 175 : 140;
    if (d < want && d > 0.01) {
      const w = (want - d) / want;
      fx += (dx / d) * w * (e.isBoss ? 2.6 : 1);
      fy += (dy / d) * w * (e.isBoss ? 2.6 : 1);
    }
  }
  // Closing on a boss that has drifted out of weapon reach outranks everything
  // else. With a weaker pull, a crowd of trash between the bot and a fleeing
  // magus can out-vote it, and the fight stalls with the boss on 0.1% health
  // and every shot falling short — which says nothing about the game, only
  // that this bot would not walk forwards.
  if (S.boss) {
    const dx = S.boss.x - p.x, dy = S.boss.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 260) { fx += (dx / d) * 6; fy += (dy / d) * 6; }
  }
  for (const s of S.hostileShots) {
    const dx = p.x - s.x, dy = p.y - s.y;
    const d = Math.hypot(dx, dy);
    if (d < 110 && d > 0.01) { fx += (dx / d) * 2.4; fy += (dy / d) * 2.4; }
  }
  for (const z of S.zones) {
    if (z.kind !== 'telegraph' && z.kind !== 'cone') continue;
    const dx = p.x - z.x, dy = p.y - z.y;
    const d = Math.hypot(dx, dy);
    if (d < (z.r || z.range || 60) + 40 && d > 0.01) { fx += (dx / d) * 3; fy += (dy / d) * 3; }
  }
  for (const it of S.pickups) {
    const dx = it.x - p.x, dy = it.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 320 && d > 0.01) { fx += (dx / d) * 0.3; fy += (dy / d) * 0.3; }
  }
  const m = Math.hypot(fx, fy);
  return m > 0.01 ? { x: fx / m, y: fy / m } : { x: 1, y: 0 };
}

let want = { x: 1, y: 0 };
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    maxTouchPoints: 0,
    hardwareConcurrency: 8,
    getGamepads: () => [{
      axes: [want.x, want.y],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
    }],
  },
});

for (const def of BOSSES) {
  startArena('ranger', 'normal', def.id);

  check(S.arena && S.arena.bossId === def.id, `${def.id}: arena state not set`);
  check(!!S.cutscene, `${def.id}: the entrance did not start`);
  check(Math.abs(S.time - def.at * 60) < 1, `${def.id}: clock not set to minute ${def.at}`);

  const weapons = S.player.weapons.length;
  const passives = Object.keys(S.player.passives).length;
  const evolved = S.player.weapons.filter((w) => w.evolved).length;
  check(weapons >= 2, `${def.id}: only ${weapons} weapon(s) granted`);
  check(passives >= 1, `${def.id}: no passives granted`);
  if (def.at >= 16) check(evolved >= 2, `${def.id}: late-boss loadout has no evolutions`);

  // Fight it out. The bot is mediocre, so it gets a generous health pool —
  // this is testing that the fight resolves, not that the bot is good.
  S.player.hpBase = 4000;
  S.player.hp = 4000;

  let frames = 0;
  const cap = 30 * 60 * 6;                 // six minutes of fight
  while (S.running && frames < cap) {
    if (frames % 3 === 0) want = think();
    update(1 / 30, view());
    if (frames % 300 === 0) render(ctx, canvas, 1.4, {});
    if (S.player.hp < 1200) S.player.hp = 4000;   // keep it alive to the end
    frames++;
  }

  const secs = (frames / 30).toFixed(0);
  check(!S.running, `${def.id}: fight did not resolve within six minutes`);
  check(S.outcome === 'won', `${def.id}: outcome was ${S.outcome}`);
  console.log(
    `${(def.cutsceneName || def.name).padEnd(26)} won in ${String(secs).padStart(3)}s` +
    `  | ${weapons}w/${passives}p${evolved ? `/${evolved} evolved` : ''}` +
    `  | lv ${S.player.level}`
  );
}

// --- practice must not pay ---------------------------------------------------
check(store.meta().gold === goldBefore,
  `arena banked gold: ${goldBefore} -> ${store.meta().gold}`);
check(store.records().runs === 0, 'arena fights were written into the records');
console.log('\nno gold banked, no records touched');

if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('All arena checks passed.');
