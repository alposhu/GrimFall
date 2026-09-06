/*
 * Three Cups, the Knife Board, and the house purse.
 *
 *   node tools/minigame-smoke.mjs
 *
 * The purse is the important one. Everything else here is a game; the purse is
 * the reason the games cannot replace playing Grimfall, and a bug in it is a
 * bug in the whole economy — a lobby that prints gold makes the Sanctuary
 * meaningless, and there is no in-game symptom until somebody has farmed it.
 */

import './dom-stub.mjs';

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

const store = await import('../src/core/storage.js');
store.load();
const purse = await import('../src/game/purse.js');
const cups = await import('../src/game/cups.js');
const knives = await import('../src/game/knives.js');

// ---------------------------------------------------------------------------
// The house purse
// ---------------------------------------------------------------------------
purse.resetPurse(50);
const before = store.meta().gold | 0;
check(purse.payOut(20) === 20, 'the house should pay a prize it can cover');
check((store.meta().gold | 0) === before + 20, 'the prize did not reach the player');
check(purse.purseCoin() === 30, `the purse should have gone down to 30, it is ${purse.purseCoin()}`);

// The whole point: it pays what it HAS, not what was asked for, and the caller
// is told the real number so it can show the real number.
check(purse.payOut(100) === 30, 'the house paid out more than it held');
check(purse.purseCoin() === 0, 'the purse should be empty');
check(purse.payOut(10) === 0, 'an empty house paid out anyway');
check(purse.houseIsOut(), 'an empty purse should report itself empty');

// And it cannot be drained past zero however hard it is asked.
const goldNow = store.meta().gold | 0;
for (let i = 0; i < 50; i++) purse.payOut(999);
check((store.meta().gold | 0) === goldNow, 'an empty house kept paying out');
console.log(`purse             ok (pays what it holds, capped at ${purse.PURSE_CAP})`);

// It refills with the wall clock, not with play. Reaching back in time is the
// only way to test this without waiting an hour.
purse.resetPurse(0);
store.meta().purse.at = Date.now() - 3 * 3600 * 1000;
check(purse.purseCoin() === 3 * purse.PURSE_PER_HOUR,
  `three hours should be ${3 * purse.PURSE_PER_HOUR} coin, got ${purse.purseCoin()}`);

// A clock that has gone backwards must not empty it or hand out free gold.
purse.resetPurse(40);
store.meta().purse.at = Date.now() + 10 * 3600 * 1000;
check(purse.purseCoin() === 40, 'a clock in the future changed the purse');

// And it never fills past the cap, however long it is left.
purse.resetPurse(0);
store.meta().purse.at = Date.now() - 500 * 3600 * 1000;
check(purse.purseCoin() === purse.PURSE_CAP,
  `left for weeks the purse should hold exactly the cap, it holds ${purse.purseCoin()}`);
console.log(`refill            ok (${purse.PURSE_PER_HOUR}/hour, clamped both ways)`);

// A wager between players never touches the house.
purse.resetPurse(60);
store.addGold(100);
const held = store.meta().gold | 0;
purse.settleWager(-25);
check((store.meta().gold | 0) === held - 25, 'a lost wager did not leave the player');
check(purse.purseCoin() === 60, 'a wager between players touched the house purse');
purse.settleWager(25);
check((store.meta().gold | 0) === held, 'a won wager did not come back');
console.log('wagers            ok (player to player, never through the house)');

// ---------------------------------------------------------------------------
// Three Cups
// ---------------------------------------------------------------------------
// The shuffle is decided before anything moves, and following it is arithmetic.
// If these two disagree the game is unwinnable and it looks like bad luck.
let mismatches = 0;
for (let seed = 0; seed < 200; seed++) {
  const g = cups.newGame(seed);
  cups.deal(g);
  if (cups.resolve(g.start, g.swaps) !== g.coin) mismatches++;
}
check(mismatches === 0, `${mismatches} of 200 shuffles ended somewhere other than stated`);

// The same seed is the same shuffle — that is what lets a table watch one.
const shuffleA = cups.newGame(4242); cups.deal(shuffleA);
const shuffleB = cups.newGame(4242); cups.deal(shuffleB);
check(JSON.stringify(shuffleA.swaps) === JSON.stringify(shuffleB.swaps)
  && shuffleA.coin === shuffleB.coin,
'the same seed produced a different shuffle — a table would disagree about it');

// No swap repeats the same pair twice running: it reads as the cups jittering
// rather than swapping, and it is a free swap for anybody tracking.
let repeats = 0;
for (let seed = 0; seed < 100; seed++) {
  const g = cups.newGame(seed);
  cups.deal(g);
  for (let i = 1; i < g.swaps.length; i++) {
    const [p, q] = g.swaps[i - 1];
    const [r, s] = g.swaps[i];
    if (Math.min(p, q) === Math.min(r, s) && Math.max(p, q) === Math.max(r, s)) repeats++;
  }
}
check(repeats === 0, `${repeats} shuffles swapped the same pair twice running`);

// Every swap is between two DIFFERENT cups, both on the table.
for (let seed = 0; seed < 50; seed++) {
  const g = cups.newGame(seed);
  cups.deal(g);
  for (const [p, q] of g.swaps) {
    check(p !== q, 'a cup was swapped with itself');
    check(p >= 0 && p < cups.CUPS && q >= 0 && q < cups.CUPS, 'a swap left the table');
  }
}

// It gets harder, and the difficulty has a floor so it stays watchable.
const shapes = [0, 1, 2, 3, 8, 20].map(cups.roundShape);
check(shapes.every((s, i) => i === 0 || s.swaps > shapes[i - 1].swaps), 'rounds do not lengthen');
check(shapes[shapes.length - 1].speed >= 190, 'the shuffle sped past its own floor');

// Picking right advances; picking wrong resets to nothing.
const g = cups.newGame(9);
cups.deal(g);
g.phase = 'choose';
const win = cups.pick(g, g.coin);
check(win.correct && win.streak === 1 && win.prize === cups.prize(1), 'a correct pick paid wrongly');
cups.deal(g);
g.phase = 'choose';
const lose = cups.pick(g, (g.coin + 1) % cups.CUPS);
check(!lose.correct && lose.streak === 0 && g.round === 0, 'a wrong pick did not reset the run');
check(g.best === 1, 'the best run should be remembered past a loss');

// A pick outside the choosing phase is refused. This is the rule that stops a
// double-tap during the reveal from counting as the next round's answer.
check(cups.pick(g, 0) === null, 'a pick was accepted while the cups were not asking');
console.log(`cups              ok (shuffles resolve, seeded alike, streak pays `
  + `${[1, 2, 3, 4].map(cups.prize).join('/')})`);

// ---------------------------------------------------------------------------
// The Knife Board
// ---------------------------------------------------------------------------
// The marker sweeps at a CONSTANT speed. A sine would dwell at the edges, which
// makes the edges the easiest place to hit on a board whose prize is in the
// middle — exactly backwards.
const samples = [];
for (let i = 0; i <= 200; i++) samples.push(knives.markerAt(i / 200, 0));
check(Math.max(...samples) > 0.97 && Math.min(...samples) < -0.97,
  'the sweep does not reach both edges of the board');
const steps = samples.slice(1).map((v, i) => Math.abs(v - samples[i]));
const spread = Math.max(...steps) / Math.min(...steps.filter((s) => s > 1e-9));
check(spread < 3, `the sweep speeds up and slows down (${spread.toFixed(1)}x), it should not`);

// It genuinely gets faster with each knife.
check(knives.sweepRate(2) > knives.sweepRate(1) && knives.sweepRate(1) > knives.sweepRate(0),
  'the sweep does not accelerate between knives');

// Scoring runs from the middle out and never leaves a gap.
check(knives.scoreAt(0).points === 50, 'the centre is not the pin');
check(knives.scoreAt(1).points < knives.scoreAt(0).points, 'the edge pays as well as the centre');
check(knives.scoreAt(-0.05).points === knives.scoreAt(0.05).points, 'the board is not symmetric');
let last = Infinity;
for (let d = 0; d <= 1.0001; d += 0.01) {
  const p = knives.scoreAt(d).points;
  check(p > 0, `nothing scores at ${d.toFixed(2)} — there is a hole in the board`);
  check(p <= last, `scoring rises again at ${d.toFixed(2)}`);
  last = p;
}

// Three knives, and no fourth however hard the button is pressed.
const board = knives.newBoard('You');
for (let i = 0; i < 10; i++) knives.throwKnife(board, 0);
check(board.throws.length === knives.KNIVES,
  `${board.throws.length} knives went into a board that holds ${knives.KNIVES}`);
check(knives.boardTotal(board) === knives.PERFECT, 'three in the pin is not a perfect board');
check(board.done, 'a full board did not close itself');

// A bad board pays nothing. Paying for every board is how a skill game turns
// into a slot machine.
check(knives.prize(0) === 0 && knives.prize(20) === 0, 'a poor board paid out');
check(knives.prize(knives.PERFECT) > knives.prize(100), 'a perfect board is not worth the most');

// And a board survives the wire.
const wire = knives.toWire(board);
const there = knives.fromWire(wire);
check(knives.boardTotal(there) === knives.boardTotal(board), 'a board changed on the way across');
check(there.done, 'a board arriving from elsewhere is already finished');
console.log(`knives            ok (constant sweep, ${knives.RINGS.length} rings, `
  + `perfect pays ${knives.prize(knives.PERFECT)})`);

// ---------------------------------------------------------------------------
// And the whole point, stated as a number
// ---------------------------------------------------------------------------
// The cheapest Sanctuary upgrade is 50 gold and a full board is several
// thousand. If a day of the inn ever approached that, the lobby would be the
// better way to play and the run would be the chore.
const config = await import('../src/game/config.js');
const cheapest = Math.min(...config.META_UPGRADES.map((u) => u.cost[0]));
check(purse.PURSE_CAP < cheapest * 3,
  `a full purse (${purse.PURSE_CAP}) is worth more than three of the cheapest upgrade (${cheapest})`);
console.log(`economy           ok (a full purse is ${(purse.PURSE_CAP / cheapest).toFixed(1)}x `
  + `the cheapest upgrade, not a way to skip the game)`);

if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('\nAll minigame checks passed.');
