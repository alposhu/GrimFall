/*
 * Cutscene test — development only.
 *
 *   node tools/cutscene-smoke.mjs
 *
 * Every boss entrance is a distinct animated path through the same timeline, so
 * each one is played frame by frame, at several viewport shapes, with the
 * renderer attached. Also checks the two things a cutscene must never do: run
 * forever, or forget to spawn the boss it was announcing.
 */

import './dom-stub.mjs';        // installs the fake DOM

const { S } = await import('../src/game/state.js');
const store = await import('../src/core/storage.js');
const cut = await import('../src/game/cutscene.js');
const { BOSSES } = await import('../src/game/config.js');
const { startRun, update, computeView } = await import('../src/game/game.js');
const { render } = await import('../src/game/render.js');
const { dragonParts } = await import('../src/art/dragon.js');

store.load();

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

// --- the dragon builds and composes ----------------------------------------
const parts = dragonParts(2);
check(parts.body.width > 100 && parts.body.height > 100, 'Parduin body art is missing');
check(parts.wing.width > parts.body.width * 0.6, 'Parduin wings are too small to read');
check(parts.tail.height > 80, 'Parduin tail is missing');
console.log(`dragon parts      ok (body ${parts.body.width}x${parts.body.height}, wing ${parts.wing.width}x${parts.wing.height})`);

// --- every entrance, at three viewport shapes -------------------------------
const shapes = [[1280, 720], [390, 844], [844, 390]];
for (const def of BOSSES) {
  for (const [w, h] of shapes) {
    canvas.width = w; canvas.height = h;
    startRun('ranger', 'normal');
    cut.startCutscene(def);
    check(cut.cutsceneActive(), `${def.id}: cutscene did not start`);

    let frames = 0, finished = false;
    while (cut.cutsceneActive() && frames < 1200) {
      finished = cut.updateCutscene(1 / 60);
      cut.renderCutscene(ctx, w, h);
      frames++;
    }
    check(finished, `${def.id} @${w}x${h}: cutscene never finished (${frames} frames)`);
    check(frames > 60, `${def.id} @${w}x${h}: cutscene ended suspiciously fast`);
    check(!S.cutscene, `${def.id}: cutscene state was left behind`);
  }
}
console.log(`entrances         ok (${BOSSES.length} bosses x ${shapes.length} viewports)`);

// --- skipping ---------------------------------------------------------------
for (const def of BOSSES) {
  startRun('ranger', 'normal');
  cut.startCutscene(def);
  cut.updateCutscene(0.3);
  cut.skipCutscene();
  let frames = 0;
  while (cut.cutsceneActive() && frames < 600) { cut.updateCutscene(1 / 60); frames++; }
  check(!cut.cutsceneActive(), `${def.id}: skip did not end the cutscene`);
  check(frames < 130, `${def.id}: skip took ${frames} frames to land`);
}
console.log('skip              ok');

// --- a cutscene always hands off to a real boss ------------------------------
startRun('ranger', 'normal');
S.player.hpBase = 1e9;
S.player.hp = 1e9;
// A fresh view each frame — see the note in arena-smoke.mjs.
const view = () => computeView(1280, 720, 1.4);
canvas.width = 1280; canvas.height = 720;

const seen = new Set();
let cutscenesRun = 0, wasInCutscene = false;
for (let i = 0; i < 30 * 60 * 25 && S.running; i++) {
  update(1 / 30, view());
  if (S.cutscene && !wasInCutscene) cutscenesRun++;
  // The world must be frozen while a cutscene plays.
  if (S.cutscene) check(S.pendingBoss !== null, 'a cutscene is playing with no boss queued');
  wasInCutscene = !!S.cutscene;
  if (S.boss) seen.add(S.boss.bossId);
  if (i % 400 === 0) render(ctx, canvas, 1.4, {});
  while (S.pendingLevels > 0) {
    const { rollChoices, takeLevelUp } = await import('../src/game/game.js');
    takeLevelUp(rollChoices()[0]);
  }
}
check(cutscenesRun === BOSSES.length, `expected ${BOSSES.length} cutscenes, saw ${cutscenesRun}`);
check(seen.size === BOSSES.length, `expected every boss to spawn, saw ${[...seen].join(', ')}`);
check(seen.has('parduin'), 'Parduin never showed up');
check(S.outcome === 'won', `expected a win after Parduin, got ${S.outcome}`);
console.log(`handoff           ok (${cutscenesRun} entrances, ${seen.size} bosses, outcome ${S.outcome})`);

if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('\nAll cutscene checks passed.');
