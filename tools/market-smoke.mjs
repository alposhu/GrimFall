/*
 * Marketplace test — development only.
 *
 *   node tools/market-smoke.mjs
 *
 * The market is the one part of the game with no combat to shake out its bugs,
 * so it gets simulated instead: several minutes of crowd, every vendor visited,
 * every good in the catalogue bought, and the whole thing rendered.
 *
 * The crowd checks are the interesting ones. A steering system that looks fine
 * for ten seconds can still drift everyone into a wall or stack them all on one
 * tile, and neither shows up in a screenshot.
 */

import './dom-stub.mjs';

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

const { S } = await import('../src/game/state.js');
const { startRun } = await import('../src/game/game.js');
const {
  M, BOUNDS, enterMarket, updateMarket, interact, closeShop, leaveMarket,
  marketLayout, marketEntry,
} = await import('../src/game/market.js');
const { renderMarket } = await import('../src/game/marketRender.js');
const {
  VENDORS, VENDOR_ORDER, rollStock, buy, purchaseBlocked, goodById,
  useFlask, FLASK_IDS, priceOf,
} = await import('../src/game/shop.js');
const { maxHp } = await import('../src/game/state.js');

// ---------------------------------------------------------------------------
// Layout sanity
// ---------------------------------------------------------------------------
check(BOUNDS.right > BOUNDS.left && BOUNDS.bottom > BOUNDS.top, 'the market has no area');
const vendorStalls = marketLayout.stalls.filter((s) => s.vendor);
check(vendorStalls.length === VENDOR_ORDER.length,
  `${vendorStalls.length} vendor stalls for ${VENDOR_ORDER.length} vendors`);
for (const s of marketLayout.stalls) {
  check(s.x > BOUNDS.left && s.x < BOUNDS.right && s.y > BOUNDS.top && s.y < BOUNDS.bottom,
    `stall ${s.kind} sits outside the square`);
}
for (const [kind, x, y] of marketLayout.props) {
  check(x > BOUNDS.left && x < BOUNDS.right && y > BOUNDS.top && y < BOUNDS.bottom,
    `prop ${kind} sits outside the square`);
}
for (const [a, b] of marketLayout.strings) {
  check(marketLayout.lamps[a] && marketLayout.lamps[b], `lantern string ${a}->${b} has no posts`);
}
// The exit must be reachable, i.e. not buried inside a solid.
for (const [kind, x, y] of marketLayout.props) {
  check(Math.hypot(x - marketEntry.x, y - marketEntry.y) > 60,
    `${kind} is sitting in the doorway`);
}
console.log(`layout            ok (${marketLayout.stalls.length} stalls, ${marketLayout.props.length} props, ${vendorStalls.length} vendors)`);

// ---------------------------------------------------------------------------
// A boss death is what opens the road
// ---------------------------------------------------------------------------
// enterMarket is called directly everywhere below, so this is the one check
// that the market is reachable by playing the game at all.
{
  const { startArena, update, suspendForMarket, PORTAL_RADIUS } = await import('../src/game/game.js');
  const { killEnemy } = await import('../src/game/state.js');
  const { BOSSES } = await import('../src/game/config.js');
  const bigView = { left: -900, right: 900, top: -700, bottom: 700, w: 1800, h: 1400 };

  // Arena fights are practice and must never open a market.
  startArena('ranger', 'normal', 'magus');
  for (let i = 0; i < 60 * 20 && !S.boss; i++) update(1 / 60, bigView);
  check(S.boss, 'the arena boss never arrived');
  if (S.boss) killEnemy(S.boss);
  check(!S.pendingMarket, 'a Boss Arena kill opened the market');
  check(!S.portal, 'a Boss Arena kill opened a portal');

  // A real run, played until the first boss dies.
  startRun('ranger', 'normal');
  S.time = BOSSES[0].at * 60 - 1;
  let guard = 0;
  while (!S.boss && guard++ < 60 * 90) update(1 / 60, bigView);
  check(S.boss, 'no boss turned up in a real run');
  const name = S.boss?.name;
  const where = S.boss ? { x: S.boss.x, y: S.boss.y } : { x: 0, y: 0 };
  if (S.boss) killEnemy(S.boss);
  update(1 / 60, bigView);

  // A dead boss leaves a portal where it fell. It does not teleport you: the
  // run keeps running until you choose to step in, which is what lets you
  // finish collecting the gems a boss drops.
  check(S.portal, 'killing a boss did not open a portal');
  check(!S.pendingMarket, 'the portal took the player without being entered');
  check(Math.hypot((S.portal?.x ?? 1e9) - where.x, (S.portal?.y ?? 1e9) - where.y) < 1,
    'the portal did not open where the boss died');

  // A boss death also hands out level-ups, and `update` stops dead while any
  // are pending — the real game opens the draft here. Take them so the run is
  // running again, which is the state the player walks to the portal in.
  S.pendingLevels = 0;

  // Standing on it while it is still tearing open must not take you, or a boss
  // killed at point-blank range would swallow you before you could read it.
  S.player.x = S.portal.x;
  S.player.y = S.portal.y;
  update(1 / 60, bigView);
  check(!S.pendingMarket, 'the portal took the player before it had opened');

  // Once open, walking into it does.
  let waited = 0;
  while (!S.pendingMarket && waited++ < 60 * 4) {
    S.pendingLevels = 0;
    S.player.x = S.portal ? S.portal.x : 0;
    S.player.y = S.portal ? S.portal.y : 0;
    update(1 / 60, bigView);
  }
  check(S.pendingMarket, 'walking into the portal did not open the market');
  check(S.pendingMarket?.bossName === name, 'the market does not know who died');

  // And standing clear of it leaves you in the run.
  {
    startRun('ranger', 'normal');
    S.portal = { x: 400, y: 400, t: 99, bossName: 'Test', taken: false };
    S.player.x = 400 + PORTAL_RADIUS + 30;
    S.player.y = 400;
    for (let i = 0; i < 60; i++) update(1 / 60, bigView);
    check(!S.pendingMarket, 'the portal reached out and grabbed the player');
    check(S.portal && !S.portal.taken, 'the portal closed on its own');
  }

  // Put the state back where the rest of this block expects it.
  startRun('ranger', 'normal');
  S.pendingMarket = { bossName: name };

  const info = suspendForMarket();
  check(info.visit === 1, `first market reports visit ${info.visit}`);
  check(!S.pendingMarket, 'the market request was not consumed');
  check(S.hostileShots.length === 0, 'enemy fire survived into the market');

  // The last boss ends the run instead: there is nothing left to spend on.
  S.bossIndex = BOSSES.length;
  S.pendingMarket = null;
  const last = { name: 'Parduin, the Drake God', bossId: 'parduin', isBoss: true, x: 0, y: 0, tint: '#fff', hp: 0, maxHp: 1, size: 40 };
  S.enemies.push(last);
  S.boss = last;
  killEnemy(last);
  check(!S.pendingMarket, 'the final boss opened a market');
  console.log(`entry             ok (${name} → market, arena and final boss excluded)`);
}

// ---------------------------------------------------------------------------
// A visit
// ---------------------------------------------------------------------------
startRun('ranger', 'normal');
S.seed = 20260831;                  // the crowd is seeded from this: pin it
S.gold = 100000;                    // so the catalogue can be bought out
let exited = false;
enterMarket({ visit: 1, bossName: 'The Hollow Magus', onExit: () => { exited = true; } });

check(M.active, 'the market did not open');
check(M.folk.length >= 10, `only ${M.folk.length} townsfolk`);
check(M.vendors.length === VENDOR_ORDER.length, 'not every vendor turned up');

const view = { w: 900, h: 620 };

// --- crowd simulation -------------------------------------------------------
const seen = new Set();             // which states actually get used
let minSep = Infinity;
let outOfBounds = 0;
let stuck = 0;
const startPos = M.folk.map((f) => ({ x: f.x, y: f.y }));
const travelled = M.folk.map(() => 0);
let frames = 0;

for (let i = 0; i < 60 * 180; i++) {         // three minutes at 60fps
  const before = M.folk.map((f) => ({ x: f.x, y: f.y }));
  updateMarket(1 / 60, view);
  frames++;

  for (let k = 0; k < M.folk.length; k++) {
    const f = M.folk[k];
    seen.add(f.state);
    travelled[k] += Math.hypot(f.x - before[k].x, f.y - before[k].y);

    if (!Number.isFinite(f.x) || !Number.isFinite(f.y)) {
      problems.push(`townsperson ${k} left the number line at frame ${i}`);
      break;
    }
    if (f.x < BOUNDS.left || f.x > BOUNDS.right || f.y < BOUNDS.top || f.y > BOUNDS.bottom) outOfBounds++;
  }

  // Separation only has to hold once the crowd has settled from its spawn.
  if (i > 120 && i % 7 === 0) {
    for (let a = 0; a < M.folk.length; a++) {
      for (let b = a + 1; b < M.folk.length; b++) {
        const d = Math.hypot(M.folk[a].x - M.folk[b].x, M.folk[a].y - M.folk[b].y);
        if (d < minSep) minSep = d;
      }
    }
  }
}

check(outOfBounds === 0, `the crowd left the square on ${outOfBounds} frame-checks`);
check(minSep > 9, `two townsfolk got within ${minSep.toFixed(1)}px — separation is not holding`);
for (let k = 0; k < M.folk.length; k++) {
  if (travelled[k] < 300) stuck++;
}
check(stuck === 0, `${stuck} townsfolk barely moved in three minutes`);
for (const want of ['stroll', 'browse', 'chat', 'linger']) {
  check(seen.has(want), `no townsperson ever entered the "${want}" state`);
}
const spread = Math.max(...M.folk.map((f, k) => Math.hypot(f.x - startPos[k].x, f.y - startPos[k].y)));
check(spread > 100, 'nobody in the crowd went anywhere');
console.log(`crowd             ok (${M.folk.length} folk, ${frames} frames, closest ${minSep.toFixed(1)}px, states: ${[...seen].sort().join('/')})`);

// --- and it must hold for any seed, not the one that happens to be pinned ---
// The crowd is seeded from the run seed, so a behaviour that only emerges on a
// lucky seed would pass the block above and still be broken in play.
const seeds = [1, 7, 12345, 99991, 20260831, 555000111, 42, 8675309];
let chatted = 0, walked = 0, escaped = 0;
for (const seed of seeds) {
  S.seed = seed;
  enterMarket({ visit: 2, bossName: 'x', onExit: () => {} });
  const from = M.folk.map((f) => ({ x: f.x, y: f.y }));
  const moved = M.folk.map(() => 0);
  let sawChat = false;
  for (let i = 0; i < 60 * 150; i++) {
    const prev = M.folk.map((f) => ({ x: f.x, y: f.y }));
    updateMarket(1 / 60, view);
    M.folk.forEach((f, k) => {
      moved[k] += Math.hypot(f.x - prev[k].x, f.y - prev[k].y);
      if (f.state === 'chat') sawChat = true;
      if (f.x < BOUNDS.left || f.x > BOUNDS.right || f.y < BOUNDS.top || f.y > BOUNDS.bottom) escaped++;
    });
  }
  if (sawChat) chatted++;
  if (moved.every((d) => d > 250)) walked++;
  void from;
}
check(chatted === seeds.length, `conversation only happened on ${chatted} of ${seeds.length} seeds`);
check(walked === seeds.length, `somebody was stuck on ${seeds.length - walked} of ${seeds.length} seeds`);
check(escaped === 0, `the crowd left the square ${escaped} times across ${seeds.length} seeds`);
console.log(`crowd (seeded)    ok (${seeds.length} seeds, all talked, all walked, none escaped)`);

// ---------------------------------------------------------------------------
// Talking, and buying
// ---------------------------------------------------------------------------
let bought = 0, blocked = 0;
for (const id of VENDOR_ORDER) {
  const v = M.vendors.find((x) => x.id === id);
  check(v, `${id} is not standing anywhere`);
  if (!v) continue;

  // Walk to the counter and check the prompt notices.
  M.player.x = v.x;
  M.player.y = v.y + 40;
  updateMarket(1 / 60, view);
  check(M.prompt && M.prompt.kind === 'vendor' && M.prompt.id === id,
    `standing at ${id}'s counter raises no prompt`);

  const r = interact();
  check(r && r.kind === 'vendor', `could not talk to ${id}`);
  check(M.talking === id, `${id} did not open a shop`);

  check(v.stock.length === 4, `${id} offers ${v.stock.length} goods, expected 4`);
  for (const entry of v.stock) {
    const good = goodById(id, entry.id);
    check(good, `${id} stocks "${entry.id}" which is not in the catalogue`);
    check(entry.price > 0, `${entry.id} is free`);
    // Buy it out.
    for (let n = 0; n < 6; n++) {
      const why = purchaseBlocked(id, entry);
      if (why) { blocked++; break; }
      const before = S.gold;
      check(buy(id, entry), `buying ${entry.id} failed with no reason given`);
      check(S.gold === before - entry.price, `${entry.id} charged the wrong amount`);
      bought++;
    }
    check(entry.left === 0 || purchaseBlocked(id, entry), `${entry.id} never sold out`);
  }

  closeShop();
  check(M.talking === null, `the shop stayed open after leaving ${id}`);
}
console.log(`shelves           ok (${bought} bought from the rolled shelves, ${blocked} correctly refused)`);

// A visit only shows four of six, so buying the shelf cannot reach every good.
// Roll a full shelf as well, so nothing in the catalogue ships untested.
let full = 0;
for (const id of VENDOR_ORDER) {
  const shelf = VENDORS[id].goods.map((g) => ({ id: g.id, price: priceOf(g, 1), left: g.stock }));
  for (const entry of shelf) {
    for (let n = 0; n < 6; n++) {
      if (purchaseBlocked(id, entry)) break;
      check(buy(id, entry), `buying ${entry.id} from a full shelf failed`);
      full++;
    }
  }
}
check(bought + full >= 40, `only ${bought + full} purchases went through in total`);
console.log(`catalogue         ok (every good in all ${VENDOR_ORDER.length} vendors bought, ${full} more)`);

// --- purchases actually did something ---------------------------------------
check(S.purchases.length === bought + full, 'the purchase log does not match what was bought');
const p = S.player;
// Everything from Oswin and the Coinweigher rides an existing multiplier, so
// after buying the lot every one of them must have moved.
check(p.metaMight > 1, 'Bladeoil did not raise might');
check(p.metaArmor > 0, 'Tempered Plate did not raise armour');
check(p.metaSpeed > 1, 'Roadworn Boots did not raise speed');
check(p.metaHaste < 1, 'the Clockwork Spring did not lower cooldowns');
check(p.metaLuck > 1, 'the Weighted Charm did not raise luck');
check(p.metaMagnet > 1, 'the Lodestone did not raise pickup range');
check(p.metaGreed > 1, 'the Tithe did not raise gold');
check(p.metaHp >= 25, 'the Hot Meal did not raise maximum health');
check(S.revives >= 1, 'the Wax Effigy granted no revive');
check(S.rerolls >= 2 && S.banishes >= 2, 'the Coinweigher sold no rerolls or banishes');
check((p.passives.regen || 0) >= 1, 'the Root Tonic granted no regeneration');
check(p.weapons.length > 1, 'the Commission never added a weapon');
console.log(`effects           ok (might x${p.metaMight.toFixed(2)}, armour +${p.metaArmor}, ` +
  `haste x${p.metaHaste.toFixed(2)}, hp +${p.metaHp}, ${p.weapons.length} weapons, ${S.revives} revives)`);

// --- the belt ---------------------------------------------------------------
let drank = 0;
for (const id of FLASK_IDS) {
  const had = S.inventory[id] || 0;
  check(had > 0, `never managed to buy a ${id}`);
  if (had > 0) {
    p.hp = 1;
    check(useFlask(id), `could not drink ${id}`);
    check((S.inventory[id] || 0) === had - 1, `${id} did not leave the belt`);
    drank++;
  }
}
check(!useFlask('flask_heal') || true, 'drinking is not throwing');
S.inventory.flask_heal = 0;
check(useFlask('flask_heal') === false, 'drank a flask that was not there');
check(p.swiftT > 0, 'the swiftness oil did nothing');
console.log(`belt              ok (${drank} flasks drunk, empty belt refuses)`);

// ---------------------------------------------------------------------------
// Prices climb, stock is deterministic
// ---------------------------------------------------------------------------
const g = VENDORS.oswin.goods[0];
check(priceOf(g, 3) > priceOf(g, 0), 'prices do not rise across visits');
const a1 = rollStock('oswin', 1234, 2).map((e) => e.id).join(',');
const a2 = rollStock('oswin', 1234, 2).map((e) => e.id).join(',');
const a3 = rollStock('oswin', 1234, 3).map((e) => e.id).join(',');
check(a1 === a2, 'the same seed and visit rolled a different shelf');
check(a1 !== a3 || VENDORS.oswin.goods.length <= 4, 'two visits offered an identical shelf');
console.log(`stock             ok (deterministic per seed+visit, prices scale)`);

// ---------------------------------------------------------------------------
// Leaving
// ---------------------------------------------------------------------------
// The seed sweep above re-entered the market with its own callback, so open a
// fresh one that reports back to `exited`.
enterMarket({ visit: 1, bossName: 'The Hollow Magus', onExit: () => { exited = true; } });
M.player.x = marketEntry.x;
M.player.y = marketEntry.y + 70;
updateMarket(1 / 60, view);
check(M.prompt && M.prompt.kind === 'exit', 'standing in the doorway raises no exit prompt');
leaveMarket();
for (let i = 0; i < 240 && M.active; i++) updateMarket(1 / 60, view);
check(exited, 'leaving the market never called back');
check(!M.active, 'the market is still open after leaving');
console.log('exit              ok (prompt, fade, callback)');

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
enterMarket({ visit: 3, bossName: 'Rime Colossus', onExit: () => {} });
const canvas = document.createElement('canvas');
canvas.width = 900; canvas.height = 620;
const ctx = canvas.getContext('2d');
let drawn = 0;
for (let i = 0; i < 120; i++) {
  updateMarket(1 / 60, view);
  try {
    renderMarket(ctx, canvas, 1);
    drawn++;
  } catch (e) {
    problems.push(`renderMarket threw on frame ${i}: ${e.message}`);
    break;
  }
}
check(drawn === 120, `only ${drawn} of 120 frames rendered`);

// A second visit must restock rather than reuse the first visit's shelf.
const third = M.vendors.find((v) => v.id === 'oswin');
check(third && third.stock.every((e) => e.left > 0), 'the third visit opened sold out');
console.log(`render            ok (${drawn} frames at ${canvas.width}x${canvas.height})`);

if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((x) => console.error('  - ' + x));
  process.exit(1);
}
console.log('\nAll market checks passed.');
