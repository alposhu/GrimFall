/*
 * Sovereign's Dice, checked without a table.
 *
 *   node tools/dice-smoke.mjs
 *
 * The rules are the part worth testing, and they are the part that is easy to
 * get subtly wrong in a way nobody notices for weeks: a re-roll that replaces a
 * die somebody kept, a second re-roll a disabled button was the only thing
 * preventing, a draw quietly resolved in favour of whoever happens to sort
 * first. All three are invisible in play and all three are checkable here.
 */

import { makeRng } from '../src/core/util.js';
import * as dice from '../src/game/dice.js';

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

// --- a throw is five dice, all of them real --------------------------------
let round = dice.newRound(1234);
let me = dice.roll(round, 'me', 'You');
check(me.dice.length === dice.DICE, `a throw should be ${dice.DICE} dice, got ${me.dice.length}`);
check(me.dice.every((d) => d >= 1 && d <= dice.FACES),
  `a die outside 1-${dice.FACES}: ${me.dice.join(',')}`);
check(dice.total(me) === me.dice.reduce((a, b) => a + b, 0), 'the total is not the sum');

// The same seed is the same throw. Two clients showing a different table for
// the same round would be worse than no minigame at all.
const twin = dice.newRound(1234);
const twinHand = dice.roll(twin, 'me', 'You');
check(twinHand.dice.join() === me.dice.join(), 'the same seed threw different dice');
console.log(`throw             ok (${dice.DICE} dice, seeded and repeatable)`);

// --- a kept die survives the re-roll ---------------------------------------
// Run it many times: a re-roll that ignores `keep` would still agree by chance
// on any single trial, because a re-rolled die often lands on the same face.
let violations = 0;
for (let trial = 0; trial < 300; trial++) {
  const r = dice.newRound(trial);
  const hand = dice.roll(r, 'me', 'You');
  const keptBefore = hand.dice.slice();
  dice.keep(r, 'me', 0);
  dice.keep(r, 'me', 3);
  dice.reroll(r, 'me');
  if (hand.dice[0] !== keptBefore[0] || hand.dice[3] !== keptBefore[3]) violations++;
}
check(violations === 0, `${violations} of 300 re-rolls replaced a die that was kept`);

// --- and there is only ever one re-roll ------------------------------------
round = dice.newRound(99);
dice.roll(round, 'me', 'You');
dice.reroll(round, 'me');
const afterFirst = round.hands.me.dice.slice();
dice.reroll(round, 'me');
check(round.hands.me.dice.join() === afterFirst.join(),
  'a second re-roll was allowed — the rule cannot depend on a disabled button');
console.log('re-roll           ok (keeps are kept, and only one is allowed)');

// --- Ren plays his own strategy, and it is the stated one ------------------
round = dice.newRound(7);
const ren = dice.playRen(round);
check(ren.done, 'Ren should finish his turn on his own');
check(ren.rerolled, 'Ren should use his re-roll');
check(ren.dice.every((d, i) => !ren.keep[i] || d >= 5),
  'Ren kept a die below five, which is not the strategy he is documented to play');

// Over many hands he should land near the expected value of his rule rather
// than at either extreme — a house that always wins is not somebody you play
// twice, and one that always loses is not a game.
let renTotal = 0;
const HANDS = 400;
for (let i = 0; i < HANDS; i++) renTotal += dice.total(dice.playRen(dice.newRound(i)));
const renAvg = renTotal / HANDS;
check(renAvg > 19 && renAvg < 25, `Ren averages ${renAvg.toFixed(1)}, which is not a fair table`);
console.log(`house             ok (Ren averages ${renAvg.toFixed(1)} of ${dice.DICE * dice.FACES})`);

// --- settling --------------------------------------------------------------
round = dice.newRound(5);
dice.roll(round, 'me', 'You');
dice.roll(round, 'them', 'Ece');
round.hands.me.dice = [6, 6, 6, 6, 6];
round.hands.them.dice = [1, 1, 1, 1, 1];
dice.stand(round, 'me');
dice.stand(round, 'them');
check(dice.everybodyDone(round), 'both players stood, so the round should be finished');
let result = dice.settle(round);
check(result.kind === 'win' && result.hand.id === 'me' && result.score === 30,
  `the higher hand should win, got ${JSON.stringify(result && result.kind)}`);

// A draw is reported as a draw. Inventing a winner the table can count for
// themselves is worse than saying nobody won.
round = dice.newRound(6);
dice.roll(round, 'me', 'You');
dice.roll(round, 'them', 'Ece');
round.hands.me.dice = [3, 3, 3, 3, 3];
round.hands.them.dice = [3, 3, 3, 3, 3];
dice.stand(round, 'me');
dice.stand(round, 'them');
result = dice.settle(round);
check(result.kind === 'draw' && result.hands.length === 2,
  'two equal hands should be a draw, not a win for whoever sorts first');
console.log('settling          ok (highest takes it, and a draw stays a draw)');

// --- a hand survives the wire ----------------------------------------------
round = dice.newRound(11);
const mine = dice.roll(round, 'me', 'You');
dice.stand(round, 'me');
const wire = dice.handToWire(mine);
const there = dice.newRound(11);
const rebuilt = dice.handFromWire(there, 'p2', wire);
check(rebuilt.dice.join() === mine.dice.join(), 'a hand changed on the way across');
check(rebuilt.done, 'a hand arriving from elsewhere is already finished');
check(there.order.includes('p2'), 'a remote player was not added to the table');
console.log('wire              ok (a hand crosses unchanged and cannot be re-rolled)');

// --- an empty table settles to nothing rather than throwing ----------------
check(dice.settle(dice.newRound(1)) === null, 'settling an empty table should give nothing');
check(!dice.everybodyDone(dice.newRound(1)), 'an empty table is not a finished round');

if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('\nAll dice checks passed.');
