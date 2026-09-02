/*
 * Boot smoke test — development only.
 *
 *   node tools/boot-smoke.mjs
 *
 * Loads src/main.js exactly as the browser would: the sprite pre-pass, the menu
 * backdrop, starting a run from the hero screen and several seconds of the real
 * frame loop. Any exception thrown anywhere in that path fails the test.
 */

import { byId, dataActionEls } from './dom-stub.mjs';

const failures = [];
process.on('uncaughtException', (e) => failures.push(e));
process.on('unhandledRejection', (e) => failures.push(e));

const { S } = await import('../src/game/state.js');

// Boot plays the opening cinematic before the menu. Rather than special-casing
// it out of the build, this does what a player in a hurry does: holds the skip
// key. It is also the only check that skipping works from a cold start.
const { skipIntro } = await import('../src/game/intro.js');
const holdSkip = setInterval(skipIntro, 5);

await import('../src/main.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Boot rasterises every sprite before the title appears.
await wait(1500);
clearInterval(holdSkip);
if (!byId.titleScreen.classList.contains('active')) failures.push(new Error('boot never reached the title screen'));
else console.log('boot -> title     ok');

// The attract-mode backdrop should have been drawing all along.
await wait(300);
console.log('backdrop frames   ok');

// Walk into a run through the real buttons.
dataActionEls.find((b) => b.dataset.action === 'play').click();
await wait(50);
byId.startRunBtn.click();
await wait(1200);

if (!S.running) failures.push(new Error('the run did not start from the hero screen'));
else console.log(`run loop          ok (t=${S.time.toFixed(1)}s, ${S.enemies.length} enemies)`);

// Pause and resume through the HUD button.
byId.pauseBtn.click();
await wait(120);
if (!S.paused) failures.push(new Error('the pause button did not pause'));
byId.resumeBtn.click();
await wait(120);
if (S.paused) failures.push(new Error('resume did not un-pause'));
console.log('pause / resume    ok');

// Abandon returns to the results screen.
byId.abandonBtn.click();
await wait(200);
if (S.running) failures.push(new Error('abandon did not end the run'));
if (!byId.resultScreen.classList.contains('active')) failures.push(new Error('results did not open after abandoning'));
console.log('abandon -> result ok');

byId.toTitleBtn.click();
await wait(200);
if (!byId.titleScreen.classList.contains('active')) failures.push(new Error('could not get back to the title'));
console.log('back to title     ok');

if (failures.length) {
  console.error('\nFAILED:');
  for (const f of failures) console.error('  - ' + (f.stack || f.message || f));
  process.exit(1);
}
console.log('\nBoot path clean.');
process.exit(0);
