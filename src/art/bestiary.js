// ---------------------------------------------------------------------------
// bestiary.js — every hostile sprite in the game.
//
// Symmetric creatures are authored as a left half and mirrored, so the maps
// below are half as wide as the sprite they produce (8 -> 16, 12 -> 24).
//
// Bosses are not here: they are composed from layered parts in bosses.js and
// dragon.js, which is what lets them animate.
// ---------------------------------------------------------------------------

import { rasterize, mirror, sprite } from './pixel.js';

// --- rank and file (16x16) --------------------------------------------------
const MOBS = {
  slime: {
    palette: { e: '#6fd66a', E: '#3f9a45', o: '#123a18' },
    half: [
      '........', '........', '........', '......oo',
      '....ooee', '...oeeee', '..oeeeee', '..oeeoee',
      '..oeeeee', '.oeeeeee', '.oeeeeee', '.oEEEEEE',
      '.oEEEEEE', '.oEEEEEE', '..oooooo', '........',
    ],
  },
  bat: {
    palette: { n: '#4a3b63', N: '#2a2140', r: '#ff5a6e', o: '#150f22' },
    half: [
      '........', '........', 'oo......', 'onoo....',
      'onnnoo..', '.onnnnoo', '..onnnnn', '..onrnnn',
      '..onnnnn', '...oNNNN', '....oNNN', '.....oon',
      '........', '........', '........', '........',
    ],
  },
  skeleton: {
    palette: { t: '#e4dfcd', T: '#a49c86', o: '#241f18' },
    half: [
      '........', '.....ooo', '...oottt', '...otttt',
      '...otott', '...otttt', '....oTTt', '.....ott',
      '..oottTt', '.ottTttt', '.otTtTtt', '.ottTttt',
      '..ooTttt', '....ottt', '....ottt', '....ooot',
    ],
  },
  brute: {
    palette: { e: '#7a9a3c', E: '#4a6a24', l: '#7a4a2a', r: '#ff5a4a', o: '#1d2410' },
    half: [
      '........', '.....ooo', '...ooeee', '...oeeee',
      '...oeree', '...oeeee', '...oEEEe', '..ooeeee',
      '.oeoeeee', '.oeoeeee', '.oeollll', '..ooEEEE',
      '...oEEEE', '...oEEEE', '...oo.EE', '....o.oE',
    ],
  },
  wisp: {
    palette: { c: '#8ef0ff', C: '#2f9ec2', w: '#ffffff', o: '#123244' },
    half: [
      '........', '........', '......oo', '....oocc',
      '...occcc', '..occwcc', '..occccc', '..occccc',
      '..occcCC', '...oCCCC', '....ooCC', '......oo',
      '........', '.....o.C', '........', '........',
    ],
  },
  imp: {
    palette: { r: '#e0503c', R: '#8f2a1c', y: '#ffd75e', o: '#2a0f0c' },
    half: [
      '........', '..oo....', '..oro...', '...orro.',
      '...orrrr', '...oryrr', '...orrrr', '....oRRr',
      '..oorrrr', '.orrrrrr', '.orrRRRR', '..ooRRRR',
      '....oRRR', '....oRRR', '....ooRR', '......oR',
    ],
  },
  spider: {
    palette: { n: '#2e2438', N: '#171022', r: '#ff4d5e', o: '#0c0812' },
    half: [
      '........', '........', 'o.......', 'on.o....',
      '.onno...', '..onnoo.', '...onnnn', '..oonnnn',
      '.onnrnnn', '.onnnnnn', '..oNNNNN', '...ooNNN',
      '..o..oNN', '.o....oo', 'o.......', '........',
    ],
  },
  shade: {
    palette: { n: '#3a2f5c', N: '#211842', p: '#c08bff', o: '#0e0a1a' },
    half: [
      '........', '......oo', '....oonn', '...onnnn',
      '...onpnn', '...onnnn', '..onnnnn', '..onnnnn',
      '.onnnnnn', '.onnnnnn', '.oNNNNNN', '.oNNNNNN',
      '..oNNNNN', '...oNNNN', '....oNNN', '.....ooN',
    ],
  },
  hound: {
    palette: { l: '#8a4a2a', L: '#4f2916', r: '#ff7a3c', o: '#1a0d07' },
    half: [
      '........', '........', '........', '......oo',
      '.....oll', '...ollll', '...olrll', '...ollll',
      '..oollll', '.ollllll', '.olLLLLL', '.oLLLLLL',
      '..oLLLLL', '..oL..LL', '..oo..oL', '.......o',
    ],
  },
};

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

function build(defs, key, scale) {
  const def = defs[key];
  return rasterize(mirror(def.half), { scale, palette: def.palette });
}

export const MOB_KEYS = Object.keys(MOBS);
export const CHAMPION_KEYS = Object.keys(CHAMPIONS);

export const mobSprite = (key, scale = 2) => sprite(`mob:${key}:${scale}`, () => build(MOBS, key, scale));
export const championSprite = (key, scale = 2) => sprite(`champ:${key}:${scale}`, () => build(CHAMPIONS, key, scale));

/** The dominant colour of a creature, used for its death burst and glow. */
export const MOB_TINT = {
  slime: '#6fd66a', bat: '#8a6bd6', skeleton: '#e4dfcd', brute: '#7a9a3c',
  wisp: '#8ef0ff', imp: '#e0503c', spider: '#a05bff', shade: '#c08bff', hound: '#ff7a3c',
  golem: '#8d8a7e', slimeking: '#5ad0a0', skullmage: '#c08bff', broodmother: '#ff4d5e',
  treant: '#4f9a3c', wraithlord: '#7ff0ff',
};
