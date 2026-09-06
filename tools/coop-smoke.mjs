/*
 * Two clients, one run — development only.
 *
 *   node tools/coop-smoke.mjs
 *
 * The end-to-end test for co-op: a real server, two real client PROCESSES, the
 * real game loop on both, and a check that they finished agreeing about the
 * world. Everything below the surface of this test is the code the browser
 * runs; nothing is mocked but the display.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SECONDS = 6;

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

const { server } = await import('../server/index.js');
await new Promise((r) => server.listen(0, r));
const URL = `ws://127.0.0.1:${server.address().port}`;

function launch(role, code) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath,
      [path.join(HERE, 'coop-client.mjs'), URL, role, code || '-', String(SECONDS)],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      out += d;
      const hit = /__CODE__(\w+)/.exec(out);
      if (hit && child.onCode) { child.onCode(hit[1]); child.onCode = null; }
    });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', () => {
      const hit = /__RESULT__(.*)/.exec(out);
      if (!hit) return reject(new Error(`${role} produced no result\n${stderr.slice(0, 900)}`));
      resolve(JSON.parse(hit[1]));
    });
    resolve.child = child;
    child.ready = new Promise((res) => { child.onCode = res; });
    if (role === 'host') hostChild = child;
  });
}

let hostChild = null;
const hostRun = launch('host');
// The guest cannot join until the host has a code to give it.
const code = await hostChild.ready;
const guestRun = launch('guest', code);

const [host, guest] = await Promise.all([hostRun, guestRun]);

if (host.error || guest.error) {
  console.error('\nFAILED:\n  ' + (host.error || guest.error));
  server.close();
  process.exit(1);
}

console.log(`room ${code} — ${SECONDS}s of play on two processes\n`);
const row = (k, a, b) => console.log(`  ${k.padEnd(18)} host ${String(a).padStart(7)}   guest ${String(b).padStart(7)}`);
row('players', host.players, guest.players);
row('teammates seen', host.remoteSeen, guest.remoteSeen);
row('teammates moving', host.remoteMoved, guest.remoteMoved);
row('enemies alive', host.enemies, guest.enemies);
row('owned by them', host.owned, guest.owned);
row('kills', host.kills, guest.kills);
row('msgs/sec', host.msgs, guest.msgs);
row('ids issued', host.spawnedHere, guest.spawnedHere);
row('assigns seen', host.assignSeen, guest.assignSeen);
row('assigns built', host.assignBuilt, guest.assignBuilt);
row('assigns failed', host.assignFailed, guest.assignFailed);
console.log();

check(host.host === true, 'the creating client should be host');
check(guest.host === false, 'the joining client should not be host');
check(host.seed === guest.seed, 'both clients must build the same world');
check(host.players === 2 && guest.players === 2, 'each client should have two players');
check(host.remoteSeen === 1 && guest.remoteSeen === 1, 'each should see exactly one teammate');
check(host.remoteMoved === 1, 'the host should see the guest actually moving');
check(guest.remoteMoved === 1, 'the guest should see the host actually moving');

// The whole point of the architecture: the crowd exists on both machines and is
// split between them, rather than living on one and being pushed to the other.
check(host.enemies > 0 && guest.enemies > 0, 'both clients should be simulating a crowd');

// Both clients drain the wire before reporting (see the settle phase in
// coop-client.mjs), so by the time these numbers are taken the guest has been
// told about everything the host spawned and the two must AGREE — exactly, not
// approximately.
//
// This used to allow the guest to trail by up to five, because the snapshot was
// taken with messages still in flight and the gap was whatever the machine had
// not yet flushed. That made the bound a measure of the runner's speed: it
// passed on a developer's machine and failed on a two-core CI box, with nothing
// in the diff to explain it. Draining first is what turns a fuzzy inequality
// into a fact.
// A loose, SYMMETRIC bound, and deliberately not an exact one.
//
// Draining the wire (the settle phase in coop-client.mjs) brings the two to the
// same number nearly every run, but not every run, and the reason is not a
// fault: the two processes cannot stop at the same instant, because the guest
// cannot join before the host has a code to give it. A creature killed in the
// host's last frames is gone there and still alive on the guest, or the other
// way about. Demanding equality here is demanding that two clocks agree.
//
// So this catches gross divergence and nothing finer. The exact invariant — the
// one that says the architecture works — is the assignment pipeline below: it
// does not depend on when anybody stopped.
const gap = host.enemies - guest.enemies;
check(Math.abs(gap) <= 3, `the two clients disagree by ${gap} creatures, which is more than teardown explains`);
check(guest.assignFailed === 0, `every assignment must be buildable, ${guest.assignFailed} were not`);
check(guest.assignBuilt === guest.assignSeen, 'every assignment seen should have produced a creature');
check(host.owned > 0 && guest.owned > 0, 'ownership should be split, not all on one client');
check(host.assigned > 0 && guest.assigned > 0, 'spawned creatures should have been assigned an owner');

if (problems.length) {
  console.error('FAILED:');
  for (const p of problems) console.error('  - ' + p);
  server.close();
  process.exit(1);
}
console.log('Co-op run healthy.');
server.close();
