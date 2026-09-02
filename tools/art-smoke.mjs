/*
 * Pixel-art test — development only.
 *
 *   node tools/art-smoke.mjs
 *
 * Sprite *quality* cannot be asserted from Node, but sprite *integrity* can,
 * and one class of bug has now bitten twice: a pixel map whose rows are not all
 * the same length. `rasterize` sizes the canvas from the longest row and draws
 * every row from x=0, so a short row silently shifts left and a long one grows
 * the sprite — and a ragged half-map fed through `mirror` comes out lopsided
 * rather than symmetric. Neither throws. Neither shows up in any other test.
 *
 * So: every pixel-map literal in src/art is checked for square edges, and every
 * sprite the game builds is checked for sane and consistent dimensions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './dom-stub.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

// ---------------------------------------------------------------------------
// 1. Every pixel-map literal is rectangular
// ---------------------------------------------------------------------------
// A quoted string is "pixel-ish" if it holds a transparent dot or a run of the
// same character — which a list of weapon ids never does.
const pixelish = (s) => s.includes('.') || /(.)\1\1/.test(s);
const LINE = /^\s*'([^']*)',?\s*$/;

let blocks = 0, rows = 0;
for (const file of fs.readdirSync(path.join(ROOT, 'src/art')).filter((f) => f.endsWith('.js'))) {
  const lines = fs.readFileSync(path.join(ROOT, 'src/art', file), 'utf8').split('\n');
  let run = [];
  const flush = () => {
    if (run.length >= 3) {
      const strs = run.map((r) => r.text);
      const ish = strs.filter(pixelish).length / strs.length;
      if (ish >= 0.7 && strs.every((s) => s.length >= 6)) {
        blocks++;
        rows += strs.length;
        const w = strs[0].length;
        const bad = run.filter((r) => r.text.length !== w);
        for (const b of bad) {
          problems.push(
            `${file}:${b.line} row is ${b.text.length} chars, the map starts at ${w} — ` +
            `ragged maps rasterise lopsided`
          );
        }
      }
    }
    run = [];
  };
  lines.forEach((line, i) => {
    const m = line.match(LINE);
    if (m) run.push({ text: m[1], line: i + 1 });
    else flush();
  });
  flush();
}
check(blocks >= 20, `only ${blocks} pixel maps found — did the art move?`);
console.log(`pixel maps        ok (${blocks} maps, ${rows} rows, all rectangular)`);

// ---------------------------------------------------------------------------
// 2. Food maps, checked against their own palettes
// ---------------------------------------------------------------------------
const { FOODS, FOOD_IDS, foodSprite, randomFood, foodName, foodHeal } = await import('../src/art/food.js');
for (const [id, d] of Object.entries(FOODS)) {
  const w = d.map[0].length;
  check(d.map.every((r) => r.length === w), `food "${id}" has ragged rows`);
  const keys = new Set(Object.keys(d.pal));
  for (const row of d.map) {
    for (const ch of row) {
      if (ch !== '.') check(keys.has(ch), `food "${id}" uses "${ch}" with no colour for it`);
    }
  }
  check(d.heal > 0, `food "${id}" heals nothing`);
  check(d.weight > 0, `food "${id}" can never drop`);
  check(typeof d.name === 'string' && d.name.length, `food "${id}" has no name`);
}
// The weighted roll must be able to produce everything it lists.
const rolled = new Set();
for (let i = 0; i < 60000; i++) rolled.add(randomFood());
check(rolled.size === FOOD_IDS.length, `only ${rolled.size} of ${FOOD_IDS.length} foods can actually drop`);
check(foodName('nonsense') && foodHeal('nonsense') > 0, 'an unknown food id is not handled');
console.log(`food              ok (${FOOD_IDS.length} dishes, palettes complete, all reachable)`);

// ---------------------------------------------------------------------------
// 3. Every sprite builds, at a sane and consistent size
// ---------------------------------------------------------------------------
const { CHARACTERS, heroSprites, heroPortrait } = await import('../src/art/hero.js');
const { folkSprites, FOLK_COUNT, FOLK_BODIES, FOLK_VARIANTS, folkBodyOf } = await import('../src/art/folk.js');

let built = 0;
const sane = (img, what) => {
  built++;
  if (!img || !img.width || !img.height) { problems.push(`${what} built nothing`); return img; }
  check(img.width < 4096 && img.height < 4096, `${what} is ${img.width}x${img.height} — a runaway map?`);
  return img;
};

for (const ch of CHARACTERS) {
  const set = heroSprites(ch.id, 3);
  for (const dir of ['south', 'north', 'east', 'west']) {
    check(set[dir]?.length === 4, `${ch.id} ${dir} has ${set[dir]?.length} frames, expected 4`);
    const w = set[dir][0].width, h = set[dir][0].height;
    for (const f of set[dir]) {
      sane(f, `${ch.id} ${dir}`);
      check(f.width === w && f.height === h,
        `${ch.id} ${dir} frames differ in size (${f.width}x${f.height} vs ${w}x${h}) — the walk will jitter`);
    }
    // Mirrored bodies must come out even, or the character is off-centre.
    check(w % 2 === 0, `${ch.id} ${dir} is ${w}px wide — an odd width means a lopsided mirror`);
  }
  // Every hero shares one body scale, custom silhouettes included.
  check(set.south[0].width === 48, `${ch.id} is ${set.south[0].width}px wide, expected 48`);
  sane(heroPortrait(ch.id, 4), `${ch.id} portrait`);
}
console.log(`heroes            ok (${CHARACTERS.length} characters, 4 directions x 4 frames, sizes consistent)`);

const bodiesSeen = new Set();
for (let v = 0; v < FOLK_COUNT; v++) {
  const set = folkSprites(v, 3);
  bodiesSeen.add(folkBodyOf(v));
  for (const dir of ['south', 'north', 'east', 'west']) {
    check(set[dir]?.length === 4, `townsfolk ${v} ${dir} has no walk cycle`);
    const w = set[dir][0].width, h = set[dir][0].height;
    for (const f of set[dir]) {
      sane(f, `folk ${v} ${dir}`);
      check(f.width === w && f.height === h, `folk ${v} ${dir} frames differ in size`);
    }
    check(w === 48, `folk ${v} ${dir} is ${w}px wide, expected 48 like everyone else`);
  }
}
check(bodiesSeen.size === FOLK_BODIES.length,
  `only ${bodiesSeen.size} of ${FOLK_BODIES.length} body types are reachable through folkSprites`);
// A crowd of one silhouette in many colours reads as clones, which is the whole
// reason these exist — so the variant table must actually span the bodies.
check(FOLK_BODIES.length >= 4, `only ${FOLK_BODIES.length} townsfolk silhouettes`);
check(FOLK_COUNT >= FOLK_BODIES.length * 3, `${FOLK_COUNT} variants is thin for ${FOLK_BODIES.length} bodies`);
check(FOLK_VARIANTS.length === FOLK_COUNT, 'the variant table and the count disagree');
console.log(`townsfolk         ok (${FOLK_BODIES.length} silhouettes x palettes = ${FOLK_COUNT} variants)`);

// --- expression balloons ----------------------------------------------------
const balloons = await import('../src/art/balloons.js');
check(balloons.BALLOON_KINDS.length >= 8, `only ${balloons.BALLOON_KINDS.length} balloon expressions`);
for (const kind of balloons.BALLOON_KINDS) {
  const g = sane(balloons.balloonGlyph(kind, 2), `balloon glyph ${kind}`);
  check(g.width <= 40 && g.height <= 40, `balloon glyph ${kind} is ${g.width}x${g.height} — too big for the bubble`);
}
sane(balloons.balloonBubble(2), 'balloon bubble');
{
  // Every expression must draw across its whole life without throwing, and
  // must not vanish in the middle of it.
  const c = document.createElement('canvas');
  c.width = 200; c.height = 120;
  const cx = c.getContext('2d');
  for (const kind of balloons.BALLOON_KINDS) {
    for (let i = 0; i <= 40; i++) {
      try {
        balloons.drawBalloon(cx, 100, 80, kind, i / 40, 2);
      } catch (e) {
        problems.push(`drawBalloon("${kind}") threw at p=${(i / 40).toFixed(2)}: ${e.message}`);
        break;
      }
    }
  }
  // The lifecycle helpers have to expire on their own.
  const ent = {};
  balloons.say(ent, 'exclaim', 1);
  check(ent.bal, 'say() attached no balloon');
  let alive = 0;
  for (let i = 0; i < 200; i++) if (balloons.tickBalloon(ent, 1 / 60)) alive++;
  check(!ent.bal, 'a balloon never expired');
  check(alive >= 55 && alive <= 65, `a 1s balloon lived ${alive} frames at 60fps`);
}
console.log(`balloons          ok (${balloons.BALLOON_KINDS.length} expressions, drawn across full life)`);

// --- the market ------------------------------------------------------------
const market = await import('../src/art/market.js');
for (let v = 0; v < 4; v++) {
  const t = sane(market.cobbleTile(v, 32), `cobble ${v}`);
  check(t.width === 32 && t.height === 32, `cobble ${v} is ${t.width}x${t.height}, expected 32x32`);
}
for (const k of market.STALL_KINDS) sane(market.stallSprite(k, 2), `stall ${k}`);
for (const k of market.PROP_KINDS) sane(market.marketProp(k, 2), `prop ${k}`);
for (const id of market.VENDOR_IDS) {
  const s = sane(market.vendorSprite(id, 3), `vendor ${id}`);
  check(s.width % 2 === 0, `vendor ${id} is ${s.width}px wide — a ragged half-map?`);
  check(s.width === 48, `vendor ${id} is ${s.width}px wide, expected 48 like the heroes`);
  sane(market.vendorPortrait(id, 6), `vendor portrait ${id}`);
}
console.log(`market art        ok (${market.STALL_KINDS.length} stalls, ${market.PROP_KINDS.length} props, ${market.VENDOR_IDS.length} vendors)`);

for (const id of FOOD_IDS) { sane(foodSprite(id, 2), `food ${id}`); sane(foodSprite(id, 3), `food ${id}`); }

// --- everything else the boot warms ----------------------------------------
const { MOB_KEYS, CHAMPION_KEYS, mobSprite, championSprite } = await import('../src/art/bestiary.js');
for (const k of MOB_KEYS) sane(mobSprite(k, 2), `mob ${k}`);
for (const k of CHAMPION_KEYS) sane(championSprite(k, 2), `champion ${k}`);
// The hierarchs and the dragon are composed from parts and transformed per
// frame, so these return a part bundle rather than one finished canvas.
const { REDESIGNED, bossArt, bossPortraitArt } = await import('../src/art/bosses.js');
for (const k of REDESIGNED) {
  const art = bossArt(k, 2);
  check(art && art.body, `boss ${k} has no body`);
  check(art && art.w > 0 && art.h > 0, `boss ${k} reports no size`);
  if (art?.body) sane(art.body, `boss ${k} body`);
  if (art?.extra) sane(art.extra, `boss ${k} ornament`);
  sane(bossPortraitArt(k, 1), `boss portrait ${k}`);
}
const { dragonParts } = await import('../src/art/dragon.js');
const parts = dragonParts(2);
check(parts.body && parts.wing, 'the dragon is missing a part');
sane(parts.body, 'dragon body');
sane(parts.wing, 'dragon wing');
const { propSprite, pickupSprite, iconSprite } = await import('../src/art/props.js');
for (const k of ['gem1', 'gem2', 'gem3', 'coin', 'heart', 'magnet', 'bombpick', 'chest']) sane(pickupSprite(k, 2), `pickup ${k}`);
for (const k of ['might', 'area', 'cooldown', 'vitality', 'armor', 'swiftness', 'regen']) sane(iconSprite(k, 4), `icon ${k}`);
// World scenery, over every biome that uses it.
const { BIOMES } = await import('../src/game/world.js');
for (const b2 of BIOMES) {
  for (const [kind] of [...b2.props, ...b2.decor]) sane(propSprite(kind, 0, b2.tint, 2), `${b2.name || 'biome'} ${kind}`);
}

console.log(`everything else   ok (${built} sprites built)`);

if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((x) => console.error('  - ' + x));
  process.exit(1);
}
console.log('\nAll art checks passed.');
