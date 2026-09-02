/*
 * How-to-play demo test — development only.
 *
 *   node tools/demo-smoke.mjs
 *
 * The card animations are the one part of the UI that runs its own draw code
 * against real game art. Each is played through several full loops at several
 * card sizes, checking it draws, never throws, and actually puts something on
 * the canvas at every point in its cycle rather than sitting blank.
 */

import './dom-stub.mjs';        // installs the fake DOM

const { DEMOS, DEMO_KEYS } = await import('../src/ui/demos.js');

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

/** A recording context: counts what each demo actually draws. */
function recorder(w, h) {
  const noop = () => {};
  let ops = 0;
  const count = () => { ops++; };
  const gradient = { addColorStop: noop };
  const ctx = {
    canvas: { width: w, height: h },
    imageSmoothingEnabled: false,
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt',
    font: '', textAlign: 'left', textBaseline: 'alphabetic',
    shadowColor: '', shadowBlur: 0, letterSpacing: '0px',
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop, setTransform: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, arcTo: noop,
    arc: count, ellipse: count, rect: count, roundRect: count,
    fill: count, stroke: count, fillRect: count, strokeRect: count, clearRect: noop,
    fillText: count, strokeText: count,
    measureText: () => ({ width: 10 }),
    drawImage: count,
    createPattern: () => ({}), createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    getImageData: (x, y, gw, gh) => ({ data: new Uint8ClampedArray(gw * gh * 4), width: gw, height: gh }),
    createImageData: (gw, gh) => ({ data: new Uint8ClampedArray(gw * gh * 4), width: gw, height: gh }),
    putImageData: noop,
    setLineDash: noop, getLineDash: () => [],
    ops: () => ops,
    resetOps: () => { ops = 0; },
  };
  return ctx;
}

// Every card the markup asks for must exist in the module, and vice versa.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const tagged = [...html.matchAll(/data-demo="(\w+)"/g)].map((m) => m[1]);

check(tagged.length >= 7, `only ${tagged.length} help cards are tagged with a demo`);
for (const key of tagged) check(DEMOS[key], `index.html asks for demo "${key}" which does not exist`);
for (const key of DEMO_KEYS) check(tagged.includes(key), `demo "${key}" is never used by a card`);
console.log(`wiring            ok (${tagged.length} cards, ${DEMO_KEYS.length} demos, all matched)`);

// --- play each one through its loops, at several card widths ---------------
const sizes = [[320, 128], [220, 128], [520, 128]];
let frames = 0;
for (const key of DEMO_KEYS) {
  let blankFrames = 0;
  for (const [w, h] of sizes) {
    const ctx = recorder(w, h);
    // 12 seconds at 30fps covers the longest loop (8s) more than once.
    for (let i = 0; i < 360; i++) {
      ctx.resetOps();
      try {
        DEMOS[key](ctx, w, h, i / 30);
      } catch (e) {
        problems.push(`demo "${key}" threw at t=${(i / 30).toFixed(2)}s @${w}x${h}: ${e.message}`);
        break;
      }
      if (ctx.ops() < 3) blankFrames++;
      frames++;
    }
  }
  check(blankFrames === 0, `demo "${key}" drew almost nothing on ${blankFrames} frame(s)`);
  console.log(`  ${key.padEnd(9)} ok`);
}
console.log(`playback          ok (${frames} frames across ${sizes.length} sizes)`);

// --- a demo must not depend on t starting at zero ---------------------------
for (const key of DEMO_KEYS) {
  const ctx = recorder(320, 128);
  try {
    DEMOS[key](ctx, 320, 128, 98765.4321);
  } catch (e) {
    problems.push(`demo "${key}" threw at a large timestamp: ${e.message}`);
  }
  check(ctx.ops() > 2, `demo "${key}" goes blank at a large timestamp`);
}
console.log('long uptime       ok (survives a large clock value)');

if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('\nAll demo checks passed.');
