/*
 * One headless co-op client — development only, launched by coop-smoke.mjs.
 *
 *   node tools/coop-client.mjs <serverUrl> <host|guest> <code> <seconds>
 *
 * A separate PROCESS per client, not a separate module instance. The game is
 * built out of module singletons — one `S`, one connection, one session — so
 * two clients in one process would share all three and prove nothing. Two
 * processes are what two people actually are.
 *
 * It plays for real: the same `update()` the browser runs, the same session
 * tick, a bot that walks in a slow circle so positions actually change. At the
 * end it prints one JSON line for the parent to compare.
 */

import './dom-stub.mjs';

const [, , SERVER, ROLE, CODE, SECONDS] = process.argv;

// This is how src/net/config.js is told where to connect without a browser.
globalThis.localStorage = { getItem: () => SERVER, setItem() {} };

const net = await import('../src/net/connection.js');
const { S } = await import('../src/game/state.js');
const { startRun, update, computeView } = await import('../src/game/game.js');
const { startCoopRun, tickCoop, session, assignCounts } = await import('../src/net/coopRun.js');
const { setWorldSeed } = await import('../src/game/world.js');
const { seedRandom } = await import('../src/core/util.js');
const { input } = await import('../src/core/input.js');

const done = (obj) => { console.log('__RESULT__' + JSON.stringify(obj)); process.exit(0); };
const fail = (why) => { console.log('__RESULT__' + JSON.stringify({ error: why })); process.exit(1); };
setTimeout(() => fail('client timed out'), 25000);

await net.connect();

const started = new Promise((res) => net.on('started', res));
net.on('denied', (m) => fail('denied: ' + m.reason));

if (ROLE === 'host') {
  net.createGame('Host');
  await new Promise((res) => net.on('lobby', res));
  // Announce the code so the parent can hand it to the guest.
  console.log('__CODE__' + net.lobbyState().code);
  // The guest readies up; wait for that before starting.
  await new Promise((res) => {
    const off = net.on('lobby', (l) => {
      if (l.players.length > 1 && l.players.every((p) => p.ready || p.id === l.hostId)) { off(); res(); }
    });
  });
  net.startGame();
} else {
  net.joinGame(CODE, 'Guest');
  await new Promise((res) => net.on('lobby', res));
  net.setReady(true);
}

const m = await started;

// Exactly what main.js does on `onCoopStart`, minus the interface.
startRun('ranger', m.difficulty || 'normal');
S.seed = m.seed;
setWorldSeed(m.seed);
seedRandom(m.seed);
startCoopRun({ ...m, selfId: net.selfPlayerId() }, net.selfPlayerId());

const canvas = { width: 1280, height: 720 };
const dt = 1 / 30;
const frames = Math.round(Number(SECONDS) * 30);

// A slow circle, in opposite directions per role, so the two players separate
// and their positions are genuinely different things to sync.
const dir = ROLE === 'host' ? 1 : -1;

for (let f = 0; f < frames; f++) {
  const view = computeView(canvas.width, canvas.height, 1.4);
  update(dt, view);
  // Driven AFTER the simulation, not through `input`. `update` calls
  // `pollInput()` itself, which folds the keyboard and gamepad into the input
  // vector and therefore zeroes anything written from outside — so a bot that
  // sets `input.x` moves nothing. What is under test here is position sync, so
  // the position is set directly and the velocity with it, which is what the
  // other client interpolates between.
  const a = (f / 30) * 0.8 * dir;
  S.player.x = Math.cos(a) * 150;
  S.player.y = Math.sin(a) * 150;
  S.player.vx = -Math.sin(a) * 120 * dir;
  S.player.vy = Math.cos(a) * 120 * dir;
  S.player.moving = true;
  tickCoop(dt);
  // Let the socket breathe: without yielding, nothing sent is ever flushed and
  // nothing received is ever read, and the whole run happens in a vacuum.
  if (f % 3 === 0) await new Promise((r) => setImmediate(r));
}

// Snapshotted BEFORE any final wait. The other client exits at roughly the same
// moment, and its disconnect legitimately removes it from this client's team —
// measuring after that would be measuring the teardown rather than the run.
const result = {
  role: ROLE,
  self: net.selfPlayerId(),
  host: session.isHost(),
  players: S.players.length,
  remoteSeen: S.players.filter((p) => p.remote).length,
  remoteMoved: S.players.filter((p) => p.remote && (p.x !== 0 || p.y !== 0)).length,
  enemies: S.enemies.length,
  assigned: S.enemies.filter((e) => e.owner).length,
  owned: S.enemies.filter((e) => e.owner === net.selfPlayerId()).length,
  kills: S.kills,
  seed: S.seed,
  msgs: session.netStats().sent + session.netStats().recv,
  ...assignCounts(),
  spawnedHere: S.nextEnemyId - 1,
};

await new Promise((r) => setTimeout(r, 150));
done(result);
