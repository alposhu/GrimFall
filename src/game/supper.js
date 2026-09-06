// ---------------------------------------------------------------------------
// supper.js — the Supper Rush, Marta's kitchen behind the bar.
//
// WHY THIS ONE, AND WHY IT IS THE ODD ONE OUT.
//
// The inn already had three games and they were all COMPETITIVE — dice, cups
// and the board all end with one name above the others. That is a fine thing to
// have three of and a poor thing to have four of, because a party waiting to go
// out together does not always want to be beaten by each other first.
//
// So this one is shared. One queue of tickets, one score, one shift. You lose
// together and the number at the end belongs to the room. It is also the only
// game here that gets genuinely EASIER with more people, which is the honest
// shape for a co-op lobby: a thing you are all better at together.
//
// It asks for a fourth skill, too. Dice is luck with a decision, cups is
// observation, the board is reflex; this is SEQUENCE UNDER PRESSURE. The recipe
// is right there on the ticket — nothing is memorised — and it is still hard,
// because four tickets are counting down while you read one.
//
// THE PRESSURE COMES FROM THE QUEUE, NOT FROM THE CLOCK.
//
// A single timer would make this a race against a number. Instead every ticket
// carries its own, they arrive faster as the shift goes on, and the rail only
// holds so many — so the way you lose is that the rail fills while you are
// halfway through something, which is exactly how a real kitchen goes wrong and
// it is far more interesting than a bar emptying.
//
// COLLISIONS ARE THE CO-OP.
//
// Two cooks reaching for the same ticket is the whole social problem, so a
// ticket is CLAIMED when somebody starts it and everyone else sees the claim.
// Splitting the rail is a thing the players do by talking, not a thing the game
// does for them.
// ---------------------------------------------------------------------------

import { makeRng } from '../core/util.js';

/** What is to hand. Each is a prop the inn actually has on a shelf somewhere. */
export const STATIONS = [
  { id: 'bread', name: 'Bread', prop: 'breadboard' },
  { id: 'greens', name: 'Greens', prop: 'greens' },
  { id: 'meat', name: 'Meat', prop: 'roast' },
  { id: 'fish', name: 'Fish', prop: 'shellfish' },
  { id: 'pot', name: 'The Pot', prop: 'stewpot' },
  { id: 'sweet', name: 'Sweet', prop: 'sweets' },
];

/**
 * The book. Three tiers, and the tier is the length.
 *
 * `seconds` is what a ticket starts with before the shift's own pressure is
 * applied. Longer recipes get proportionally more time than short ones but not
 * enough more — a four-step dish is meant to be the one you are still holding
 * when the rail fills.
 */
export const DISHES = [
  { id: 'dripping', name: 'Bread and Dripping', steps: ['bread', 'meat'], seconds: 13 },
  { id: 'coldcuts', name: 'Cold Cuts', steps: ['meat', 'greens'], seconds: 13 },
  { id: 'fishsupper', name: 'Fish Supper', steps: ['fish', 'bread'], seconds: 13 },
  { id: 'honeycake', name: 'Honey Cake', steps: ['sweet', 'bread'], seconds: 13 },

  { id: 'hunters', name: "Hunter's Stew", steps: ['pot', 'meat', 'greens'], seconds: 18 },
  { id: 'pie', name: "Sovereign's Pie", steps: ['bread', 'meat', 'pot'], seconds: 18 },
  { id: 'harvest', name: 'Harvest Plate', steps: ['greens', 'bread', 'sweet'], seconds: 18 },
  { id: 'chowder', name: 'River Chowder', steps: ['pot', 'fish', 'greens'], seconds: 18 },

  { id: 'longtable', name: 'The Long Table', steps: ['meat', 'greens', 'pot', 'bread'], seconds: 24 },
  { id: 'feast', name: 'Feast Board', steps: ['fish', 'meat', 'sweet', 'bread'], seconds: 24 },
  { id: 'martas', name: "Marta's Own", steps: ['pot', 'greens', 'fish', 'sweet'], seconds: 24 },
];

/** How many tickets can hang on the rail before the shift falls apart. */
export const RAIL = 5;

/** How many can be lost before Marta sends you out. */
export const LIVES = 3;

/**
 * How long a service runs.
 *
 * A shift has to END. Without a clock, a cook who never makes a mistake never
 * loses a ticket and the kitchen runs forever — which is both an unbounded way
 * to earn and a game you can only leave by deliberately failing, and the second
 * is the worse of the two. Ninety seconds is long enough for the pressure curve
 * to arrive and short enough to fit the wait it exists to fill.
 */
export const SHIFT_SECONDS = 90;

/**
 * How hard the shift is, `served` dishes in.
 *
 * Both curves flatten rather than running away: a shift should become
 * unsurvivable, not instantly impossible, and a player who is good enough to
 * reach the floor deserves to sit at the floor for a while rather than hitting
 * a wall.
 */
export function pressure(served, cooks = 1) {
  return {
    // Seconds between tickets. The floor is the whole difficulty: it has to end
    // up FASTER than a good cook can serve, or the kitchen never fills, every
    // skill level serves exactly as many dishes as were written, and the game
    // stops being about how well you cook.
    //
    // Divided by the number of cooks, so a kitchen of four is four times as
    // busy rather than four people watching one person work. Without this the
    // supply is fixed, the share falls with every friend who joins, and the
    // best thing you can do for your own purse is play alone — which is the
    // wrong incentive for the one co-operative game in the building.
    every: Math.max(1.45, 4.7 - served * 0.18) / Math.max(1, cooks),
    // How much of a ticket's written time it actually gets.
    patience: Math.max(0.58, 1 - served * 0.017),
    // Which tiers are in play. The book opens up as the night goes on.
    tiers: served < 4 ? 1 : served < 12 ? 2 : 3,
  };
}

/** The rail grows with the kitchen, or four cooks share one person's counter. */
export const railFor = (cooks) => RAIL + Math.min(3, Math.max(0, cooks - 1));

export function newShift(seed = Date.now(), cooks = 1) {
  return {
    seed: seed >>> 0,
    n: 0,                    // how many tickets have ever been written
    cooks: Math.max(1, cooks),
    tickets: [],
    served: 0,
    lost: 0,
    spoiled: 0,
    score: 0,
    over: false,
    ended: null,             // 'time' | 'lost' — how the service finished
    left: SHIFT_SECONDS,
    since: 0,                // seconds since the last ticket was written
  };
}

/** The next ticket, chosen from whatever tiers are open. */
export function writeTicket(shift) {
  const p = pressure(shift.served, shift.cooks);
  const rng = makeRng((shift.seed + shift.n * 6151) >>> 0);
  const open = DISHES.filter((d) => d.steps.length <= p.tiers + 1);
  const dish = open[Math.floor(rng() * open.length)] || DISHES[0];
  const life = dish.seconds * p.patience;

  const ticket = {
    key: `t${shift.n}`,
    dish: dish.id,
    name: dish.name,
    steps: dish.steps.slice(),
    done: 0,                 // how many steps are in
    life,
    left: life,
    claimedBy: null,
  };
  shift.n += 1;
  shift.tickets.push(ticket);
  return ticket;
}

export const ticketAt = (shift, key) => shift.tickets.find((t) => t.key === key) || null;

/**
 * Say you are cooking this one.
 *
 * A ticket somebody else has started cannot be taken — that is the whole of the
 * collision rule, and it lives here rather than in a greyed-out button so a
 * message arriving from another cook settles it the same way a local tap does.
 */
export function claim(shift, key, who = 'me') {
  const t = ticketAt(shift, key);
  if (!t || (t.claimedBy && t.claimedBy !== who)) return null;
  t.claimedBy = who;
  return t;
}

export function release(shift, key, who = 'me') {
  const t = ticketAt(shift, key);
  if (t && t.claimedBy === who) t.claimedBy = null;
  return t;
}

/** What a finished ticket is worth, given how much of its life was left. */
export function ticketScore(ticket) {
  const base = ticket.steps.length * 10;
  // Up to half again for speed. Serving with most of the clock left is the only
  // way to a high score, so the game rewards being fast rather than merely
  // being not-late.
  const spare = Math.max(0, ticket.left) / ticket.life;
  return Math.round(base * (1 + spare * 0.5));
}

/**
 * Put an ingredient into a ticket.
 *
 * Returns 'step', 'served', 'spoiled' or null. A wrong ingredient throws the
 * whole dish out and it starts again from nothing — a penalty in time rather
 * than in score, which keeps the pressure on the rail where it belongs.
 */
export function useStation(shift, key, stationId, who = 'me') {
  const t = ticketAt(shift, key);
  if (!t || shift.over) return null;
  if (t.claimedBy && t.claimedBy !== who) return null;
  t.claimedBy = who;

  if (t.steps[t.done] !== stationId) {
    t.done = 0;
    shift.spoiled += 1;
    return 'spoiled';
  }

  t.done += 1;
  if (t.done < t.steps.length) return 'step';

  shift.score += ticketScore(t);
  shift.served += 1;
  shift.tickets = shift.tickets.filter((x) => x !== t);
  return 'served';
}

/**
 * Time passing.
 *
 * Returns what happened, so the screen can react without re-deriving it:
 * { wrote, expired[], over }.
 */
export function tick(shift, dt) {
  if (shift.over) return { wrote: null, expired: [], over: true };
  const p = pressure(shift.served, shift.cooks);
  const expired = [];

  shift.left -= dt;
  for (const t of shift.tickets) t.left -= dt;
  for (const t of shift.tickets.filter((x) => x.left <= 0)) expired.push(t);
  if (expired.length) {
    shift.tickets = shift.tickets.filter((t) => t.left > 0);
    shift.lost += expired.length;
  }

  let wrote = null;
  shift.since += dt;
  // The rail is the pressure. Once it is full nothing new arrives, so a room
  // that is drowning is not also being buried — they simply lose the ones they
  // are already holding.
  // Nothing new in the last stretch: a ticket written with four seconds left is
  // a ticket nobody can serve, and losing a life to the closing bell is the
  // cheapest kind of unfair.
  const stillWriting = shift.left > 6;
  if (stillWriting && shift.since >= p.every && shift.tickets.length < railFor(shift.cooks)) {
    shift.since = 0;
    wrote = writeTicket(shift);
  }

  // Losing beats the clock: a kitchen that fell apart with two seconds left
  // fell apart, and reporting it as "time" would be a kinder lie than the game
  // needs to tell.
  if (shift.lost >= LIVES) { shift.over = true; shift.ended = 'lost'; }
  else if (shift.left <= 0) { shift.over = true; shift.ended = 'time'; shift.left = 0; }
  return { wrote, expired, over: shift.over };
}

/**
 * What the shift pays.
 *
 * Divided by the number of cooks. Four people serving together earn what one
 * person serving that much would, split — otherwise the correct way to use the
 * kitchen would be to fill it with idle friends, and a co-op game whose best
 * strategy is bringing spectators is a broken one.
 */
export function prize(shift) {
  const each = shift.score / Math.max(1, shift.cooks);
  return Math.min(25, Math.floor(each / 70));
}

/** The shape sent when a kitchen is shared. */
export const toWire = (kind, key, extra = {}) => ({ k: kind, key, ...extra });
