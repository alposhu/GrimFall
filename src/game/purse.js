// ---------------------------------------------------------------------------
// purse.js — the house purse, and why the games in the inn cannot be farmed.
//
// THE PROBLEM, STATED PLAINLY.
//
// The moment a lobby minigame pays real gold, it is competing with the game it
// is a lobby for. If dice pays better per minute than a run does, the correct
// way to play Grimfall becomes "sit in the inn throwing dice", and the correct
// way is boring. That is not a balance problem to be tuned later; it is the
// whole design of the feature, and getting it wrong quietly ruins the economy
// the Sanctuary is built on — where a single upgrade tier runs from 50 to 850
// gold and a full board costs several thousand.
//
// THE ANSWER.
//
// The inn has only so much coin. A purse that refills slowly in REAL time, is
// capped, and is drawn down by every payout. When it is empty the games still
// play — you are told the house is out, and the NPCs say so — but they pay
// nothing.
//
// That gives a hard ceiling on what the lobby can ever be worth per day, and it
// is a ceiling with a reason in the fiction rather than an arbitrary "you have
// played enough" message. It also means skill is still rewarded inside the cap:
// a good player empties the purse faster, they do not empty a bigger one.
//
// WAGERS ARE NOT PAYOUTS.
//
// Gold staked between players is their own, moving sideways. It never touches
// the purse and never creates a coin. Only the HOUSE covering a bet, or a skill
// game paying a prize, draws on it. That distinction is the reason a table of
// four can play all night without inflating anything.
// ---------------------------------------------------------------------------

import * as store from '../core/storage.js';

/** The most the inn will ever hold. Roughly one cheap Sanctuary tier. */
export const PURSE_CAP = 120;

/** How fast it fills back up: the cap, over about half a day. */
export const PURSE_PER_HOUR = 10;

const HOUR = 3600 * 1000;

/**
 * Bring the purse up to date, then hand it back.
 *
 * Refilled lazily on read rather than on a timer: a lobby that is not open is
 * not running any timers, and the player is as likely to come back in three
 * days as in three minutes. The clock that matters is the wall clock.
 *
 * A clock that has gone BACKWARDS — a device whose time was wrong and got
 * corrected, or a save carried to another machine — is treated as no time
 * passing rather than as a negative refill. It costs an honest player nothing
 * and it stops a wrong clock emptying the purse.
 */
export function purse() {
  const meta = store.meta();
  const now = Date.now();
  if (!meta.purse || typeof meta.purse !== 'object') {
    meta.purse = { coin: PURSE_CAP, at: now };
    store.save();
    return meta.purse;
  }
  const elapsed = Math.max(0, now - (meta.purse.at || now));
  if (elapsed >= HOUR / PURSE_PER_HOUR) {
    const gained = Math.floor((elapsed / HOUR) * PURSE_PER_HOUR);
    if (gained > 0) {
      meta.purse.coin = Math.min(PURSE_CAP, (meta.purse.coin || 0) + gained);
      // Carry the remainder, so an hour of play in five-minute visits fills the
      // purse by the same amount as one visit an hour later. Rounding the
      // timestamp forward to `now` would silently discard every partial hour.
      meta.purse.at = (meta.purse.at || now) + Math.round((gained / PURSE_PER_HOUR) * HOUR);
      store.save();
    }
  }
  return meta.purse;
}

/** What the house can pay right now. */
export const purseCoin = () => purse().coin | 0;

/**
 * Take a prize out of the house purse and give it to the player.
 *
 * Returns what was ACTUALLY paid, which may be less than asked for and may be
 * nothing. Callers must show what came back rather than what they requested —
 * telling somebody they won 20 and giving them 6 is the kind of small lie that
 * makes a whole economy feel broken.
 */
export function payOut(amount) {
  const want = Math.max(0, Math.floor(amount));
  if (!want) return 0;
  const p = purse();
  const paid = Math.min(want, p.coin | 0);
  if (paid > 0) {
    p.coin -= paid;
    store.addGold(paid);        // addGold saves for us
  }
  return paid;
}

/**
 * Put coin back into the house — a lost wager against Ren.
 *
 * Capped at the purse's own ceiling: gold lost to the house leaves the economy
 * rather than piling up somewhere it could be won back later in one sitting.
 */
export function payIn(amount) {
  const give = Math.max(0, Math.floor(amount));
  if (!give) return 0;
  if (!store.spendGold(give)) return 0;
  const p = purse();
  p.coin = Math.min(PURSE_CAP, (p.coin | 0) + give);
  store.save();
  return give;
}

/** Can the player cover a stake of this size? */
export const canStake = (amount) => (store.meta().gold | 0) >= Math.max(0, Math.floor(amount));

/**
 * Move a stake between players. Never touches the purse.
 *
 * `delta` is what this player ends the hand up or down. Winning from another
 * player is gold that already existed; the inn neither made it nor took a cut.
 */
export function settleWager(delta) {
  const n = Math.floor(delta);
  if (n > 0) { store.addGold(n); return n; }
  if (n < 0) return store.spendGold(-n) ? n : 0;
  return 0;
}

/** For the tests, and for a fresh night at the table. */
export function resetPurse(coin = PURSE_CAP) {
  const meta = store.meta();
  meta.purse = { coin, at: Date.now() };
  store.save();
}

/** How the purse should be described when it cannot pay. */
export const houseIsOut = () => purseCoin() <= 0;
