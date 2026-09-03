// ---------------------------------------------------------------------------
// bestiary.js — every hostile sprite in the game.
//
// The rank and file are DRAWN, in art-source/mobs/, and translated into pixel
// maps by tools/assets/build-mobs.py; this file imports the result and knows
// nothing about where it came from. Champions are still authored here, as a
// left half that is mirrored, so their maps are half as wide as the sprite
// they produce (12 -> 24).
//
// Bosses are in neither: they are composed from layered parts in bosses.js and
// dragon.js, which is what lets them animate.
// ---------------------------------------------------------------------------

import { rasterize, mirror, sprite } from './pixel.js';
import { MOB_ART, MOB_ART_TINT } from './mobs.js';

// --- champions (24x24) ------------------------------------------------------
const CHAMPIONS = {
  golem: {
    palette: { g: '#8d8a7e', G: '#5b584f', c: '#5ee8d0', o: '#22201c' },
    half: [
      '............', '............', '......oooooo', '....ooggggGG',
      '...ogggggggg', '...oggcggggg', '...oggggggGG', '....oGGGGGGG',
      '..oooogGGGGG', '.oggggggggGG', '.oggggcggggg', '.oggggggggGG',
      '.oGGgggggggg', '.oGGGGgGGGGG', '..ooGGGGGGGG', '...oGGGGGGGG',
      '...oGGGoGGGG', '...oGGGoGGGG', '...oGGGo.GGG', '..ooGGGo.oGG',
      '..oGGGGo.oGG', '..oGGGoo.oGG', '..ooooo..ooo', '............',
    ],
  },
  slimeking: {
    palette: { e: '#5ad0a0', E: '#2a8f6a', y: '#ffd75e', o: '#0f3a2c' },
    half: [
      '............', '.......oo...', '......oyyo..', '.....oyyyyo.',
      '....ooooooo.', '...oooeeeeee', '..oeeeeeeeee', '..oeeeeeeeee',
      '.oeeeoeeeeee', '.oeeeeeeeeee', '.oeeeeeeeeee', 'oeeeeeeeeeee',
      'oeeeeeeeeeee', 'oeeeeeeeeeee', 'oeeeeeeeeeee', 'oEEEEEEEEEEE',
      'oEEEEEEEEEEE', 'oEEEEEEEEEEE', '.oEEEEEEEEEE', '.oEEEEEEEEEE',
      '..oEEEEEEEEE', '..ooEEEEEEEE', '...ooooooooo', '............',
    ],
  },
  skullmage: {
    palette: { t: '#e4dfcd', T: '#a49c86', p: '#c08bff', P: '#5d2b8f', o: '#1a1226' },
    half: [
      '............', '.......ooo..', '.....ootttt.', '....otttttt.',
      '....ottottt.', '....otttttt.', '.....oTTttt.', '......oottt.',
      '...ooooPPPP.', '..oPPPPPPPPP', '.oPPPPPPPPPP', '.oPPPpPPPPPP',
      'oPpPPPPPPPPP', 'oPPPPPPPPPPP', 'oPPPPPPPPPPP', '.oPPPPPPPPPP',
      '.oPPPPPPPPPP', '..oPPPPPPPPP', '..oPPPPPPPPP', '...oPPPPPPPP',
      '...oPPPPPPPP', '....ooPPPPPP', '......oooooo', '............',
    ],
  },
  broodmother: {
    palette: { n: '#3a2a4a', N: '#1d1430', r: '#ff4d5e', o: '#0b0714' },
    half: [
      '............', 'o...........', 'on.o........', '.onn.o......',
      '..onno.o....', '...onnnoo...', '....onnnnnoo', '...oonnnnnnn',
      '..onnnnnnnnn', '.onnnrnnnnnn', '.onnnnnnnnnn', 'onnnnnnnnnnn',
      'onnnnnnnnnnn', '.oNNNNNNNNNN', '.oNNNNNNNNNN', '..oNNNNNNNNN',
      '..o.oNNNNNNN', '.o..ooNNNNNN', 'o....ooNNNNN', '.......ooNNN',
      '.........ooN', '............', '............', '............',
    ],
  },
  treant: {
    palette: { l: '#6b4a2a', L: '#3d2a17', e: '#4f9a3c', E: '#2f6a26', y: '#ffd75e', o: '#1a1108' },
    half: [
      '.....oooooo.', '...ooeeeeeee', '..oeeeeeeeee', '.oeeeeeeeeee',
      '.oeeeeEEeeee', 'oeeeeeeeeeee', 'oeeeEeeeeeee', '.oeeeeeeeeee',
      '..oeeeeeeeee', '...ooolllllL', '.....ollylll', '.....ollllll',
      '.....olllllL', '....oollllll', '...ollllllll', '...ollllllLL',
      '..olllllllLL', '..oLLlllllLL', '..oLLLLLLLLL', '..oLLLLLLLLL',
      '.ooLLLLLLLLL', '.oLLLLLLLLLL', '.ooooooooooo', '............',
    ],
  },
  wraithlord: {
    palette: { n: '#3f3470', N: '#221a44', c: '#7ff0ff', w: '#ffffff', o: '#0d0920' },
    half: [
      '............', '.......ooo..', '.....oonnnn.', '....onnnnnn.',
      '....oncnnnn.', '....onnnnnn.', '...oonnnnnnn', '..onnnnnnnnn',
      '.onnnnnnnnnn', '.onnnnnnnnnn', 'onnnnnnnnnnn', 'onnnncnnnnnn',
      'onnnnnnnnnnn', '.oNNNNNNNNNN', '.oNNNNNNNNNN', '..oNNNNNNNNN',
      '..oNNNNNNNNN', '...oNNNNNNNN', '...oNNNNNNNN', '....oNNNNNNN',
      '.....oNNNNNN', '......ooNNNN', '.........ooo', '............',
    ],
  },
};

export const MOB_KEYS = Object.keys(MOB_ART);
export const CHAMPION_KEYS = Object.keys(CHAMPIONS);

/**
 * A mob, at its own resolution.
 *
 * The default scale is 1 where the champions' is 2, and the difference is not
 * an oversight: a champion is a 24-pixel map that has to be doubled to reach a
 * usable size, while the mob art is already drawn at the size it wants to be —
 * 12 to 46 pixels, whatever the creature needed. Rasterising it at 2x would
 * only make render.js divide the same factor back out.
 */
export const mobSprite = (key, scale = 1) => sprite(`mob:${key}:${scale}`, () => {
  const def = MOB_ART[key];
  return rasterize(def.rows, { scale, palette: def.palette });
});

export const championSprite = (key, scale = 2) => sprite(`champ:${key}:${scale}`, () => {
  const def = CHAMPIONS[key];
  return rasterize(mirror(def.half), { scale, palette: def.palette });
});

/**
 * The dominant colour of a creature, used for its death burst and its glow.
 * The mobs' are read off the drawings by build-mobs.py; the champions are
 * hand-picked, because their maps are hand-authored too.
 */
export const MOB_TINT = {
  ...MOB_ART_TINT,
  golem: '#8d8a7e', slimeking: '#5ad0a0', skullmage: '#c08bff', broodmother: '#ff4d5e',
  treant: '#4f9a3c', wraithlord: '#7ff0ff',
};
