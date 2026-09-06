// ---------------------------------------------------------------------------
// dice.js — Sovereign's Dice, the game played at Old Ren's table.
//
// WHY DICE, AND WHY THESE RULES.
//
// A lobby minigame has an unusual job: it has to be worth doing for five
// minutes while somebody's friend finds their headphones, and worth ABANDONING
// the instant they do. That rules out anything with a board state to lose, or a
// round that takes longer than the wait it is filling.
//
// So: five dice, one re-roll, highest total wins. It is over in twenty seconds,
// it has exactly one decision in it — which dice to keep — and that decision is
// real enough to argue about, because keeping a 4 is a genuine coin-flip and
// everybody at the table has an opinion. Nothing is staked and nothing is
// carried out of the room. Losing costs you the twenty seconds you were going
// to spend waiting anyway.
//
// It works alone because Old Ren plays it with you, by the same rules and with
// the same dice, and he is not cheating — his strategy is written down below
// and it is a middling one.
//
// WHY THE LOGIC IS IN HERE AND NOT IN THE SCREEN.
//
// This module has no DOM in it, no network in it, and no idea whether anybody
// else is playing. It is the rules, and it is the part worth testing: that a
// re-roll only ever replaces what it was asked to, that scoring is what it says
// it is, and that ties are resolved rather than silently dropped. The screen
// (src/ui/dice.js) and the wire (GAME.DICE) are both built on top of this.
// ---------------------------------------------------------------------------

import { makeRng } from '../core/util.js';

export const DICE = 5;
export const FACES = 6;

/** How the table is playing: alone against Ren, or with everybody present. */
export const SOLO = 'solo';
export const TABLE = 'table';

/**
 * A round in progress.
 *
 * `hands` is keyed by player id — 'me' for the local player, 'ren' for the
 * house, and the network ids of anybody else at the table. One shape for all
 * three so nothing downstream has to ask who a hand belongs to.
 */
export function newRound(seed = Date.now()) {
  return {
    seed,
    rng: makeRng(seed >>> 0),
    phase: 'rolling',        // 'rolling' | 'keeping' | 'done'
    hands: {},
    order: [],
    winner: null,
  };
}

function rollDie(round) {
  return 1 + Math.floor(round.rng() * FACES);
}

/** Somebody's opening throw. */
export function roll(round, id, name) {
  const dice = Array.from({ length: DICE }, () => rollDie(round));
  round.hands[id] = { id, name, dice, keep: dice.map(() => false), rerolled: false, done: false };
  if (!round.order.includes(id)) round.order.push(id);
  return round.hands[id];
}

/** Toggle whether one die is kept through the re-roll. */
export function keep(round, id, index) {
  const hand = round.hands[id];
  if (!hand || hand.rerolled) return;
  hand.keep[index] = !hand.keep[index];
}

/**
 * The one re-roll.
 *
 * Only the dice NOT marked keep are replaced, and only once — `rerolled` is the
 * whole of the rule, and it is checked here rather than trusted from the caller
 * so a screen that forgets to disable its own button cannot hand somebody a
 * third throw.
 */
export function reroll(round, id) {
  const hand = round.hands[id];
  if (!hand || hand.rerolled) return hand;
  hand.dice = hand.dice.map((d, i) => (hand.keep[i] ? d : rollDie(round)));
  hand.rerolled = true;
  return hand;
}

/** Stand on what you have. */
export function stand(round, id) {
  const hand = round.hands[id];
  if (hand) hand.done = true;
  return hand;
}

export const total = (hand) => hand.dice.reduce((n, d) => n + d, 0);

/**
 * Ren's strategy, and the house's whole personality.
 *
 * He keeps fives and sixes and throws the rest. That is a real strategy — the
 * expected value of a die is 3.5, so re-rolling anything below 4 is correct —
 * and it is also a beatable one, because he never varies it and never presses
 * an advantage. He is meant to be somebody you can beat on a good night.
 */
export function playRen(round) {
  const hand = round.hands.ren || roll(round, 'ren', 'Old Ren');
  hand.dice.forEach((d, i) => { hand.keep[i] = d >= 5; });
  reroll(round, 'ren');
  hand.done = true;
  return hand;
}

/**
 * Who won.
 *
 * A draw is a draw and is reported as one, rather than being broken by
 * whoever's id sorts first — the table can see the numbers, and inventing a
 * winner they can all count for themselves is worse than saying nobody won.
 */
export function settle(round) {
  const hands = round.order.map((id) => round.hands[id]).filter(Boolean);
  if (!hands.length) return null;
  const best = Math.max(...hands.map(total));
  const top = hands.filter((h) => total(h) === best);
  round.phase = 'done';
  round.winner = top.length === 1
    ? { kind: 'win', hand: top[0], score: best }
    : { kind: 'draw', hands: top, score: best };
  return round.winner;
}

/** Has everybody at the table finished throwing? */
export const everybodyDone = (round) =>
  round.order.length > 0 && round.order.every((id) => round.hands[id]?.done);

/** The shape sent over the wire when a hand is finished. */
export const handToWire = (hand) => ({ dice: hand.dice, name: hand.name });

/** And the shape rebuilt from it. A remote hand is never re-rolled locally. */
export function handFromWire(round, id, wire) {
  round.hands[id] = {
    id, name: wire.name, dice: wire.dice,
    keep: wire.dice.map(() => true), rerolled: true, done: true,
  };
  if (!round.order.includes(id)) round.order.push(id);
  return round.hands[id];
}
