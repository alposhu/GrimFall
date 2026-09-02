// ---------------------------------------------------------------------------
// items.js — icons for the things the market sells.
//
// The shop used to borrow weapon and passive icons, which meant Bladeoil and
// the Whetstone both showed a sword and a Wax Effigy showed a heart. A shop
// only works if you can tell the shelf apart at a glance, so each good gets
// its own 16x16.
//
// The families are colour-coded the way icon sheets always are — glassware for
// anything drunk, steel for anything Oswin works on, gold for anything the
// Coinweigher touches — so you can read the category before you read the icon.
// ---------------------------------------------------------------------------

import { rasterize, sprite } from './pixel.js';
import { rtpIcon } from './rtp.js';

// Shared palette. Keys are consistent across every icon so a colour always
// means the same material:
//   o outline   g glass      G glass light   l liquid      L liquid light
//   m metal     M metal light  w wood        W wood light  k gold
//   K gold light  r red        R red light   c cloth       C cloth light
//   b bone/pale  s stone       S stone light
const PAL = {
  o: '#1a1119',
  g: '#7fa8c4', G: '#c9e4f2',
  m: '#8b93a8', M: '#dfe6f2',
  w: '#7a5334', W: '#a87a4a',
  k: '#c9a45c', K: '#ffd75e',
  r: '#c2431a', R: '#ff8a5e',
  c: '#8f2f2a', C: '#d96a5a',
  b: '#e8dcc0', S: '#9a9088', s: '#5f5654',
  e: '#3f7d5a', E: '#7fe05a',
  v: '#6b3f9a', V: '#b76bff',
};

// Every map is 16 wide and 16 tall.
const ICONS = {
  // --- Marta: anything drunk ------------------------------------------------
  draught: [                       // a full flask, corked
    '......oooo......',
    '......oWWo......',
    '......oWWo......',
    '.....ooggoo.....',
    '....oggGGggo....',
    '...oggGGGGggo...',
    '...ogGllllGgo...',
    '..ogGllLLllGgo..',
    '..ogllLLLLllgo..',
    '..oglLLLLLLlgo..',
    '..oglLLLLLLlgo..',
    '..ogllLLLLllgo..',
    '...oglllllgo....',
    '...oogggggoo....',
    '.....ooooo......',
    '................',
  ],
  phial: [                         // squat, heavy, stoppered
    '.....oooo.......',
    '.....oWWo.......',
    '....ooggoo......',
    '....ogGGgo......',
    '...oggGGggo.....',
    '..oggllllggo....',
    '..ogllLLllgo....',
    '.oglLLLLLLlgo...',
    '.oglLLLLLLlgo...',
    '.ogllLLLLllgo...',
    '.ogllllllllgo...',
    '..oglllllllgo...',
    '..ooggggggoo....',
    '....oooooo......',
    '................',
    '................',
  ],
  oilcan: [                        // a spouted oil vessel
    '................',
    '.........ooo....',
    '........okKo....',
    '.......okKo.....',
    '..oooookKo......',
    '.omMMMMMko......',
    'omMMMMMMMmo.....',
    'omMmmmmmMmo.....',
    'omMmLLLmMmo.....',
    'omMmLLLmMmo.....',
    'omMmmmmmMmo.....',
    '.omMMMMMmo......',
    '..ooooooo.......',
    '................',
    '................',
    '................',
  ],
  bread: [                         // a hot meal
    '................',
    '....oooooo......',
    '..ookWWWWkoo....',
    '.okWWWWWWWWko...',
    'okWWWbbbbWWWko..',
    'okWbbWWWWbbWko..',
    'okWbWWWWWWbWko..',
    'okWbWWWWWWbWko..',
    'okWbbWWWWbbWko..',
    'okWWWbbbbWWWko..',
    '.okWWWWWWWWko...',
    '..ookWWWWkoo....',
    '....oooooo......',
    '................',
    '................',
    '................',
  ],
  herb: [                          // root tonic: a bundle of leaves
    '................',
    '.......oo.......',
    '......oEEo......',
    '.oo..oEEEEo..oo.',
    'oEEooEEeeEEooEEo',
    'oEeEEEeeeeEEEeEo',
    '.oEEeeeeeeeeEEo.',
    '..oEeeeeeeeeEo..',
    '...oeeeeeeeeo...',
    '....oeeeeeeo....',
    '.....owwwwo.....',
    '.....owwwwo.....',
    '......owwo......',
    '......oooo......',
    '................',
    '................',
  ],

  // --- Oswin: anything worked in steel -------------------------------------
  whetstone: [                     // a stone with a blade laid across it
    '................',
    '..........oo....',
    '.........oMMo...',
    '........oMMo....',
    '.......oMMo.....',
    '......oMMo......',
    '.....oMMo.......',
    '....owwo........',
    '..oosssoo.......',
    '.osSSSSSso......',
    'osSSSSSSSSo.....',
    'osSSSSSSSSo.....',
    '.osssssssso.....',
    '..oooooooo......',
    '................',
    '................',
  ],
  anvil: [                         // a commission
    '................',
    '................',
    '..oooooooooo....',
    '.omMMMMMMMMmo...',
    'omMMMMMMMMMMmo..',
    'omMMmmmmmmMMmo..',
    '.ommo....ommo...',
    '..omo....omo....',
    '...ommmmmmo.....',
    '...omMMMMmo.....',
    '..ommMMMMmmo....',
    '.ommMMMMMMmmo...',
    '.omMMMMMMMMmo...',
    '.oooooooooooo...',
    '................',
    '................',
  ],
  plate: [                         // tempered plate
    '................',
    '...oooooooo.....',
    '..omMMMMMMmo....',
    '.omMMMMMMMMmo...',
    'omMMMmmmmMMMmo..',
    'omMMmMMMMmMMmo..',
    'omMMmMMMMmMMmo..',
    'omMMMmmmmMMMmo..',
    'omMMMMMMMMMMmo..',
    '.omMMMMMMMMmo...',
    '.omMMMMMMMMmo...',
    '..omMMMMMMmo....',
    '...ommMMmmo.....',
    '....oommoo......',
    '......oo........',
    '................',
  ],
  spring: [                        // clockwork spring
    '................',
    '....oooooo......',
    '..ookMMMMkoo....',
    '.okMoooooMko....',
    'okMoooooooMko...',
    'okMookkkooMko...',
    'okMokMMMkoMko...',
    'okMokMokMoMko...',
    'okMokMokMoMko...',
    'okMookMMkoMko...',
    'okMoookkooMko...',
    '.okMoooooMko....',
    '..ookMMMMkoo....',
    '....oooooo......',
    '................',
    '................',
  ],
  boots: [                         // roadworn boots
    '................',
    '..oo......oo....',
    '.owWo....owWo...',
    '.owWo....owWo...',
    '.owWo....owWo...',
    '.owWo....owWo...',
    '.owWo....owWo...',
    '.owWWoo..owWWoo.',
    '.owWWWWo.owWWWWo',
    '.osWWWWo.osWWWWo',
    '.ossssso.osssss.',
    '.oooooooooooooo.',
    '................',
    '................',
    '................',
    '................',
  ],

  // --- The Coinweigher: anything gilded -------------------------------------
  dice: [                          // second thoughts: a reroll
    '................',
    '...oooooooo.....',
    '..obbbbbbbbo....',
    '.obbboobbbbbo...',
    'obbboooobbbbbo..',
    'obbboooobbbbbo..',
    'obbbboobbobbbo..',
    'obbbbbbboobbbo..',
    'obbobbbbbbbbbo..',
    'obboobbbbbbbbo..',
    'obboobbboobbbo..',
    '.obbbbbboobbo...',
    '..obbbbbbbbo....',
    '...oooooooo.....',
    '................',
    '................',
  ],
  ledger: [                        // struck from the ledger: a banish
    '................',
    '..oooooooooo....',
    '.obbbbbbbbbbo...',
    '.obwwwwwwwwbo...',
    '.obwbbbbbbwbo...',
    '.obwbrrrrbwbo...',
    '.obwbbbbbbwbo...',
    '.obwbbrrbbwbo...',
    '.obwbrrrrbwbo...',
    '.obwbbbbbbwbo...',
    '.obwwwwwwwwbo...',
    '.obbbbbbbbbbo...',
    '..oooooooooo....',
    '................',
    '................',
    '................',
  ],
  charm: [                         // weighted charm on a cord
    '.......oo.......',
    '......okko......',
    '.....okKKko.....',
    '....okKooKko....',
    '...okKo..oKko...',
    '..okKo....oKko..',
    '..okKo....oKko..',
    '..okKKooooKKko..',
    '..okKKKKKKKKko..',
    '...okKKKKKKko...',
    '....okKKKKko....',
    '.....okKKko.....',
    '......okko......',
    '.......oo.......',
    '................',
    '................',
  ],
  lodestone: [                     // a magnet
    '................',
    '..oooo....oooo..',
    '.orRRo....orRRo.',
    '.orRRo....orRRo.',
    '.orRRo....orRRo.',
    '.orRRoooooorRRo.',
    '.orRRRRRRRRRRRo.',
    '.orRRRRRRRRRRRo.',
    '.oorRRRRRRRRoo..',
    '..oorRRRRRRoo...',
    '....oorRRoo.....',
    '......oooo......',
    '................',
    '................',
    '................',
    '................',
  ],
  purse: [                         // a favourable tithe
    '................',
    '......oooo......',
    '.....owwwwo.....',
    '....oowwwwoo....',
    '...okKKKKKKko...',
    '..okKKKKKKKKko..',
    '.okKKKkkkKKKKko.',
    '.okKKkKKKkKKKko.',
    '.okKKkKKKkKKKko.',
    '.okKKKkkkKKKKko.',
    '.okKKKKKKKKKKko.',
    '..okKKKKKKKKko..',
    '...ookKKKKkoo...',
    '.....oooooo.....',
    '................',
    '................',
  ],
  effigy: [                        // a wax effigy: death happens to it instead
    '.......oo.......',
    '......obbo......',
    '.....obbbbo.....',
    '.....obobbo.....',
    '.....obbbbo.....',
    '..ooooobboooo...',
    '.obbbbbbbbbbbo..',
    'obbbbbbbbbbbbbo.',
    '.obbbbbbbbbbbo..',
    '..oooobbbboooo..',
    '.....obbbbo.....',
    '.....obbbbo.....',
    '....obbooobo....',
    '....oboo.oobo...',
    '....oo....oo....',
    '................',
  ],
};

export const ITEM_ICONS = Object.keys(ICONS);

/**
 * The icon for a good. Prefers the RPG Maker MZ icon when its atlas has
 * decoded — those are the shapes these pixel maps were drawn from, so the
 * two are interchangeable — and falls back to the drawn one otherwise.
 * `scale` is in units of the 11px drawn icon; the sheeted icon is matched to
 * that size rather than to its own 32px grid.
 */
export function itemIcon(name, scale = 2) {
  const sheeted = rtpIcon(name, Math.round(11 * scale));
  if (sheeted) return sheeted;
  return sprite(`item:${name}:${scale}`, () => {
    const map = ICONS[name] || ICONS.draught;
    return rasterize(map, { scale, palette: PAL });
  });
}

/** Shop good id -> icon. Anything unmapped falls back to a flask. */
export const GOOD_ICONS = {
  // Marta
  mend: 'draught',
  feast: 'bread',
  tonic: 'herb',
  flask_heal: 'draught',
  flask_stone: 'phial',
  flask_swift: 'oilcan',
  // Oswin
  whet: 'whetstone',
  commission: 'anvil',
  temper: 'plate',
  oil: 'oilcan',
  spring: 'spring',
  boots: 'boots',
  // The Coinweigher
  reroll: 'dice',
  banish: 'ledger',
  charm: 'charm',
  lodestone: 'lodestone',
  tithe: 'purse',
  effigy: 'effigy',
};

export const iconForGood = (id) => GOOD_ICONS[id] || 'draught';

/**
 * The picture for a shop good — the one thing that should look like the thing
 * you are buying.
 *
 * The sheeted icons are keyed by the good's own id, so every good has its own:
 * a Whetstone is a smith's hammer, a Commission is a sword, a Clockwork Spring
 * is an hourglass, a Wax Effigy is a doll. The code-drawn fallback has fewer
 * pictures than there are goods and lets a few share — a Lesser Draught and a
 * Draught of Waking are both a flask there — which is fine, because it only
 * ever draws when the atlas has not decoded.
 */
export function goodIcon(id, scale = 2) {
  const sheeted = rtpIcon(id, Math.round(11 * scale));
  return sheeted || itemIcon(iconForGood(id), scale);
}
