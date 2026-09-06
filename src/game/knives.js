// ---------------------------------------------------------------------------
// knives.js — the Knife Board, on the wall behind Oswin's counter.
//
// A marker sweeps across the board. You press. Where it was when you pressed is
// where the knife goes. Three knives, and the sweep is faster for each one.
//
// WHY THIS ONE.
//
// Dice is luck. Cups is memory. This is REFLEX, and between the three of them
// the inn asks for three different things from a player rather than the same
// thing dressed differently. It is also the only one that can be got perfect —
// a bullseye is a bullseye — which gives it a ceiling worth chasing that the
// other two do not have.
//
// THE SWEEP IS A TRIANGLE WAVE, AND THAT MATTERS.
//
// The marker runs to one edge, turns, and runs back at the same speed. Not a
// sine: a sine slows down at the edges, which makes the edges of the board the
// EASIEST place to hit and the centre the hardest, which is exactly backwards
// for a target with a bullseye in the middle. A constant speed means every part
// of the board is equally hard to hit and the rings alone decide the reward.
//
// SCORING IS BY DISTANCE, NOT BY BAND INDEX.
//
// The board is scored from how far the knife lands from centre, then bucketed.
// That keeps the near-misses honest — 0.11 from centre and 0.09 from centre are
// genuinely different throws and should not both round to "inner ring" — and it
// means the ring widths can be retuned in one table without touching anything
// that reads them.
// ---------------------------------------------------------------------------

export const KNIVES = 3;

/**
 * The board, from the middle out. `to` is the distance from centre, where 1 is
 * the outer edge, so these are proportions rather than pixels and the drawing
 * can be any size.
 */
export const RINGS = [
  { to: 0.08, points: 50, name: 'the pin' },
  { to: 0.22, points: 25, name: 'inner' },
  { to: 0.45, points: 10, name: 'middle' },
  { to: 0.75, points: 5, name: 'outer' },
  { to: 1.00, points: 1, name: 'the boards' },
];

/** How fast the marker sweeps for knife `n`, in full crossings per second. */
export const sweepRate = (n) => 0.55 + n * 0.28;

/**
 * Where the marker is at time `t`, as -1..1 across the board.
 *
 * A triangle wave, folded by hand rather than with a sine — see the note above
 * for why the constant speed is the whole point.
 */
export function markerAt(t, n) {
  const cycle = (t * sweepRate(n)) % 1;
  const up = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2;   // 0..1..0
  return up * 2 - 1;                                      // -1..1
}

/** What a throw landing at `pos` (-1..1) is worth. */
export function scoreAt(pos) {
  const d = Math.min(1, Math.abs(pos));
  for (const ring of RINGS) if (d <= ring.to) return { ...ring, distance: d };
  return { ...RINGS[RINGS.length - 1], distance: d };
}

export function newBoard(name = 'You') {
  return { name, throws: [], done: false };
}

/**
 * Throw the next knife.
 *
 * Refuses once three are in the board. The rule lives here rather than in a
 * disabled button, because a held key repeating is exactly the input that gets
 * past a disabled button.
 */
export function throwKnife(board, pos) {
  if (board.done || board.throws.length >= KNIVES) return null;
  const hit = scoreAt(pos);
  board.throws.push({ pos, ...hit });
  if (board.throws.length >= KNIVES) board.done = true;
  return hit;
}

export const boardTotal = (board) => board.throws.reduce((n, t) => n + t.points, 0);

/** A perfect board — three in the pin — for the prize table to lean on. */
export const PERFECT = KNIVES * RINGS[0].points;

/**
 * What a finished board pays.
 *
 * Deliberately steep at the top. A 150 is three bullseyes in a row against an
 * accelerating sweep, which almost nobody will do, and it should be worth
 * telling somebody about. The floor is zero rather than a consolation coin:
 * paying for a bad board makes every board worth throwing, which is how a skill
 * game turns into a slot machine.
 */
export function prize(total) {
  if (total >= PERFECT) return 40;
  if (total >= 100) return 22;
  if (total >= 75) return 14;
  if (total >= 50) return 8;
  if (total >= 30) return 4;
  return 0;
}

export const toWire = (board) => ({
  name: board.name,
  throws: board.throws.map((t) => ({ pos: t.pos, points: t.points })),
});

export function fromWire(wire) {
  return {
    name: wire.name,
    throws: (wire.throws || []).map((t) => ({ ...scoreAt(t.pos), pos: t.pos, points: t.points })),
    done: true,
  };
}
