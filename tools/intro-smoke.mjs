/*
 * Intro cinematic test — development only.
 *
 *   node tools/intro-smoke.mjs
 *
 * The intro sits between the boot bar and the menu, which makes it the one
 * piece of code that can strand a player on a black screen before they have
 * seen anything. So what is checked here is mostly about it ending:
 *
 *   - it resolves on its own, without help
 *   - it resolves immediately when skipped
 *   - it resolves when there is no canvas, no video and no artwork
 *   - it draws every frame it is given, at several viewport shapes
 *   - the beat table adds up to the length it advertises
 */

import { byId } from './dom-stub.mjs';

const { playIntro, skipIntro, introLength } = await import('../src/game/intro.js');

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

// The stub's rAF runs on timers; this drives it fast so a 13-second cinematic
// does not take thirteen seconds to test.
function surface(w = 1280, h = 720) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  let calls = 0;
  for (const k of Object.keys(ctx)) {
    if (typeof ctx[k] === 'function') {
      const inner = ctx[k];
      ctx[k] = (...a) => { calls++; return inner.apply(ctx, a); };
    }
  }
  return { canvas, ctx, drawn: () => calls };
}

// --- it ends on its own -----------------------------------------------------
{
  const s = surface();
  const t0 = Date.now();
  const how = await playIntro(s);
  const took = (Date.now() - t0) / 1000;
  check(how === 'drawn' || how === 'skipped' || how === 'none',
    `intro resolved with "${how}"`);
  check(took < introLength + 6, `intro took ${took.toFixed(1)}s, advertised ${introLength}s`);
  check(s.drawn() > 200, `intro only made ${s.drawn()} draw calls — is it drawing?`);
  console.log(`plays             ok (${how}, ${took.toFixed(1)}s, ${s.drawn()} draw calls)`);
}

// --- skipping ends it at once ----------------------------------------------
{
  const s = surface();
  const t0 = Date.now();
  const hold = setInterval(skipIntro, 2);
  const how = await playIntro(s);
  clearInterval(hold);
  const took = (Date.now() - t0) / 1000;
  check(how === 'skipped' || how === 'none', `skipped intro resolved with "${how}"`);
  check(took < 2, `skipping took ${took.toFixed(2)}s — it should be immediate`);
  console.log(`skip              ok (${took.toFixed(2)}s to get out)`);
}

// --- the button is the only skip a phone can see ---------------------------
// On touch there is no key to press and nothing on screen saying a tap would
// do anything, so the button is not a convenience — it is the affordance. The
// stub's window listeners are no-ops, which is exactly what makes this
// meaningful: if the click handler were not wired, nothing else could rescue it
// and the intro would run to its full length.
{
  const btn = byId.introSkip;
  check(!!btn, 'index.html has no #introSkip button');

  const s = surface(390, 844);                 // a phone, held upright
  let shown = false;
  const watch = setInterval(() => { if (btn && btn.hidden === false) shown = true; }, 4);
  const tap = setTimeout(() => btn?.click(), 120);
  const t0 = Date.now();
  const how = await playIntro(s);
  clearInterval(watch);
  clearTimeout(tap);
  const took = (Date.now() - t0) / 1000;

  check(shown, 'the skip button was never shown while the intro was playing');
  check(how === 'skipped', `tapping Skip resolved with "${how}"`);
  check(took < 2, `tapping Skip took ${took.toFixed(2)}s`);
  check(btn?.hidden === true, 'the skip button was left on screen after the intro');
  console.log(`skip button       ok (shown, tapped, ${took.toFixed(2)}s, hidden again)`);
}

// --- every way in still skips ----------------------------------------------
// keydown for a keyboard, pointerdown for a mouse, touchstart for a browser
// with no Pointer Events, mousedown for one older still.
{
  const src = await import('node:fs').then((fs) => fs.readFileSync(
    new URL('../src/game/intro.js', import.meta.url), 'utf8'));
  for (const ev of ['keydown', 'pointerdown', 'touchstart', 'mousedown']) {
    check(src.includes(`'${ev}'`), `the intro does not listen for ${ev}`);
  }
  console.log('skip inputs       ok (keydown, pointerdown, touchstart, mousedown)');
}

// --- it never strands the boot ---------------------------------------------
{
  check(await playIntro(null) === 'none', 'playIntro(null) did not resolve to none');
  check(await playIntro({}) === 'none', 'playIntro with no canvas did not resolve to none');
  // A surface whose context throws on every call: the frame loop must not take
  // the boot down with it.
  const bad = surface();
  for (const k of Object.keys(bad.ctx)) {
    if (typeof bad.ctx[k] === 'function') bad.ctx[k] = () => { throw new Error('no drawing here'); };
  }
  const hold = setInterval(skipIntro, 2);
  const how = await playIntro(bad).catch(() => 'threw');
  clearInterval(hold);
  check(how !== 'threw', 'a broken canvas made playIntro reject');
  console.log('robustness        ok (no canvas, no video, a canvas that throws)');
}

// --- every shape ------------------------------------------------------------
{
  for (const [w, h] of [[360, 780], [1280, 720], [2560, 1080]]) {
    const s = surface(w, h);
    const hold = setTimeout(skipIntro, 260);
    await playIntro(s);
    clearTimeout(hold);
    check(s.drawn() > 20, `${w}x${h}: only ${s.drawn()} draw calls`);
  }
  console.log('viewports         ok (portrait phone, laptop, ultrawide)');
}

// --- the table is honest ----------------------------------------------------
{
  const src = await import('node:fs').then((fs) => fs.readFileSync(
    new URL('../src/game/intro.js', import.meta.url), 'utf8'));
  const beats = [...src.matchAll(/\{\s*t:\s*([\d.]+),\s*line:/g)].map((m) => Number(m[1]));
  check(beats.length >= 3, `only ${beats.length} beats found`);
  const sum = beats.reduce((a, b) => a + b, 0);
  check(Math.abs(sum - introLength) < 0.01,
    `beats add to ${sum}s but introLength says ${introLength}s`);
  // Long enough to be a cinematic, short enough that nobody resents it.
  check(introLength >= 6 && introLength <= 20,
    `the intro is ${introLength}s, which is the wrong side of tolerable`);
  console.log(`length            ok (${beats.length} beats, ${introLength}s)`);
}

if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('\nAll intro checks passed.');
