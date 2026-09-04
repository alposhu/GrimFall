/*
 * Co-op server test — development only.
 *
 *   node tools/net-smoke.mjs
 *
 * Drives the real server over a real socket: it does the RFC 6455 handshake by
 * hand and speaks masked frames, which is what a browser does and what the
 * hand-rolled server in server/ws.js has to survive. Testing the room logic
 * alone would prove nothing about the part most likely to be wrong.
 */

import crypto from 'node:crypto';
import net from 'node:net';
import { MSG, normaliseCode, isCode } from '../src/net/protocol.js';

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

const { server } = await import('../server/index.js');
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

// --- a minimal browser-shaped client ---------------------------------------
function connect() {
  return new Promise((resolve) => {
    const socket = net.connect(PORT, '127.0.0.1');
    const key = crypto.randomBytes(16).toString('base64');
    const inbox = [];
    const waiters = [];
    let buf = Buffer.alloc(0);
    let upgraded = false;

    const client = {
      send(obj) {
        const body = Buffer.from(JSON.stringify(obj), 'utf8');
        const mask = crypto.randomBytes(4);
        let head;
        if (body.length < 126) { head = Buffer.alloc(2); head[1] = 0x80 | body.length; }
        else { head = Buffer.alloc(4); head[1] = 0x80 | 126; head.writeUInt16BE(body.length, 2); }
        head[0] = 0x81;                                  // FIN + text
        const masked = Buffer.from(body);
        for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];
        socket.write(Buffer.concat([head, mask, masked]));
      },
      next(type) {
        const hit = inbox.findIndex((m) => m.type === type);
        if (hit >= 0) return Promise.resolve(inbox.splice(hit, 1)[0]);
        return new Promise((res, rej) => {
          const timer = setTimeout(() => rej(new Error(`timed out waiting for ${type}`)), 3000);
          waiters.push({ type, res, timer });
        });
      },
      close() { socket.destroy(); },
    };

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const end = buf.indexOf('\r\n\r\n');
        if (end < 0) return;
        const head = buf.subarray(0, end).toString();
        const want = crypto.createHash('sha1')
          .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        check(head.includes('101'), 'handshake should return 101');
        check(head.includes(want), 'Sec-WebSocket-Accept must be the SHA-1 of key + GUID');
        buf = buf.subarray(end + 4);
        upgraded = true;
        resolve(client);
      }
      // Server frames are never masked, so parsing is the simple case.
      for (;;) {
        if (buf.length < 2) return;
        const op = buf[0] & 0x0f;
        let len = buf[1] & 0x7f;
        let off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        if (buf.length < off + len) return;
        const body = buf.subarray(off, off + len);
        buf = buf.subarray(off + len);
        if (op !== 0x1) continue;                        // ping/pong/close
        const msg = JSON.parse(body.toString('utf8'));
        const w = waiters.findIndex((x) => x.type === msg.type);
        if (w >= 0) { clearTimeout(waiters[w].timer); waiters.splice(w, 1)[0].res(msg); }
        else inbox.push(msg);
      }
    });

    socket.on('connect', () => {
      socket.write(
        `GET / HTTP/1.1\r\nHost: localhost:${PORT}\r\n`
        + 'Upgrade: websocket\r\nConnection: Upgrade\r\n'
        + `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
  });
}

// --- the actual checks ------------------------------------------------------
const host = await connect();
await host.next(MSG.WELCOME);
host.send({ type: MSG.CREATE, name: 'Alp' });
const made = await host.next(MSG.LOBBY);
check(isCode(made.code), `a room code should be well formed, got ${made.code}`);
check(made.players.length === 1, 'the creator should be the only player');
check(made.hostId === made.players[0].id, 'the creator should be host');
console.log(`handshake + room   ok (code ${made.code})`);

const guest = await connect();
await guest.next(MSG.WELCOME);
guest.send({ type: MSG.JOIN, code: made.code.toLowerCase(), name: 'Alp' });
const two = await guest.next(MSG.LOBBY);
check(two.players.length === 2, 'both players should be in the lobby');
check(two.players[1].name !== two.players[0].name, 'a duplicate name should be made distinct');
const seen = await host.next(MSG.LOBBY);
check(seen.players.length === 2, 'the host should be told about the join');
console.log(`join by code       ok (${two.players.map((p) => p.name).join(', ')})`);

guest.send({ type: MSG.JOIN, code: made.code, name: 'x' });
check((await guest.next(MSG.DENIED)).reason.length > 0, 'joining twice should be denied');
const stranger = await connect();
await stranger.next(MSG.WELCOME);
stranger.send({ type: MSG.JOIN, code: 'ZZZZ', name: 'nobody' });
check((await stranger.next(MSG.DENIED)).reason.includes('code'), 'an unknown code should be refused');
console.log(`bad requests       ok (refused, connection kept)`);

host.send({ type: MSG.START });
check((await host.next(MSG.DENIED)).reason.includes('ready'), 'starting before ready should be refused');
guest.send({ type: MSG.READY, ready: true });
await host.next(MSG.LOBBY);
guest.send({ type: MSG.START });
check((await guest.next(MSG.DENIED)).reason.includes('host'), 'only the host may start');
host.send({ type: MSG.START });
const started = await host.next(MSG.STARTED);
check(started.seed > 0, 'the run needs a shared seed');
check((await guest.next(MSG.STARTED)).seed === started.seed, 'every client must get the SAME seed');
console.log(`ready + start      ok (seed ${started.seed})`);

guest.close();
await new Promise((r) => setTimeout(r, 120));
const afterLeave = await host.next(MSG.LOBBY);
check(afterLeave.players.length === 1, 'a dropped player should leave the lobby');
console.log(`disconnect         ok (lobby shrank to ${afterLeave.players.length})`);

host.close(); stranger.close();
await new Promise((r) => setTimeout(r, 60));

// --- where the client decides to connect --------------------------------
// The rule that makes playing on one wifi work with no setup, and the rule that
// stops a real deployment silently trying to reach a machine in someone's
// living room. Worth pinning down, because getting it wrong fails silently in
// a browser console nobody is looking at.
{
  const cases = [
    ['http:', 'localhost', '', 'ws://localhost:5174', 'on your own machine'],
    ['http:', '192.168.0.17', '', 'ws://192.168.0.17:5174', 'a friend on the same wifi'],
    ['https:', 'alposhu.github.io', '', '', 'a real deployment with no server configured'],
    ['https:', 'alposhu.github.io', 'wss://play.example.com', 'wss://play.example.com', 'a real deployment that has one'],
    ['https:', 'html.itch.zone', 'https://play.example.com', 'wss://play.example.com', 'an https address is upgraded to wss'],
  ];
  for (const [protocol, hostname, meta, want, why] of cases) {
    globalThis.location = { protocol, hostname, origin: `${protocol}//${hostname}` };
    globalThis.document = { querySelector: () => (meta ? { getAttribute: () => meta } : null) };
    globalThis.localStorage = { getItem: () => '', setItem() {} };
    const cfg = await import(`../src/net/config.js?case=${encodeURIComponent(why)}`);
    const got = cfg.serverUrl();
    check(got === want, `${why}: expected "${want}", got "${got}"`);
  }
  console.log('address rules     ok (5 cases)');
}

// --- the real client module, twice -----------------------------------------
// This is the acceptance check for Phase 1 — two independent clients in one
// room, each seeing the other — run against the same src/net/connection.js the
// browser loads rather than a stand-in.
//
// Two instances of a module that holds one socket in module scope come from
// importing it under two specifiers; the query string is ignored by the loader
// but makes the cache keys differ. Node 22 and up ships a real WebSocket, so
// the transport underneath is the browser's, not a mock.
//
// It is done here rather than in a headless browser on purpose. Chrome's
// `--virtual-time-budget` races its clock forward whenever a timer is pending,
// which fires the client's own connection timeout long before a real handshake
// completes — the test fails while the product works. Real time, real sockets,
// no clock games.
globalThis.localStorage = { getItem: () => `ws://127.0.0.1:${PORT}`, setItem() {} };

const A = await import(`../src/net/connection.js?instance=a`);
const B = await import(`../src/net/connection.js?instance=b`);
check(A !== B, 'the two client instances must not be the same module');

const once = (mod, event) => new Promise((res, rej) => {
  const timer = setTimeout(() => rej(new Error(`no ${event} arrived`)), 3000);
  const off = mod.on(event, (p) => { clearTimeout(timer); off(); res(p); });
});

await A.connect();
check(A.connectionStatus() === 'online', 'client A should report itself online');
let lobbyA = once(A, 'lobby');
A.createGame('Alp');
const room = await lobbyA;
check(A.isHost(), 'the client that created the room should know it is host');

await B.connect();
const lobbyB = once(B, 'lobby');
lobbyA = once(A, 'lobby');
B.joinGame(room.code, 'Ece');
const bSees = await lobbyB;
const aSees = await lobbyA;
check(bSees.players.length === 2, 'the joining client should see both players');
check(aSees.players.length === 2, 'the hosting client should see both players');
check(!B.isHost(), 'the joining client must not think it is the host');
check(A.selfPlayerId() !== B.selfPlayerId(), 'the two clients must have different ids');
console.log(`two clients        ok (${aSees.players.map((p) => p.name).join(' + ')} in ${room.code})`);

lobbyA = once(A, 'lobby');
B.setReady(true);
const readied = await lobbyA;
check(readied.players.find((p) => p.id === B.selfPlayerId()).ready, 'ready should reach the other client');

const startedA = once(A, 'started');
const startedB = once(B, 'started');
A.startGame();
const runA = await startedA;
const runB = await startedB;
check(runA.seed === runB.seed, 'both clients must start the same world');
console.log(`shared start       ok (seed ${runA.seed} on both)`);

A.disconnect();
B.disconnect();
await new Promise((r) => setTimeout(r, 60));
server.close();

if (problems.length) {
  console.error('\nFAILED:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('\nCo-op server healthy.');
