// ---------------------------------------------------------------------------
// inn.js — the Hearthhall's structure, drawn in code.
//
// WHY THESE ARE NOT RPG MAKER TILES.
//
// The furniture in the inn is RTP and should be: a barrel is a barrel and
// somebody drew a very good one. But the STRUCTURE is different. A great hall
// needs timber posts marching down it at a rhythm, a door that opens, and
// lanterns that sit where the light needs to come from — and all three of those
// have to answer to the layout rather than to whatever a tileset happened to
// ship. A post that cannot change height is a post the hall has to be built
// around.
//
// They are also the parts most responsible for the room reading as ARCHITECTURE
// instead of as furniture on a floor. Real halls are legible because of their
// verticals: the eye picks up the repeat of the posts and reads the length of
// the room from it. That is worth thirty lines of pixel map.
//
// Drawn with the same `rasterize` the bestiary uses, so they are cached, they
// re-render at a new scale on a settings change, and they cost no fetch.
// ---------------------------------------------------------------------------

import { rasterize, sprite } from './pixel.js';

/**
 * A timber post. Oak, lit from the upper left like everything else in the room.
 *
 * Two tiles tall and drawn to be stood in FRONT of — the base is at the bottom
 * of the map, so it sorts against people the same way a bookcase does.
 */
const POST = [
  '..hhhhhhhhhh..',
  '.hmmmmmmmmmmh.',
  '.hmllllllmmmh.',
  '.hmllllllmmmh.',
  '..MMMMMMMMMM..',
  '..lmmmmmmmmM..',
  '..lmmddmmmmM..',
  '..lmmddmmmmM..',
  '..lmmmmmmmmM..',
  '..lmmmmmmmmM..',
  '..lmmddmmmmM..',
  '..lmmddmmmmM..',
  '..lmmmmmmmmM..',
  '..lmmmmmmmmM..',
  '..lmmmmmmmmM..',
  '..lmmmmmmmmM..',
  '..lmmmmmmmmM..',
  '..lmmmmmmmmM..',
  '..lmmmmmmmmM..',
  '..lmmmmmmmmM..',
  '.hmmmmmmmmmmh.',
  '.hmllllllmmmh.',
  '.hMMMMMMMMMMh.',
  '..dddddddddd..',
];

const OAK = {
  l: '#8a6236',       // lit face
  m: '#6d4a26',       // body
  M: '#4a3018',       // shaded side
  d: '#33200f',       // grain and shadow
  h: '#a5794a',       // the cap and base highlight
};

/**
 * The front door, in four frames.
 *
 * A door that simply vanishes when you leave is the cheapest possible exit and
 * it reads as one. Four frames of it swinging inward — and the black of the
 * night behind it widening as it goes — is most of what makes walking out of a
 * building feel like leaving rather than like a screen change.
 *
 * Drawn from ABOVE and slightly in front, the way the rest of the room is: the
 * leaf swings across the opening rather than rotating in place, because a true
 * rotation at this size is four pixels of arc nobody can read.
 */
const DOOR_FRAMES = [
  // shut
  [
    'IIIIIIIIIIIIIIIIIIII',
    'IppppppppppppppppppI',
    'IpwwwwwwwwwwwwwwwwpI',
    'IpwWWwwWWwwWWwwWWwpI',
    'IpwwwwwwwwwwwwwwwwpI',
    'IpwWWwwWWwwWWwwWWwpI',
    'IpwwwwwwwwwwwwwwwwpI',
    'IpwwwwwwwkkwwwwwwwpI',
    'IpwWWwwWWkkWWwwWWwpI',
    'IpwwwwwwwkkwwwwwwwpI',
    'IpwwwwwwwwwwwwwwwwpI',
    'IpwWWwwWWwwWWwwWWwpI',
    'IppppppppppppppppppI',
    'IIIIIIIIIIIIIIIIIIII',
  ],
  // ajar
  [
    'IIIIIIIIIIIIIIIIIIII',
    'InnnnnnppppppppppppI',
    'InnnnnnpwwwwwwwwwwpI',
    'InnnnnnpwWWwwWWwwwpI',
    'InnnnnnpwwwwwwwwwwpI',
    'InnnnnnpwWWwwWWwwwpI',
    'InnnnnnpwwwwwwwwwwpI',
    'InnnnnnpwwwwkkwwwwpI',
    'InnnnnnpwWWwkkWWwwpI',
    'InnnnnnpwwwwkkwwwwpI',
    'InnnnnnpwwwwwwwwwwpI',
    'InnnnnnpwWWwwWWwwwpI',
    'InnnnnnppppppppppppI',
    'IIIIIIIIIIIIIIIIIIII',
  ],
  // wide
  [
    'IIIIIIIIIIIIIIIIIIII',
    'InnnnnnnnnnnnppppppI',
    'InnnnnnnnnnnnpwwwwpI',
    'InnnnnnnnnnnnpwWWwpI',
    'InnnnnnnnnnnnpwwwwpI',
    'InnnnnnnnnnnnpwWWwpI',
    'InnnnnnnnnnnnpwwwwpI',
    'InnnnnnnnnnnnpwwkwpI',
    'InnnnnnnnnnnnpwWkwpI',
    'InnnnnnnnnnnnpwwkwpI',
    'InnnnnnnnnnnnpwwwwpI',
    'InnnnnnnnnnnnpwWWwpI',
    'InnnnnnnnnnnnppppppI',
    'IIIIIIIIIIIIIIIIIIII',
  ],
  // open
  [
    'IIIIIIIIIIIIIIIIIIII',
    'InnnnnnnnnnnnnnnnppI',
    'InnnnnnnnnnnnnnnnpwI',
    'InnnnnnnnnnnnnnnnpwI',
    'InnnnnnnnnnnnnnnnpwI',
    'InnnnnnnnnnnnnnnnpwI',
    'InnnnnnnnnnnnnnnnpwI',
    'InnnnnnnnnnnnnnnnpwI',
    'InnnnnnnnnnnnnnnnpwI',
    'InnnnnnnnnnnnnnnnpwI',
    'InnnnnnnnnnnnnnnnpwI',
    'InnnnnnnnnnnnnnnnpwI',
    'InnnnnnnnnnnnnnnnppI',
    'IIIIIIIIIIIIIIIIIIII',
  ],
];

const DOOR = {
  I: '#2a1c10',       // the frame
  p: '#3f2a15',       // the door's own edge
  w: '#7a5228',       // plank
  W: '#8d5f2f',       // plank highlight
  k: '#3a3a42',       // ironwork
  n: '#0b0910',       // the night outside
};

/**
 * A wall lantern. Small, and mostly an excuse for the light it throws — the
 * lighting pass in hubRender.js reads its position, and this is the thing the
 * player can see hanging there to explain the pool on the floor.
 */
const LANTERN = [
  '...ff...',
  '..fddf..',
  '.fdIIdf.',
  '.fIFFIf.',
  '.fIFFIf.',
  '.fdIIdf.',
  '..fddf..',
  '...dd...',
];

const LANTERN_PAL = {
  f: '#3a3a42',
  d: '#22222a',
  I: '#ffd75e',
  F: '#fff3c4',
};

export const postSprite = (scale = 4) =>
  sprite(`inn:post:${scale}`, () => rasterize(POST, { scale, palette: OAK }));

export const doorSprite = (frame = 0, scale = 4) =>
  sprite(`inn:door:${frame}:${scale}`, () =>
    rasterize(DOOR_FRAMES[Math.max(0, Math.min(DOOR_FRAMES.length - 1, frame))],
      { scale, palette: DOOR }));

export const lanternSprite = (scale = 4) =>
  sprite(`inn:lantern:${scale}`, () => rasterize(LANTERN, { scale, palette: LANTERN_PAL }));

export const DOOR_FRAME_COUNT = DOOR_FRAMES.length;
