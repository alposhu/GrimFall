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
// The Supper Rush
// ---------------------------------------------------------------------------
const supper = await import('../src/game/supper.js');

// Every dish must be buildable from the stations that exist. A recipe naming an
// ingredient the kitchen does not have is an unservable ticket, and it looks
// exactly like a hard one.
const stationIds = new Set(supper.STATIONS.map((s) => s.id));
for (const dish of supper.DISHES) {
  check(dish.steps.length >= 2, `"${dish.name}" is a one-step dish, which is a button, not a recipe`);
  for (const step of dish.steps) {
    check(stationIds.has(step), `"${dish.name}" needs "${step}", which no station serves`);
  }
  check(dish.seconds > dish.steps.length * 3,
    `"${dish.name}" allows ${dish.seconds}s for ${dish.steps.length} steps, which is not enough time`);
}

// The book has to open up. If tier 3 were reachable from the first ticket the
// shift would have no shape at all.
check(supper.pressure(0).tiers < supper.pressure(20).tiers, 'the book never opens up');
check(supper.pressure(0).every > supper.pressure(20).every, 'the tickets never speed up');
check(supper.pressure(0).patience > supper.pressure(20).patience, 'the guests never lose patience');
// And both curves have to flatten, or the shift becomes impossible rather than
// hard and the last minute is unplayable for everybody.
check(supper.pressure(999).every === supper.pressure(500).every, 'the ticket rate has no floor');
check(supper.pressure(999).patience === supper.pressure(500).patience, 'patience has no floor');

// A wrong ingredient throws the dish out. A right one advances it.
let shift = supper.newShift(3, 1);
let ticket = supper.writeTicket(shift);
check(supper.useStation(shift, ticket.key, ticket.steps[0]) === 'step', 'the first step did not go in');
check(ticket.done === 1, 'a correct step did not advance the dish');
const wrong = supper.STATIONS.map((s) => s.id).find((id) => id !== ticket.steps[1]);
check(supper.useStation(shift, ticket.key, wrong) === 'spoiled', 'a wrong ingredient was accepted');
check(ticket.done === 0, 'a spoiled dish did not start again from nothing');

// Finishing the steps serves it, and it leaves the rail.
shift = supper.newShift(3, 1);
ticket = supper.writeTicket(shift);
for (const step of ticket.steps.slice(0, -1)) supper.useStation(shift, ticket.key, step);
check(supper.useStation(shift, ticket.key, ticket.steps[ticket.steps.length - 1]) === 'served',
  'the last step did not serve the dish');
check(shift.served === 1 && shift.tickets.length === 0, 'a served dish stayed on the rail');
check(shift.score > 0, 'a served dish scored nothing');

// Speed pays: the same dish served with more of its life left is worth more.
const fast = supper.newShift(3, 1);
const slow = supper.newShift(3, 1);
const ft = supper.writeTicket(fast);
const st = supper.writeTicket(slow);
st.left = st.life * 0.1;
for (const step of ft.steps) supper.useStation(fast, ft.key, step);
for (const step of st.steps) supper.useStation(slow, st.key, step);
check(fast.score > slow.score, 'serving quickly is worth no more than serving late');

// --- the collision rule, which is the whole of the co-op -------------------
shift = supper.newShift(3, 2);
ticket = supper.writeTicket(shift);
check(supper.claim(shift, ticket.key, 'p1') !== null, 'the first cook could not take a ticket');
check(supper.claim(shift, ticket.key, 'p2') === null, 'two cooks took the same ticket');
check(supper.useStation(shift, ticket.key, ticket.steps[0], 'p2') === null,
  'a cook worked a ticket somebody else had claimed');
check(supper.useStation(shift, ticket.key, ticket.steps[0], 'p1') === 'step',
  'the cook who claimed it could not work it');
supper.release(shift, ticket.key, 'p1');
check(supper.claim(shift, ticket.key, 'p2') !== null, 'a released ticket could not be taken up');

// --- the shift ends, both ways ---------------------------------------------
// Without a clock a perfect cook never loses a ticket and the kitchen runs for
// ever, which is both an unbounded way to earn and a game you can only leave by
// failing on purpose.
shift = supper.newShift(3, 1);
for (let i = 0; i < 2000 && !shift.over; i++) supper.tick(shift, 0.1);
check(shift.over, 'the shift never ended');
check(shift.ended === 'time' || shift.ended === 'lost', 'the shift ended for no stated reason');

shift = supper.newShift(3, 1);
let guard = 0;
while (!shift.over && guard++ < 5000) supper.tick(shift, 0.05);
check(shift.ended === 'lost', 'a kitchen nobody worked should fall over, not run out the clock');
check(shift.lost >= supper.LIVES, 'the shift ended before the lives ran out');

// Nothing new arrives at the bell: a ticket written with three seconds left is
// a life lost to the closing bell and nothing else.
shift = supper.newShift(3, 1);
shift.left = 4;
shift.since = 999;
check(supper.tick(shift, 0.1).wrote === null, 'a ticket was written that nobody could serve');

// The rail is the ceiling. Once it is full nothing more arrives, so a kitchen
// that is drowning is not also being buried.
shift = supper.newShift(3, 1);
while (shift.tickets.length < supper.railFor(1)) supper.writeTicket(shift);
shift.since = 999;
check(supper.tick(shift, 0.01).wrote === null, 'a ticket was added to a full rail');

// --- more cooks is a busier kitchen, not a bigger share --------------------
// If the supply were fixed, every friend who joined would halve the pay and the
// best thing you could do for your own purse would be to play alone — the wrong
// incentive for the one co-operative game in the building.
check(supper.pressure(10, 4).every < supper.pressure(10, 1).every,
  'four cooks get no more tickets than one, so joining in costs everybody');
check(supper.railFor(4) > supper.railFor(1), 'four cooks share one cook’s rail');

// And the prize is per head, so a kitchen of idle spectators earns nothing.
const busy = supper.newShift(3, 4);
busy.score = 4000;
const alone = supper.newShift(3, 1);
alone.score = 1000;
check(supper.prize(busy) === supper.prize(alone),
  'four cooks serving four times as much do not earn what one cook earns');
const idle = supper.newShift(3, 4);
idle.score = 1000;
check(supper.prize(idle) < supper.prize(alone), 'bringing spectators paid the same as working');
console.log(`supper            ok (${supper.DISHES.length} dishes, ${supper.STATIONS.length} stations, `
  + `${supper.SHIFT_SECONDS}s service, claims hold)`);

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
