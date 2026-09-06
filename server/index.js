#!/usr/bin/env node
/*
 * Grimfall co-op server — Phase 1: connection and lobby.
 *
 *   node server/index.js                 -> ws://localhost:5174
 *   PORT=8080 node server/index.js
 *
 * No dependencies, matching the rest of the project. It speaks WebSocket by
 * hand (server/ws.js) and holds rooms in memory (server/rooms.js).
 *
 * DEPLOYMENT. This is the one piece of Grimfall that cannot be a static file,
 * so it does not live on itch.io or GitHub Pages with the rest of the game —
 * it needs a host that runs Node (Fly, Railway, Render, or a box you own). The
 * game stays static and simply connects out to wherever this ends up; see
 * `src/net/config.js` for how the client is told the address, and note that a
 * build will not be allowed to connect anywhere the CSP has not been told
 * about (tools/build.mjs, GRIMFALL_SERVER).
 *
 * In-memory state is deliberate at this size: a lobby is worthless the moment
 * the people in it have gone, so there is nothing here worth a database.
 */

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { accept } from './ws.js';
import {
  createRoom, joinRoom, leaveRoom, setReady, startRoom,
  lobbyState, sweepIdle, roomCount, getRoom, resetRooms,
  recodeRoom, setVoice, say, announce, chatHistory, setSettings,
} from './rooms.js';
import { MSG, PROTOCOL_VERSION, normaliseCode } from '../src/net/protocol.js';
import { findRoot, serveStatic } from './static.js';

const PORT = Number(process.env.PORT) || 5174;

/**
 * Every address this machine can be reached at from the local network.
 *
 * Loopback and link-local are skipped: `127.0.0.1` is the one address that is
 * guaranteed NOT to work for anybody else, and handing it out is the classic
 * way a first attempt at this fails.
 */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      if (n.family !== 'IPv4' || n.internal) continue;
      if (n.address.startsWith('169.254.')) continue;
      out.push(n.address);
    }
  }
  return out;
}

// A dead socket looks exactly like an idle one until you ask it something.
const HEARTBEAT_MS = 15000;

/** conn -> { room, playerId } */
const sessions = new Map();

function send(conn, type, data = {}) { conn.send({ type, ...data }); }

function deny(conn, reason) { send(conn, MSG.DENIED, { reason }); }

/** Send one message to everybody in a room. */
function toRoom(room, message) {
  if (!room) return;
  for (const [c, s] of sessions) if (s.room === room) c.send(message);
}

/** Push a chat line — from a player or from the server itself — to the room. */
function sayToRoom(room, line) {
  if (!line) return;
  toRoom(room, { type: MSG.SAID, ...line });
}

/** Push the current lobby to everyone still in the room. */
function broadcastLobby(room) {
  if (!room) return;
  const state = lobbyState(room);
  for (const [conn, s] of sessions) {
    if (s.room === room) send(conn, MSG.LOBBY, state);
  }
}

function handle(conn, msg) {
  const session = sessions.get(conn);
  if (!session) return;
  const type = msg && msg.type;

  // Everything except creating and joining requires already being in a room,
  // so that check happens once here rather than in every branch below.
  if (type !== MSG.CREATE && type !== MSG.JOIN && !session.room) {
    if (type !== MSG.PONG) deny(conn, 'not in a game');
    return;
  }

  switch (type) {
    case MSG.CREATE: {
      if (session.room) { deny(conn, 'already in a game'); return; }
      const { room, player, error } = createRoom(msg.name);
      if (error) { deny(conn, error); return; }
      session.room = room;
      session.playerId = player.id;
      broadcastLobby(room);
      return;
    }

    case MSG.JOIN: {
      if (session.room) { deny(conn, 'already in a game'); return; }
      const code = normaliseCode(msg.code);
      const { room, player, error } = joinRoom(code, msg.name);
      if (error) { deny(conn, error); return; }
      session.room = room;
      session.playerId = player.id;
      // The backlog goes to the newcomer BEFORE the arrival is announced, so
      // they do not read that they themselves have arrived.
      send(conn, MSG.HISTORY, { lines: chatHistory(room) });
      sayToRoom(room, announce(room, `${player.name} joined.`));
      broadcastLobby(room);
      return;
    }

    case MSG.READY:
      setReady(session.room, session.playerId, msg.ready);
      broadcastLobby(session.room);
      return;

    case MSG.START: {
      const { room, error } = startRoom(session.room, session.playerId);
      if (error) { deny(conn, error); return; }
      const payload = {
        seed: room.seed,
        difficulty: room.difficulty,
        ...lobbyState(room),
      };
      for (const [c, s] of sessions) {
        if (s.room === room) send(c, MSG.STARTED, payload);
      }
      return;
    }

    case MSG.RELAY: {
      // Stamped and forwarded, never inspected. `to` addresses one player —
      // a damage delta only concerns the client that owns the creature, and
      // sending it to the whole room would be three wasted messages out of
      // four in a full game.
      const out = { type: MSG.RELAY, from: session.playerId, payload: msg.payload };
      for (const [c, sn] of sessions) {
        if (sn.room !== session.room || c === conn) continue;
        if (msg.to && sn.playerId !== msg.to) continue;
        c.send(out);
      }
      return;
    }

    case MSG.RECODE: {
      const { room, error } = recodeRoom(session.room, session.playerId);
      if (error) { deny(conn, error); return; }
      sayToRoom(room, announce(room, 'The game code changed.'));
      broadcastLobby(room);
      return;
    }

    case MSG.CHAT: {
      // Allowed during a run as well as in the lobby. Being able to say "go
      // left" while something is chasing you is most of the point.
      sayToRoom(session.room, say(session.room, session.playerId, msg.text));
      return;
    }

    case MSG.SETTINGS: {
      const { room, error } = setSettings(session.room, session.playerId, msg);
      if (error) { deny(conn, error); return; }
      sayToRoom(room, announce(room, `The run is set to ${room.difficulty}.`));
      broadcastLobby(room);
      return;
    }

    case MSG.VOICE: {
      setVoice(session.room, session.playerId, msg.on);
      broadcastLobby(session.room);
      return;
    }

    case MSG.SIGNAL: {
      // WebRTC offers, answers and ICE candidates, forwarded blind. The server
      // is not part of the call and never sees the audio — it only introduces
      // two browsers to each other, after which they talk directly.
      if (!msg.to) return;
      const out = { type: MSG.SIGNAL, from: session.playerId, data: msg.data };
      for (const [c, sn] of sessions) {
        if (sn.room === session.room && sn.playerId === msg.to) c.send(out);
      }
      return;
    }

    case MSG.LEAVE:
      dropSession(conn);
      return;

    case MSG.PONG:
      conn.alive = true;
      return;

    default:
      deny(conn, `unknown message: ${String(type).slice(0, 24)}`);
  }
}

function dropSession(conn) {
  const session = sessions.get(conn);
  if (!session) return;
  sessions.delete(conn);
  const { room, playerId } = session;
  if (!room) return;
  const started = room.started;
  const who = room.players.get(playerId)?.name;
  if (!leaveRoom(room, playerId)) return;
  if (!started && who) sayToRoom(room, announce(room, `${who} left.`));
  if (started) {
    // Mid-run: the lobby list is no longer what anyone is looking at, but the
    // enemies that client was simulating are now nobody's. The remaining
    // clients are told whose, and settle ownership among themselves.
    const notice = { type: MSG.RELAY, from: playerId, payload: { t: 'o', owner: playerId } };
    for (const [c, sn] of sessions) if (sn.room === room) c.send(notice);
  }
  broadcastLobby(room);
}

// If the game has been built, this process serves it too — see server/static.js
// for why that is worth doing. With no build present it is co-op only, exactly
// as it was.
const WEB_ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));

const server = http.createServer((req, res) => {
  // A plain GET is almost always a person checking the thing is alive, or a
  // platform's health probe. Both deserve an answer that is not a stack trace.
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: roomCount(), players: sessions.size, game: !!WEB_ROOT }));
    return;
  }
  if (serveStatic(WEB_ROOT, req, res)) return;
  res.writeHead(426, { 'content-type': 'text/plain' });
  res.end('Grimfall co-op server — connect over WebSocket.\n');
});

server.on('upgrade', (req, socket) => {
  const conn = accept(req, socket);
  if (!conn) return;
  sessions.set(conn, { room: null, playerId: null });
  send(conn, MSG.WELCOME, { version: PROTOCOL_VERSION });
  conn.on('message', (msg) => handle(conn, msg));
  conn.on('close', () => dropSession(conn));
});

// Heartbeat: anything that fails to answer a ping between sweeps is gone,
// whether or not the TCP connection has noticed yet. Laptops that sleep and
// phones that lock produce exactly this — a socket that is open and dead.
const beat = setInterval(() => {
  for (const conn of [...sessions.keys()]) {
    if (!conn.alive) { conn.close(1001, 'no answer'); dropSession(conn); continue; }
    conn.alive = false;
    conn.ping();
    send(conn, MSG.PING);
  }
  sweepIdle();
}, HEARTBEAT_MS);
beat.unref?.();

export { server, sessions, handle, dropSession, resetRooms, getRoom };

// Only listen when run directly, so the smoke test can import the routing
// without opening a port. Compared as resolved paths rather than by matching
// URL text: on Windows argv[1] arrives with backslashes and import.meta.url is
// a file:// URL, and no amount of string trimming reconciles those two safely.
const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entry && entry === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    console.log(`
  Grimfall co-op server on ws://localhost:${PORT}`);
    // The address a friend on the same wifi types. Printing it is the whole
    // difference between "run this and tell them your IP" and someone hunting
    // through network settings for a number they have never needed before.
    // The address to hand out depends on who is serving the game. When this
    // process is (a built dist/ is present) it is this port; otherwise the
    // game is on the dev server's and this is only the socket. Printing the
    // wrong one sends people to a port with nothing listening on it.
    const gamePort = WEB_ROOT ? PORT : 5173;
    for (const addr of lanAddresses()) {
      console.log(`  friends on this network:  http://${addr}:${gamePort}`);
    }
    if (WEB_ROOT) console.log('  serving the built game from this address too');
    console.log(`  health: http://localhost:${PORT}/health
`);
  });
}
