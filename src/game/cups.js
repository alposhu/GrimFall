// ---------------------------------------------------------------------------
// cups.js — Three Cups, the game Piet runs on the end of the bar.
//
// A coin goes under one of three cups, the cups swap places a number of times,
// and you say where the coin is. Get it right and the round gets harder; get it
// wrong and you start again.
//
// WHY THIS ONE, NEXT TO DICE.
//
// Dice is luck with one decision in it. This is the opposite and that is the
// point: there is no luck in it at all. The shuffle is fully determined before
// the first cup moves, and a player who tracks it correctly wins every single
// time. What makes it hard is that it gets faster, and what makes it fun is
// that the failure is always YOURS — you lost the cup on swap six, you know you
// lost it, and you want to go again.
//
// THE SHUFFLE IS SEEDED, AND THAT IS THE MULTIPLAYER.
//
// Everyone at the table is handed the same seed, so everyone watches the
// identical shuffle at the identical speed and picks independently. That is a
// genuinely shared moment rather than four people playing solitaire beside each
// other — you can argue about swap six afterwards because it was the same swap
// six. It also means no client has to be trusted with where the coin is: they
// all worked it out from the same list.
//
// THE PAYOUT CURVE.
//
// A streak pays: 2, 5, 9, 14, 20, 27... and it resets to nothing on a miss. The
// shape matters. Flat rewards make the tenth round pointless; runaway rewards
// make the first nine a chore to get through. This curve is worth continuing
// and cheap to lose, which is the feeling the game is for. Everything is capped
// by the house purse regardless — see purse.js.
// ---------------------------------------------------------------------------

import { makeRng } from '../core/util.js';

export const CUPS = 3;

/** How many swaps a round has, and how long each one takes. */
export function roundShape(round) {
  return {
    swaps: 3 + round * 2,
    // Milliseconds per swap, floored so it never becomes unwatchable. Round 8
    // is already at the floor; past that the length is the difficulty.
    speed: Math.max(190, 620 - round * 55),
  };
}

/** What a correct pick is worth at this streak length. */
export function prize(streak) {
  // 2, 5, 9, 14, 20, 27 ... — the gaps grow by one each time.
  const n = Math.max(1, streak);
  return Math.round((n * (n + 3)) / 2);
}

export function newGame(seed = Date.now()) {
  return {
    seed: seed >>> 0,
    round: 0,
    streak: 0,
    best: 0,
    won: 0,
    phase: 'ready',        // 'ready' | 'peek' | 'shuffling' | 'choose' | 'reveal'
    swaps: [],
    start: 0,
    coin: 0,
    picked: -1,
    correct: false,
  };
}

/**
 * Deal the next round.
 *
 * The whole shuffle is decided here, before anything moves. That is what makes
 * it honest: the answer exists from the first frame and the cups only reveal
 * it. A shuffle that decided where the coin was at the END could be made
 * unwinnable, and players can feel that even when they cannot prove it.
 */
export function deal(game) {
  const shape = roundShape(game.round);
  // The seed advances with the round, so a table replaying round 3 sees the
  // same round 3 and a new game does not repeat the last one.
  const rng = makeRng((game.seed + game.round * 7919) >>> 0);

  game.start = Math.floor(rng() * CUPS);
  game.swaps = [];
  let last = -1;
  for (let i = 0; i < shape.swaps; i++) {
    // Never the same pair twice running: it reads as the cups jittering rather
    // than swapping, and it is a free swap for anyone tracking.
    let a = 0, b = 0, key = 0;
    do {
      a = Math.floor(rng() * CUPS);
      b = (a + 1 + Math.floor(rng() * (CUPS - 1))) % CUPS;
      key = Math.min(a, b) * CUPS + Math.max(a, b);
    } while (key === last);
    last = key;
    game.swaps.push([a, b]);
  }
  game.coin = resolve(game.start, game.swaps);
  game.phase = 'peek';
  game.picked = -1;
  game.correct = false;
  return shape;
}

/** Follow the coin through the swaps. The one piece of arithmetic in the game. */
export function resolve(start, swaps) {
  let at = start;
  for (const [a, b] of swaps) {
    if (at === a) at = b;
    else if (at === b) at = a;
  }
  return at;
}

/** Where the coin is after the first `n` swaps — for drawing it mid-shuffle. */
export const resolveTo = (start, swaps, n) => resolve(start, swaps.slice(0, n));

/**
 * Say where it is.
 *
 * Returns { correct, streak, prize } — the prize is what the round is WORTH,
 * not what was paid. The house may not have it; purse.js decides that and the
 * screen shows what actually arrived.
 */
export function pick(game, cup) {
  if (game.phase !== 'choose') return null;
  game.picked = cup;
  game.correct = cup === game.coin;
  game.phase = 'reveal';

  if (game.correct) {
    game.streak += 1;
    game.won += 1;
    game.best = Math.max(game.best, game.streak);
    game.round += 1;
    return { correct: true, streak: game.streak, prize: prize(game.streak) };
  }
  game.streak = 0;
  game.round = 0;
  return { correct: false, streak: 0, prize: 0 };
}

/** The shape sent when a table plays together. */
export const toWire = (game) => ({ round: game.round, streak: game.streak, best: game.best });
