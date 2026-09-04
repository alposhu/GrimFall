// ---------------------------------------------------------------------------
// rooms.js — the lobby model. No sockets in here: a room is a plain object
// with players in it, and index.js is the only thing that knows how a message
// arrives. That split is what lets the whole thing be tested without opening a
// port (see tools/net-smoke.mjs).
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';
import { CODE_ALPHABET, CODE_LENGTH, MAX_PLAYERS, cleanName } from '../src/net/protocol.js';

/** A lobby nobody has touched in this long is swept, so codes stay reusable. */
const IDLE_MS = 30 * 60 * 1000;

const rooms = new Map();          // code -> Room

/**
 * Codes are drawn from crypto rather than Math.random. They are the only thing
 * standing between a private game and a stranger walking into it, and a
 * predictable four-character code is not a code at all.
 */
function freshCode() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (!rooms.has(code)) return code;
  }
  return null;                    // 200 collisions means the space is full
}

let nextPlayer = 1;

export function createRoom(name) {
  const code = freshCode();
  if (!code) return { error: 'the server is full' };
  const room = {
    code,
    hostId: null,
    players: new Map(),           // id -> { id, name, ready, charId }
    started: false,
    seed: 0,
    difficulty: 'normal',
    touched: Date.now(),
  };
  rooms.set(code, room);
  const player = addPlayer(room, name);
  room.hostId = player.id;
  return { room, player };
}

export function joinRoom(rawCode, name) {
  const room = rooms.get(rawCode);
  if (!room) return { error: 'no game with that code' };
  // Mid-run joining is out of scope for v1 — a player arriving into a live
  // simulation would need the whole world shipped to them, which is a different
  // and much larger feature than joining a lobby.
  if (room.started) return { error: 'that game has already started' };
  if (room.players.size >= MAX_PLAYERS) return { error: 'that game is full' };
  return { room, player: addPlayer(room, name) };
}

function addPlayer(room, name) {
  const id = `p${nextPlayer++}`;
  const taken = new Set([...room.players.values()].map((p) => p.name));
  let display = cleanName(name, `Player ${room.players.size + 1}`);
  // Two people called "Alp" in one lobby is a support question waiting to
  // happen, so the second becomes "Alp (2)".
  if (taken.has(display)) {
    let n = 2;
    while (taken.has(`${display} (${n})`)) n++;
    display = `${display} (${n})`;
  }
  const player = { id, name: display, ready: false, charId: null };
  room.players.set(id, player);
  room.touched = Date.now();
  return player;
}

/** Remove a player; returns whether the room still exists afterwards. */
export function leaveRoom(room, playerId) {
  if (!room || !room.players.has(playerId)) return false;
  room.players.delete(playerId);
  room.touched = Date.now();

  if (room.players.size === 0) {
    rooms.delete(room.code);
    return false;
  }
  // The host leaving BEFORE the run starts just promotes whoever is next —
  // nothing has been simulated yet, so there is nothing to migrate. Host loss
  // during a run is a different problem and is deliberately not solved here.
  if (room.hostId === playerId) room.hostId = room.players.keys().next().value;
  return true;
}

export function setReady(room, playerId, ready) {
  const p = room?.players.get(playerId);
  if (!p) return false;
  p.ready = !!ready;
  room.touched = Date.now();
  return true;
}

/**
 * Begin. Only the host may, everyone must be ready, and the seed is decided
 * HERE and shipped to every client — the world has to be the same world, and
 * each client rolling its own would generate a different map.
 */
export function startRoom(room, playerId) {
  if (!room) return { error: 'no room' };
  if (room.hostId !== playerId) return { error: 'only the host can start' };
  if (room.started) return { error: 'already started' };
  const everyone = [...room.players.values()];
  if (everyone.length < 2) return { error: 'co-op needs at least two players' };
  if (!everyone.every((p) => p.ready || p.id === room.hostId)) {
    return { error: 'not everyone is ready' };
  }
  room.started = true;
  room.seed = crypto.randomInt(1, 2 ** 30);
  room.touched = Date.now();
  return { room };
}

/** The shape sent to clients — never the internal object, never the sockets. */
export function lobbyState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    started: room.started,
    players: [...room.players.values()].map((p) => ({
      id: p.id, name: p.name, ready: p.ready, charId: p.charId,
    })),
  };
}

export function sweepIdle(now = Date.now()) {
  let swept = 0;
  for (const [code, room] of rooms) {
    if (now - room.touched > IDLE_MS) { rooms.delete(code); swept++; }
  }
  return swept;
}

export const roomCount = () => rooms.size;
export const getRoom = (code) => rooms.get(code);
/** Test seam: drop every room so one suite cannot leak state into the next. */
export function resetRooms() { rooms.clear(); nextPlayer = 1; }
