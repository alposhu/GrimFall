// ---------------------------------------------------------------------------
// food.js — the dropped meals.
//
// Carried over from the game this one grew out of, which had a full menu: a
// long flatbread, dumplings, seven pieces of sushi, and a handful of rarer
// treats. Redrawn from scratch as pixel maps so they fit the rest of the build
// (nothing here is a file on disk), keeping the originals' composition —
// nigiri as a fish slab draped over a rice block, maki as a cut face above a
// band of nori, uramaki rolled coating-side-out.
//
// Drop weights mirror the original's table: mostly flatbread and dumplings,
// a healthy share of sushi, and the treats kept rare.
// ---------------------------------------------------------------------------

import { rasterize, sprite } from './pixel.js';

export const FOODS = {
  etli_ekmek: {
    name: 'Etli Ekmek',
    heal: 40,
    weight: 32,
    pal: { o: '#5a3226', B: '#e8d29d', b: '#c9a45c', d: '#db8a41', r: '#c04a3a', g: '#5f9a45', w: '#f4e9c3' },
    map: [
      '.....oooooooooooo.....',
      '..ooobBBBBBBBBBbooo...',
      '.obBwbdbwbdbwbdbwbBbo.',
      'obBwdrdgdrdgdrdgdwdbBo',
      'obdgdrdwdgdrdwdgdrdgdo',
      'obBdwdgdrdwdgdrdwdgbBo',
      '.obBwbdbwbdbwbdbwbBbo.',
      '..ooobBBBBBBBBBbooo...',
      '.....oooooooooooo.....',
    ],
  },

  dumpling: {
    name: 'Dumpling',
    heal: 35,
    weight: 28,
    pal: { o: '#7b674b', D: '#f0e2c8', d: '#d6c1a7', s: '#b79f82', w: '#f6e8d7' },
    map: [
      '....oooooo....',
      '..ooDdDdDdoo..',
      '.oDdDwDdDwDdo.',
      'oDDwDDDDDDwDDo',
      'oDDDDDDDDDDDDo',
      'oDdDDDwwDDDdDo',
      'osDDDDDDDDDDso',
      '.osdDDDDDDdso.',
      '..ossdddddsso.',
      '...oooooooooo.',
    ],
  },

  // --- the seven pieces of sushi -------------------------------------------
  salmon_nigiri: {
    name: 'Salmon Nigiri',
    heal: 35,
    weight: 4.3,
    pal: { o: '#5a3007', S: '#ff933d', s: '#c37539', w: '#f7c59c', R: '#dedede', r: '#a8a8a8', g: '#7a7a7a' },
    map: [
      '.....oooooo...',
      '...ooSSwSSoo..',
      '..oSSwSSwSSSo.',
      '..oSwSSwSSsSo.',
      '..osSSwSSsSSoo',
      '.ooRRRRRRRRRo.',
      'oRRrRRrRRrRRRo',
      'oRRRRRRRRRRRRo',
      'oRrRRrRRrRRRgo',
      '.ogggggggggggo',
      '..oooooooooooo',
    ],
  },

  octopus_nigiri: {
    name: 'Octopus Nigiri',
    heal: 35,
    weight: 4.3,
    // Tako: pale flesh with a purple rim and the suckers showing along it.
    pal: { o: '#4a2340', W: '#f7ecef', w: '#d9c6cf', P: '#b23a6a', p: '#e0658f', R: '#dedede', r: '#a8a8a8', g: '#7a7a7a' },
    map: [
      '.....oooooo...',
      '...ooPPpPPoo..',
      '..oPWWpWWPWPo.',
      '..oPWpWWpWwPo.',
      '..oPWWpWWwWPoo',
      '.ooRRRRRRRRRo.',
      'oRRrRRrRRrRRRo',
      'oRRRRRRRRRRRRo',
      'oRrRRrRRrRRRgo',
      '.ogggggggggggo',
      '..oooooooooooo',
    ],
  },

  avocado_maki: {
    name: 'Avocado Maki',
    heal: 35,
    weight: 4.3,
    pal: { o: '#1a1a1a', R: '#e4e4e4', r: '#b0b0b0', e: '#7ec03d', E: '#59981b', N: '#2a2a2a', n: '#161616' },
    map: [
      '..oooooooooo..',
      '.oRRrRRrRRRRo.',
      'oRRReeeeeRRRRo',
      'oRReEEeeEeRRRo',
      'oRReeeEEeeRRRo',
      'oRRReeeeeRRRRo',
      'oRRrRRRRrRRRRo',
      'oNNNnNNNnNNNNo',
      'onNNNnNNNnNNNo',
      'oNNnNNNnNNNnNo',
      '.oNnNNNnNNNNo.',
      '..oooooooooo..',
    ],
  },

  salmon_maki: {
    name: 'Salmon Maki',
    heal: 35,
    weight: 4.3,
    pal: { o: '#1a1a1a', R: '#e4e4e4', r: '#b0b0b0', s: '#ff8a3d', S: '#d95f1e', w: '#ffd0a8', N: '#2a2a2a', n: '#161616' },
    map: [
      '..oooooooooo..',
      '.oRRrRRrRRRRo.',
      'oRRRsssssRRRRo',
      'oRRsSwssSsRRRo',
      'oRRsswwSssRRRo',
      'oRRRsssssRRRRo',
      'oRRrRRRRrRRRRo',
      'oNNNnNNNnNNNNo',
      'onNNNnNNNnNNNo',
      'oNNnNNNnNNNnNo',
      '.oNnNNNnNNNNo.',
      '..oooooooooo..',
    ],
  },

  california_roll: {
    name: 'California Roll',
    heal: 35,
    weight: 4.3,
    // Inside-out, so the roll is rice on the outside, jacketed in orange roe.
    pal: { o: '#6b1d17', R: '#f4f4f4', r: '#c4c4c4', e: '#6abe30', c: '#f2d8d3', a: '#d9a066', T: '#ed873a', t: '#bc4136' },
    map: [
      '..oooooooooo..',
      '.oRRrRRRrRRRo.',
      'oRRReeaccRRRRo',
      'oRReeeaccaRRRo',
      'oRReaacceeRRRo',
      'oRRReeaccRRRRo',
      'oRRrRRRRrRRRRo',
      'oTtTtTtTtTtTTo',
      'otTtTtTtTtTtTo',
      'oTtTtTtTtTtTTo',
      '.otTtTtTtTtTo.',
      '..oooooooooo..',
    ],
  },

  avocado_uramaki: {
    name: 'Avocado Uramaki',
    heal: 35,
    weight: 4.3,
    pal: { o: '#2f4a1c', R: '#f4f4f4', r: '#c4c4c4', e: '#7ec03d', E: '#59981b', G: '#8fce4f', g: '#4d8b23', S: '#e8e2cf' },
    map: [
      '..oooooooooo..',
      '.oRRrRRRrRRRo.',
      'oRRReeEEeRRRRo',
      'oRReEEeeEeRRRo',
      'oRReeEEEeeRRRo',
      'oRRReEeeeRRRRo',
      'oRRrRRRRrRRRRo',
      'oGgGSgGSgGGGSo',
      'ogGSgGgSgGSgGo',
      'oGGgSgGgSgGGSo',
      '.ogGSgGSgGGgo.',
      '..oooooooooo..',
    ],
  },

  salmon_uramaki: {
    name: 'Salmon Uramaki',
    heal: 35,
    weight: 4.3,
    pal: { o: '#7a2a10', R: '#f4f4f4', r: '#c4c4c4', s: '#ff8a3d', D: '#d95f1e', w: '#ffd0a8', T: '#f2946a', t: '#c96a44', E: '#f6ead2' },
    map: [
      '..oooooooooo..',
      '.oRRrRRRrRRRo.',
      'oRRRsssssRRRRo',
      'oRRsDwssDsRRRo',
      'oRRsswDssDRRRo',
      'oRRRsssssRRRRo',
      'oRRrRRRRrRRRRo',
      'oTtTEtTEtTTTEo',
      'otTEtTtEtTEtTo',
      'oTTtEtTtEtTTEo',
      '.otTEtTEtTTto.',
      '..oooooooooo..',
    ],
  },

  // --- the rare treats -----------------------------------------------------
  lasagna: {
    name: 'Lasagna',
    heal: 45,
    weight: 2.5,
    pal: { o: '#5a2a18', P: '#f0d9a4', R: '#b03a2a', C: '#ffe9a8', s: '#d9b46a' },
    map: [
      '..oooooooooo..',
      '.oCCCCCCCCCCo.',
      'oCCCCCCCCCCCCo',
      'oPPPPPPPPPPPPo',
      'oRRRRRRRRRRRRo',
      'oPPPPPPPPPPPPo',
      'oRRRRRRRRRRRRo',
      'osPPPPPPPPPPso',
      '.oooooooooooo.',
    ],
  },

  heaven_persimmon: {
    name: 'Heaven Persimmon',
    heal: 30,
    weight: 2.5,
    pal: { o: '#5a2a10', f: '#ff8a2a', F: '#ffb648', d: '#c2431a', e: '#5f9a45', E: '#2f6a26' },
    map: [
      '.....oo.....',
      '...ooeeoo...',
      '..oeEeeEeo..',
      '...ooffoo...',
      '..offFffo...',
      '.offFffffo..',
      'offFfffffdo.',
      'offfffffddo.',
      'offffffdddo.',
      '.offfffddo..',
      '..offfddo...',
      '...oooooo...',
    ],
  },

  delice_salt: {
    name: 'Delice Salt',
    heal: 20,
    weight: 2.5,
    pal: { o: '#4a4a55', G: '#cfd8e6', g: '#8f9bb0', W: '#ffffff', w: '#e2e8f2', c: '#b08040' },
    map: [
      '....oooo....',
      '...oWwWWo...',
      '..oWWwWWWo..',
      '..oWwWWwWo..',
      '...oWWWWo...',
      '...occcco...',
      '..oGgGGgGo..',
      '.oGGgGGGgGo.',
      '.oGgGGgGGGo.',
      '.oGGgGGGgGo.',
      '.ogGGgGGgGo.',
      '..oooooooo..',
    ],
  },

  cookies: {
    name: 'Spiced Cookies',
    heal: 30,
    weight: 2.5,
    pal: { o: '#4a2a14', C: '#d9a15b', c: '#b87c3e', k: '#4a2c17', h: '#ecc78d' },
    map: [
      '..oooooooo..',
      '.oChCCkCCCo.',
      'oCkCCCChCCko',
      'oCCCkCCCCCCo',
      'oCcCCkCCkCco',
      '.occcccccco.',
      '.oCkCCChCCo.',
      'ocCCkCCCCkco',
      '.occcccccco.',
      '..oooooooo..',
    ],
  },
};

export const FOOD_IDS = Object.keys(FOODS);

const TOTAL_WEIGHT = FOOD_IDS.reduce((sum, id) => sum + FOODS[id].weight, 0);

export const foodSprite = (id, scale = 2) =>
  sprite(`food:${id}:${scale}`, () => {
    const d = FOODS[id] || FOODS.dumpling;
    return rasterize(d.map, { scale, palette: d.pal });
  });

/** Weighted roll: flatbread and dumplings are common, the treats are not. */
export function randomFood() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const id of FOOD_IDS) {
    r -= FOODS[id].weight;
    if (r <= 0) return id;
  }
  return FOOD_IDS[FOOD_IDS.length - 1];
}

export const foodName = (id) => (FOODS[id] || FOODS.dumpling).name;
export const foodHeal = (id) => (FOODS[id] || FOODS.dumpling).heal;
