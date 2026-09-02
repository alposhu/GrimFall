/*
 * Headless smoke test — development only, not part of the deployable build.
 *
 *   node tools/headless.mjs [minutes]
 *
 * Stubs just enough of the browser (canvas 2D, localStorage, a fake gamepad)
 * to run a whole simulated run in Node: spawning, every boss script, the
 * upgrade economy and the renderer. It catches the class of bug you would
 * otherwise only find by playing for twenty minutes.
 */

// --------------------------------------------------------------------- stubs
function makeCtx(canvas) {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  return {
    canvas,
    imageSmoothingEnabled: false,
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt',
    font: '', textAlign: 'left', textBaseline: 'alphabetic',
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
    setTransform: noop, transform: noop, clip: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    arc: noop, ellipse: noop, rect: noop, quadraticCurveTo: noop, bezierCurveTo: noop,
    arcTo: noop, roundRect: noop, setLineDash: noop, getLineDash: () => [],
    shadowColor: '', shadowBlur: 0, letterSpacing: '0px',
    fill: noop, stroke: noop, fillRect: noop, strokeRect: noop, clearRect: noop,
    fillText: noop, strokeText: noop,
    measureText: () => ({ width: 10 }),
    drawImage: noop,
    createPattern: () => ({}),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: noop,
  };
}

class FakeCanvas {
  constructor() { this.width = 1; this.height = 1; this._ctx = null; }
  getContext() { return (this._ctx ||= makeCtx(this)); }
  toDataURL() { return 'data:image/png;base64,'; }
}

const storeData = new Map();
globalThis.localStorage = {
  getItem: (k) => (storeData.has(k) ? storeData.get(k) : null),
  setItem: (k, v) => storeData.set(k, String(v)),
  removeItem: (k) => storeData.delete(k),
};

let padAngle = 0;
// Node 21+ ships a read-only `navigator`, so redefine rather than assign.
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    maxTouchPoints: 0,
    getGamepads: () => [{
      axes: [Math.cos(padAngle), Math.sin(padAngle)],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
    }],
  },
});

globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? new FakeCanvas() : { style: {}, classList: { add: () => {}, remove: () => {}, toggle: () => {} } }),
  getElementById: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  hidden: false,
};
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.devicePixelRatio = 1;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 0);

// --------------------------------------------------------------------- test
const { S } = await import('../src/game/state.js');
const store = await import('../src/core/storage.js');
const { startRun, update, updateCamera, computeView, rollChoices, takeLevelUp } = await import('../src/game/game.js');
const { render, renderBackdrop } = await import('../src/game/render.js');
const { CHARACTERS } = await import('../src/art/hero.js');
const { BOSSES } = await import('../src/game/config.js');

const minutes = Number(process.argv[2] || 21);
const canvas = new FakeCanvas();
canvas.width = 1280; canvas.height = 720;
const ctx = canvas.getContext('2d');

store.load();

const problems = [];
function check(cond, msg) { if (!cond) problems.push(msg); }

// Attract-mode backdrop should not need a player.
renderBackdrop(ctx, canvas, 1.2, 3.5);
console.log('backdrop      ok');

for (const ch of CHARACTERS) {
  startRun(ch.id, 'normal');
  check(S.player.weapons.length === 1, `${ch.id}: expected a starting weapon`);
  check(S.player.hp > 0, `${ch.id}: no health`);
}
console.log(`characters    ok (${CHARACTERS.length})`);

// --- one long run --------------------------------------------------------
startRun('ranger', 'hard');
// Make the test subject unkillable so the full twenty minutes actually runs;
// death is exercised separately below.
S.player.hpBase = 1e9;
S.player.hp = 1e9;
const dt = 1 / 30;
const steps = Math.round(minutes * 60 / dt);
let levelUps = 0, frames = 0, maxEnemies = 0, maxParticles = 0;
const bossesSeen = new Set();
const t0 = Date.now();

for (let i = 0; i < steps && S.running; i++) {
  padAngle += 0.02 + Math.sin(i / 900) * 0.01;
  const view = computeView(canvas.width, canvas.height, 1.4);
  update(dt, view);
  updateCamera(dt, canvas.width, canvas.height);

  while (S.pendingLevels > 0) {
    const choices = rollChoices();
    check(choices.length >= 1, 'level-up offered no choices');
    takeLevelUp(choices[Math.floor(Math.random() * choices.length)]);
    levelUps++;
    if (levelUps > 4000) { problems.push('level-up loop did not terminate'); break; }
  }

  if (S.boss) bossesSeen.add(S.boss.name);
  maxEnemies = Math.max(maxEnemies, S.enemies.length);

  // Exercise the renderer regularly (it is where most drawing bugs hide).
  if (i % 17 === 0) { render(ctx, canvas, 1.4, {}); frames++; }

  for (const e of S.enemies) {
    if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) { problems.push(`enemy ${e.type} has a non-finite position`); break; }
  }
  if (!Number.isFinite(S.player.x) || !Number.isFinite(S.player.y)) { problems.push('player position went non-finite'); break; }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`simulation    ok (${minutes} min in ${elapsed}s wall clock)`);
console.log(`  time        ${(S.time / 60).toFixed(1)} min`);
console.log(`  level       ${S.player.level} (${levelUps} level-ups)`);
console.log(`  kills       ${S.kills}`);
console.log(`  gold        ${S.gold}`);
console.log(`  weapons     ${S.player.weapons.map((w) => w.id + (w.evolved ? '*' : w.level)).join(', ')}`);
console.log(`  passives    ${Object.entries(S.player.passives).map(([k, v]) => k + v).join(', ') || '—'}`);
console.log(`  peak crowd  ${maxEnemies}`);
console.log(`  bosses      ${[...bossesSeen].join(', ') || 'none'}`);
console.log(`  frames drawn ${frames}`);

check(S.kills > 100, 'suspiciously few kills — is anything dying?');
check(S.outcome === (minutes >= 21 ? 'won' : null), `unexpected run outcome: ${S.outcome}`);
check(S.player.level > 5, 'player barely levelled — is XP flowing?');
if (minutes >= 21) check(bossesSeen.size >= BOSSES.length, 'not every boss appeared');
check(S.player.weapons.length > 1, 'no additional weapons were picked up');

if (problems.length) {
  console.error('\nFAILED:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('\nAll checks passed.');
