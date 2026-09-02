// ---------------------------------------------------------------------------
// props.js — scenery, pickups and every UI icon, all generated at boot.
//
// Scenery is drawn procedurally (a handful of seeded variants per prop so the
// world does not visibly tile); pickups and icons are authored pixel maps
// written compactly as "row/row/row" strings.
// ---------------------------------------------------------------------------

import { rasterize, sprite, PAL, pixelSurface, outlinePixels, upscale } from './pixel.js';
import { makeRng, TAU } from '../core/util.js';
import { BUDGIES, budgieIcon } from './familiars.js';

/** "aa/bb/cc" -> ['aa','bb','cc'] — keeps the icon tables readable. */
const m = (s) => s.split('/');

// ===========================================================================
// Scenery
// ===========================================================================

const PROP_BUILDERS = {
  tree_pine(rng, tint) {
    const p = pixelSurface(20, 30);
    p.rect(9, 20, 3, 9, '#4a3220');
    p.rect(9, 20, 1, 9, '#664732');
    const layers = 4;
    for (let i = 0; i < layers; i++) {
      const y = 4 + i * 5;
      const w = 4 + i * 3;
      p.ctx.fillStyle = i % 2 ? tint.leafDark : tint.leaf;
      for (let r = 0; r < 6; r++) {
        const ww = Math.round(w * (r / 6) + 2);
        p.rect(10 - ww, y + r, ww * 2 + 1, 1, i % 2 ? tint.leafDark : tint.leaf);
      }
      p.rect(10 - 2, y, 4, 2, tint.leaf);
    }
    p.rect(8, 2, 5, 3, tint.leaf);
    return outlinePixels(p.canvas);
  },
  tree_oak(rng, tint) {
    const p = pixelSurface(24, 28);
    p.rect(10, 17, 4, 11, '#4a3220');
    p.rect(10, 17, 1, 11, '#664732');
    const blobs = 6;
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * TAU + rng() * 0.5;
      const cx = 12 + Math.cos(a) * 6;
      const cy = 10 + Math.sin(a) * 5;
      p.disc(cx, cy, 4 + rng() * 2, i % 2 ? tint.leafDark : tint.leaf);
    }
    p.disc(12, 10, 6, tint.leaf);
    p.disc(10, 8, 3, tint.leafLight);
    return outlinePixels(p.canvas);
  },
  bush(rng, tint) {
    const p = pixelSurface(16, 12);
    for (let i = 0; i < 5; i++) {
      p.disc(3 + i * 2.4 + rng(), 7 + rng() * 2, 3 + rng() * 1.5, i % 2 ? tint.leafDark : tint.leaf);
    }
    p.disc(6, 5, 2, tint.leafLight);
    return outlinePixels(p.canvas);
  },
  rock(rng) {
    const p = pixelSurface(16, 13);
    p.disc(8, 9, 6, '#6d6a63');
    p.disc(6, 7, 4, '#8b8880');
    p.disc(10, 10, 3, '#55524c');
    p.rect(2, 11, 12, 2, '#4a4741');
    return outlinePixels(p.canvas);
  },
  rock_small(rng) {
    const p = pixelSurface(10, 8);
    p.disc(5, 5, 3, '#6d6a63');
    p.disc(4, 4, 2, '#8b8880');
    return outlinePixels(p.canvas);
  },
  stump(rng) {
    const p = pixelSurface(14, 11);
    p.rect(3, 4, 8, 7, '#4a3220');
    p.disc(7, 4, 4, '#7a5a3a');
    p.disc(7, 4, 2, '#5c412a');
    return outlinePixels(p.canvas);
  },
  mushroom(rng, tint) {
    const p = pixelSurface(10, 11);
    p.rect(4, 6, 3, 5, '#e8dcc0');
    p.disc(5, 5, 4, tint.accent || '#d0453f');
    p.px(3, 4, '#ffffff'); p.px(7, 5, '#ffffff'); p.px(5, 2, '#ffffff');
    return outlinePixels(p.canvas);
  },
  gravestone(rng) {
    const p = pixelSurface(14, 16);
    p.rect(3, 4, 8, 11, '#8e8a80');
    p.disc(7, 5, 4, '#8e8a80');
    p.rect(4, 5, 2, 10, '#a8a49a');
    p.rect(6, 7, 3, 1, '#5c5850');
    p.rect(7, 6, 1, 4, '#5c5850');
    p.rect(1, 14, 12, 2, '#4c483f');
    return outlinePixels(p.canvas);
  },
  pillar(rng) {
    const p = pixelSurface(14, 24);
    p.rect(4, 3, 6, 18, '#b3ad9c');
    p.rect(4, 3, 2, 18, '#d0cab6');
    p.rect(2, 20, 10, 4, '#9b9585');
    p.rect(3, 0, 8, 4, '#c4beac');
    for (let y = 6; y < 20; y += 4) p.rect(4, y, 6, 1, '#8d8878');
    return outlinePixels(p.canvas);
  },
  crystal(rng, tint) {
    const p = pixelSurface(14, 20);
    const c = tint.crystal || '#8a5bff';
    const cl = tint.crystalLight || '#c9a8ff';
    for (let y = 0; y < 16; y++) {
      const w = Math.round(1 + (y / 16) * 5);
      p.rect(7 - w, 4 + y, w * 2, 1, c);
    }
    for (let y = 0; y < 12; y++) p.rect(6 - Math.round(y / 5), 6 + y, 2, 1, cl);
    p.rect(1, 16, 5, 4, c);
    p.rect(9, 14, 4, 6, c);
    return outlinePixels(p.canvas);
  },
  bones(rng) {
    const p = pixelSurface(14, 9);
    p.disc(4, 5, 3, '#ded8c4');
    p.px(3, 5, '#3a352c'); p.px(5, 5, '#3a352c');
    p.rect(7, 6, 6, 2, '#ded8c4');
    p.rect(8, 4, 5, 1, '#c3bda9');
    return outlinePixels(p.canvas);
  },
  brazier(rng) {
    const p = pixelSurface(12, 18);
    p.rect(4, 10, 4, 7, '#5b584f');
    p.rect(2, 16, 8, 2, '#4a4741');
    p.rect(2, 7, 8, 4, '#7a756a');
    p.disc(6, 6, 3, '#ff8a2a');
    p.disc(6, 5, 2, '#ffd75e');
    return outlinePixels(p.canvas);
  },
  obelisk(rng, tint) {
    const p = pixelSurface(12, 26);
    for (let y = 0; y < 22; y++) {
      const w = 2 + Math.round((y / 22) * 3);
      p.rect(6 - w, 3 + y, w * 2, 1, '#3d3a4d');
    }
    p.rect(4, 8, 1, 10, tint.crystal || '#8a5bff');
    p.rect(1, 24, 10, 2, '#2b2938');
    return outlinePixels(p.canvas);
  },
};

/** Ground clutter: tiny, cheap, drawn by the thousand. */
const DECO_BUILDERS = {
  grass(rng, tint) {
    const p = pixelSurface(7, 6);
    for (let i = 0; i < 4; i++) {
      const x = 1 + i * 1.6;
      const h = 2 + Math.floor(rng() * 3);
      for (let k = 0; k < h; k++) p.px(Math.round(x + k * 0.3), 5 - k, k > 1 ? tint.leaf : tint.leafDark);
    }
    return p.canvas;
  },
  flower(rng, tint) {
    const p = pixelSurface(5, 6);
    p.px(2, 5, tint.leafDark); p.px(2, 4, tint.leafDark);
    const c = tint.flower || '#ff9ad2';
    p.px(1, 2, c); p.px(3, 2, c); p.px(2, 1, c); p.px(2, 3, c);
    p.px(2, 2, '#ffe9a8');
    return p.canvas;
  },
  pebble(rng) {
    const p = pixelSurface(4, 3);
    p.px(1, 1, '#6d6a63'); p.px(2, 1, '#55524c'); p.px(1, 2, '#4a4741');
    return p.canvas;
  },
  fern(rng, tint) {
    const p = pixelSurface(9, 7);
    for (let i = 0; i < 5; i++) {
      const a = -0.4 - i * 0.35;
      for (let k = 0; k < 4; k++) {
        p.px(4 + Math.cos(a) * k, 6 + Math.sin(a) * k, k > 1 ? tint.leaf : tint.leafDark);
      }
    }
    return p.canvas;
  },
};

const propCache = new Map();

/**
 * Returns a seeded variant of a prop. Four variants per (kind, biome tint)
 * is enough that a screenful of trees never looks copy-pasted.
 */
export function propSprite(kind, variant, tint, scale = 2) {
  const key = `${kind}:${variant}:${tint.id}:${scale}`;
  let c = propCache.get(key);
  if (!c) {
    const build = PROP_BUILDERS[kind] || DECO_BUILDERS[kind];
    if (!build) return null;
    const rng = makeRng(variant * 7919 + kind.length * 131);
    c = upscale(build(rng, tint), scale);
    propCache.set(key, c);
  }
  return c;
}

export const PROP_KINDS = Object.keys(PROP_BUILDERS);
export const DECO_KINDS = Object.keys(DECO_BUILDERS);

// ===========================================================================
// Pickups
// ===========================================================================

const PICKUPS = {
  gem1: { pal: { a: '#7fe0ff', b: '#2f9ec2', o: '#0d3346' }, map: m('..oo../.oaao./oaabbo/oabbbo/.obbo./..oo..') },
  gem2: { pal: { a: '#9dff8f', b: '#2f9a45', o: '#0f3a18' }, map: m('..oo../.oaao./oaabbo/oabbbo/.obbo./..oo..') },
  gem3: { pal: { a: '#ffc7f0', b: '#c2429a', o: '#4a0f36' }, map: m('..oo../.oaao./oaabbo/oabbbo/.obbo./..oo..') },
  coin: { pal: { a: '#ffe07a', b: '#c9922a', o: '#4a3208' }, map: m('.oooo./oaaaao/oabbao/oabbao/oaaaao/.oooo.') },
  heart: { pal: { a: '#ff6a86', b: '#c2244a', o: '#4a0a1c' }, map: m('.oo.oo./oaaoaao/oaaaaao/obaaabo/.obabo./..obo../...o...') },
  magnet: { pal: { a: '#ff5a5a', b: '#d9d9e6', o: '#2a0a0a' }, map: m('.oooo./oaooao/oaooao/oaooao/obooao/ob..bo') },
  bombpick: { pal: { a: '#4a4a58', b: '#8a8a9a', o: '#12121a', y: '#ffd75e' }, map: m('....y./...y../.oooo./obbbao/obbbao/.oooo.') },
  chest: { pal: { a: '#a9662f', b: '#6d3d1a', y: '#ffd75e', o: '#2a1408' }, map: m('.oooooo./obbbbbbo/oyyyyyyo/oaaaaaao/oayaayao/oaaaaaao/.oooooo.') },
};

export const pickupSprite = (kind, scale = 3) =>
  sprite(`pickup:${kind}:${scale}`, () => {
    const d = PICKUPS[kind] || PICKUPS.gem1;
    return rasterize(d.map, { scale, palette: d.pal });
  });

// ===========================================================================
// Icons (10x10) for weapons, evolutions and passives
// ===========================================================================

const ICONS = {
  // --- weapons ---
  bolt:      { pal: { a: '#d9e2f0', b: '#8d97a8', c: '#8a5a33' }, map: m('.......oo./......oaao/.....oaaao/....oaaao./...oaaao../..oaaao.../.oaco...../occo....../oo......../..........') },
  slash:     { pal: { a: '#ffffff', b: '#9ad2ff' }, map: m('......ooo./....ooaaao/..ooaaabo./.oaaabo..../oaaabo...../oaabo....../.oabo....../..obo....../...o....../..........') },
  orb:       { pal: { a: '#c9a8ff', b: '#7b3ff2', w: '#ffffff' }, map: m('...ooo..../..oaaao.../.oaawaaao./.oaaaaabo./.oaaaabbo./..obaabo../...obbo.../....oo..../........../..........') },
  firebomb:  { pal: { a: '#ff8a2a', b: '#c2431a', y: '#ffe08a', o: '#2a0e06' }, map: m('.......y../......y.../...ooo..../..oaaao.../.oayyaao../.oaaaaao../.oabbbao../..obbbo.../...ooo..../..........') },
  aura:      { pal: { a: '#ff8a2a', b: '#ffd75e' }, map: m('..oaao..../.oa...ao../oa..bb..ao/a..bbbb..a/a.bbbbbb.a/a.bbbbbb.a/a..bbbb..a/oa..bb..ao/.oa...ao../..oaao....') },
  lightning: { pal: { a: '#ffe86a', b: '#ffb02a' }, map: m('....oaa.../...oaa..../..oaa...../.oaaaaa.../..oaab..../...oaa..../..oaa...../.oaa....../oa......../..........') },
  nova:      { pal: { a: '#c9f2ff', b: '#4f9dff' }, map: m('....a...../.a..a..a../..a.a.a.../...aaa..../aaaabaaaa./...aaa..../..a.a.a.../.a..a..a../....a...../..........') },
  orbit:     { pal: { a: '#ffe07a', b: '#c9922a', w: '#ffffff' }, map: m('...aaa..../..a...a.../.a..w..a../a..www..a/a..www..a/.a..w..a../..a...a.../...aaa..../........../..........') },
  glaive:    { pal: { a: '#d9e2f0', b: '#5ee8d0' }, map: m('..oooo..../.oaaaabo./oaao..obo/oao....oo/oao....../oaao...../.oaaao..../..oaaao.../...oaao.../....oo....') },
  brambles:  { pal: { a: '#4f9a3c', b: '#2f6a26', y: '#c9f26a' }, map: m('..a....a../.aa.a.aa./a.aaaaa.a/.aabbbaa./aabbbbbaa/.aabbbaa./a.aaaaa.a/.aa.a.aa./..a....a../..........') },
  mjolnir:   { pal: { a: '#c9d2e0', b: '#5a6274', y: '#9ad4ff' }, map: m('..oooooo../.obbbbbbo./.obaaaabo./.obbbbbbo./..oo.aoo../..y..a..y./.....a..../..y..a..y./....oo..../..........') },
  censer:    { pal: { a: '#8fd8ff', b: '#5a6274', y: '#ffd75e' }, map: m('....o...../....b...../....b...../..oaaao.../.oayyyao../.oaaaaao../..oaaao.../...ooo..../..y...y.../..........') },
  pike:      { pal: { a: '#c9d2e0', b: '#8a5a33' }, map: m('........oo/.......oao/......oao./.....oao../....oao.../...oao..../..bao...../.bbo....../bo......../..........') },
  // --- evolutions ---
  bolt_evo:      { pal: { a: '#ffe86a', b: '#ff8a2a', c: '#ffffff' }, map: m('......oaa./.....oaao/....oaao./..o.oaao../.o.oaao.../o.oaao..../.oaco...../occo....../oo......../..........') },
  slash_evo:     { pal: { a: '#ff6a86', b: '#ffffff' }, map: m('.....oooo./...ooaaaao/..oaaabbo./.oaaabo..../oaaabo...../oaabo....../.oabo....../..obo....../...oo...../..........') },
  orb_evo:       { pal: { a: '#ffc7f0', b: '#c05bff', w: '#ffffff' }, map: m('.w.ooo..w./..oaaao.../.oaawaaao./woaaaaabo.w/.oaaaabbo./..obaabo../.w.obbo.w./....oo..../........../..........') },
  firebomb_evo:  { pal: { a: '#ffd75e', b: '#e0402c', y: '#fff3c4' }, map: m('.y.....y../..ooo.y.../.oaaaoy.../oayyyao..../oayyyao..../oaaaaao..../.obbbo...../..ooo...../........../..........') },
  aura_evo:      { pal: { a: '#ffd75e', b: '#ff5a2a' }, map: m('.aoaoao..../ao.....oa./o..bbbb..o/a.bbbbbb.a/a.bbbbbb.a/a.bbbbbb.a/o..bbbb..o/ao.....oa./.aoaoao..../..........') },
  lightning_evo: { pal: { a: '#ffffff', b: '#8fd8ff' }, map: m('...oaa.a../..oaa.a.../.oaa.a..../oaaaaaaa./..oaab..../.oaa.a..../oaa.a...../aa.a....../a........./..........') },
  nova_evo:      { pal: { a: '#ffffff', b: '#4f9dff' }, map: m('.a..a..a../..a.a.a.../aaaaaaaaa/..abbba.../.abbbbba./..abbba.../aaaaaaaaa/..a.a.a.../.a..a..a../..........') },
  orbit_evo:     { pal: { a: '#ffffff', b: '#ffd75e', w: '#fff3c4' }, map: m('..aaaaa.../.a.....a./a..bbb..a/a.bbbbb.a/a.bbbbb.a/a.bbbbb.a/a..bbb..a/.a.....a./..aaaaa.../..........') },
  glaive_evo:    { pal: { a: '#c9f2ff', b: '#5ee8d0' }, map: m('.oooooo.../oaaaaabo./oaao.obo./oao...oo../oao....../oaao....../.oaaaoo.../..oaaaao../...oaaao../....ooo...') },
  brambles_evo:  { pal: { a: '#c9f26a', b: '#2f6a26', y: '#ffffff' }, map: m('a.a....a.a/.aa.a.aa./a.aaaaa.a/.aabbbaa./aabbybbaa/.aabbbaa./a.aaaaa.a/.aa.a.aa./a.a....a.a/..........') },
  mjolnir_evo:   { pal: { a: '#ffe86a', b: '#8d97a8', y: '#ffffff' }, map: m('y.oooooo.y/.obbbbbbo./.obaaaabo./.obbbbbbo./y.oo.aoo.y/.y...a...y/y....a...y/.y...a...y/y...oo...y/..........') },
  censer_evo:    { pal: { a: '#ffd75e', b: '#8a5a33', y: '#ff8a2a' }, map: m('..y.o.y.../....b...../..y.b.y.../..oaaao.../.oayyyao../.oayyyao../..oaaao.../..oooooo../.yyyyyyyy./..........') },
  pike_evo:      { pal: { a: '#ffe86a', b: '#ff8a2a' }, map: m('......ooo./.....oaao./....oaao../...oaao..o/..oaao..oa/.oaao..oa./.bao..oa../bbo..oa.../o...oa..../....o.....') },
  // --- passives ---
  might:     { pal: { a: '#ff6a4a', b: '#8a1d12', w: '#ffffff' }, map: m('....ww..../...waaw.../..waaaaw../.waaaaaaw./waaaaaaaaw/.waaaaaaw./..wbbbbw../...wbbw.../....ww..../..........') },
  wrath:     { pal: { a: '#ffd75e', b: '#ff5a2a' }, map: m('....a...../...aaa..../.a.aaa.a../.aaabaaa./aaabbbaaa/.aaabaaa../..a.aaa.a./...aaa..../....a...../..........') },
  area:      { pal: { a: '#5ee8d0', b: '#1f8f86' }, map: m('aa.....aa/a.......a/........./...bbb.../...bbb.../...bbb.../........./a.......a/aa.....aa/..........') },
  velocity:  { pal: { a: '#8fd8ff', b: '#4f9dff' }, map: m('..a...a.../...a...a../....a...a./.....a...a/....a...a./...a...a../..a...a.../.a...a..../a...a...../..........') },
  caliber:   { pal: { a: '#ffb648', b: '#c2431a' }, map: m('....a...../...aaa..../..aaaaa.../..abbba.../..abbba.../..abbba.../..aaaaa.../...aaa..../....a...../..........') },
  cooldown:  { pal: { a: '#d9e2f0', b: '#4f9dff', o: '#20242e' }, map: m('...oooo.../..oaaaao../.oa..b..ao/oa...b...a/oa...bbb.a/oa.......a/.oa.....ao/..oaaaao../...oooo.../..........') },
  amount:    { pal: { a: '#5ee8d0', b: '#1f8f86' }, map: m('..a....a../.aaa..aaa./.aaa..aaa./..a....a../........../..a....a../.aaa..aaa./.aaa..aaa./..a....a../..........') },
  swiftness: { pal: { a: '#9dff8f', b: '#2f7a34' }, map: m('..aaa...../..aba...../..aba...../..aba...../..abaa..../.aabaaa.../.aaaaaaa../.bbbbbbb../........../..........') },
  magnet:    { pal: { a: '#ff5a5a', b: '#d9d9e6' }, map: m('..aaaaa.../.aa...aa./.a.....a./.a.....a./.a.....a./.b.....b./.b.....b./.bb...bb./..b...b.../..........') },
  vitality:  { pal: { a: '#ff6a86', b: '#c2244a' }, map: m('.aa..aa.../aaaaaaaa./aaaaaaaa./aaaaaaaa./.aaaaaa.../..aaaa..../...aa...../........../........../..........') },
  armor:     { pal: { a: '#c9d2e0', b: '#5a6274' }, map: m('aaaaaaaa./abbbbbba./abbbbbba./abbbbbba./.abbbba../.abbbba../..abba.../...aa...../........../..........') },
  regen:     { pal: { a: '#9dff8f', b: '#2f7a34', w: '#ffffff' }, map: m('...aa...../...aa...../.aaaaaa.../.aaaaaa.../...aa...../...aa...../........../.w.....w../..w...w.../..........') },
  fortune:   { pal: { a: '#ffe07a', b: '#c9922a' }, map: m('...aaa..../..aaaaa.../.aabbbaa../.aabbbaa../.aabbbaa../..aaaaa.../...aaa..../....a...../....a...../..........') },
  luck:      { pal: { a: '#9dff8f', b: '#ffffff' }, map: m('..aa.aa.../.aaaaaaa../.aaaaaaa../..aaaaa.../.aa.a.aa../aa..a..aa/....a...../....a...../....a...../..........') },
};

// The four familiars are not drawn here. Their icon IS the bird, taken from
// the same sheet the one flying beside you comes off, so the card in the
// level-up screen and the thing it gives you are visibly the same animal.
// `budgie_storm` / `budgie_storm_evo` are the naming shape.
const FAMILIAR_ICON = /^budgie_([a-z]+?)(_evo)?$/;

function familiarIcon(name, scale) {
  const hit = FAMILIAR_ICON.exec(name);
  if (!hit || !BUDGIES[hit[1]]) return null;
  return budgieIcon(hit[1], !!hit[2], scale);
}

export function iconSprite(name, scale = 3) {
  return sprite(`icon:${name}:${scale}`, () => {
    const bird = familiarIcon(name, scale);
    if (bird) return bird;
    const d = ICONS[name] || ICONS.bolt;
    return rasterize(d.map, { scale, palette: { ...PAL, ...d.pal } });
  });
}

export const hasIcon = (name) => {
  if (ICONS[name]) return true;
  const hit = FAMILIAR_ICON.exec(name);
  return !!(hit && BUDGIES[hit[1]]);
};
