/*
 * Quality governor test — development only.
 *
 *   node tools/quality-smoke.mjs
 *
 * The adaptive tier system is the main thing standing between a mid-range phone
 * and a slideshow, and none of it is visible in a normal run, so it gets its own
 * checks: sensible starting tiers, a hard cap on backing-store pixels, and a
 * governor that moves under sustained load without twitching at a single spike.
 */

globalThis.window = globalThis;
globalThis.devicePixelRatio = 3;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { hardwareConcurrency: 8, deviceMemory: 8 },
});
let coarse = false;
globalThis.matchMedia = () => ({ matches: coarse });

const Q = await import('../src/core/quality.js');

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

// --- starting tiers ---------------------------------------------------------
coarse = false;
Q.initQuality('auto');
check(Q.q.tier === 'high', `a desktop should start high, got ${Q.q.tier}`);

coarse = true;
Q.setQualityMode('auto');
check(Q.q.tier === 'medium', `touch hardware should start medium, got ${Q.q.tier}`);
console.log('starting tiers    ok');

// --- the pixel budget -------------------------------------------------------
const cases = [
  ['phone   390x844', 390, 844],
  ['tablet  820x1180', 820, 1180],
  ['desktop 1920x1080', 1920, 1080],
];
for (const mode of ['high', 'medium', 'low']) {
  Q.setQualityMode(mode);
  for (const [label, w, h] of cases) {
    const s = Q.canvasSize(w, h);
    check(s.w * s.h <= Q.q.maxPixels * 1.02, `${mode}/${label}: ${(s.w * s.h / 1e6).toFixed(2)}M px exceeds the budget`);
    check(s.dpr > 0.5, `${mode}/${label}: device pixel ratio collapsed to ${s.dpr}`);
  }
}
console.log('pixel budget      ok');

// --- the governor -----------------------------------------------------------
Q.setQualityMode('auto');            // medium (still coarse)
for (let i = 0; i < 400; i++) Q.sampleFrame(40);
check(Q.q.tier === 'low', `sustained 40ms frames should drop to low, got ${Q.q.tier}`);
check(Q.q.glows === false, 'the low tier should switch glows off');
check(Q.q.enemyScale < 1, 'the low tier should thin the crowd');

for (let i = 0; i < 3000; i++) Q.sampleFrame(8);
check(Q.q.tier === 'high', `sustained 8ms frames should climb back, got ${Q.q.tier}`);

// A single bad frame must not move anything.
Q.setQualityMode('auto');
const before = Q.q.tier;
Q.sampleFrame(400);
Q.sampleFrame(120);
check(Q.q.tier === before, 'a one-off spike must not change tier');
console.log('governor          ok');

// --- a manual choice is never overridden ------------------------------------
Q.setQualityMode('low');
for (let i = 0; i < 3000; i++) Q.sampleFrame(6);
check(Q.q.tier === 'low', 'a manually pinned tier must not be raised by the governor');
Q.setQualityMode('high');
for (let i = 0; i < 600; i++) Q.sampleFrame(60);
check(Q.q.tier === 'high', 'a manually pinned tier must not be lowered by the governor');
console.log('manual override   ok');

if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('\nQuality system healthy.');
