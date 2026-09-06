// ---------------------------------------------------------------------------
// protocol.js — the wire contract, shared verbatim by the browser and the
// server. Both are ES modules, so this is imported by each rather than written
// down twice; a message name that only exists on one side is the classic way a
// hand-rolled protocol rots.
//
// PHASE 1 covers connection and lobby only. Player, enemy and world sync land
// in later phases and will extend MSG rather than replace it.
// ---------------------------------------------------------------------------

/** Bumped whenever a message's shape changes incompatibly. */
export const PROTOCOL_VERSION = 1;

export const MSG = {
  // --- client -> server ---
  CREATE: 'create',            // { name }            -> make a room, become host
  JOIN: 'join',                // { code, name }      -> join an existing room
  READY: 'ready',              // { ready }           -> toggle own ready flag
  START: 'start',              // {}                  -> host only, begin the run
  LEAVE: 'leave',              // {}                  -> deliberate exit
  PONG: 'pong',                // {}                  -> answer to a heartbeat
  RECODE: 'recode',            // {}                  -> host only, new code
  CHAT: 'chat',                // { text }            -> say something to the room
  VOICE: 'voice',              // { on }              -> mic on or off
  SIGNAL: 'signal',            // { to, data }        -> WebRTC offer/answer/ice
  SETTINGS: 'settings',        // { difficulty }      -> host only, terms of the run

  // Gameplay travels inside ONE message type. The server does not read it, does
  // not validate it and has no schema for it: it stamps who sent it and passes
  // it to the rest of the room. Everything authoritative about a co-op run
  // already lives on the clients — each owns its own character and a share of
  // the horde — so a server that understood the payload could not do anything
  // useful with that understanding, and would have to be redeployed every time
  // the game changed. This way the wire format is the clients' business.
  RELAY: 'relay',              // { to?, payload } -> { from, payload }

  // --- server -> client ---
  WELCOME: 'welcome',          // { selfId, version }
  LOBBY: 'lobby',              // { code, hostId, players[] }  — the whole list
  STARTED: 'started',          // { seed, difficulty, players[] }
  DENIED: 'denied',            // { reason }          — a request that cannot stand
  PING: 'ping',                // {}                  -> heartbeat
  SAID: 'said',                // { from, name, text, at }  — one chat line
  HISTORY: 'history',          // { lines[] }         — the backlog, on arrival
};

/**
 * The longest thing anyone may say at once.
 *
 * Enforced on the SERVER as well as in the input's maxlength, because the
 * client is a browser and the browser is not ours: the field is a courtesy to
 * honest players, and the check in rooms.js is the one that actually holds.
 */
export const MAX_CHAT = 200;

/** How much backlog a room keeps, so someone joining sees what was said. */
export const CHAT_HISTORY = 40;

/**
 * Room codes are read aloud and typed by hand, so the alphabet drops every
 * character that is hard to tell from another ONE IN THIS FONT — which is not
 * the same list as the usual one, and was settled by rendering the whole set in
 * Pixelify Sans at the size the lobby actually uses and looking at it.
 *
 * Out: I, L and 1, which collapse into a single stroke; O and 0, the usual
 * offenders; and Z and S, because Pixelify Sans draws Z almost exactly like 2
 * and S almost exactly like 5. That last pair is invisible in a code font list
 * and obvious on screen — a hosted code reading "VAZG" was being read back as
 * "VA2G". B/8, G/6, U/V, T/7 and E/3 were checked the same way and are all
 * clearly distinct here, so they stay.
 *
 * Twenty-nine characters over four places is 707,281 codes, far more than this
 * game will ever hold open at once.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRTUVWXY23456789';
export const CODE_LENGTH = 4;

/**
 * Fold typed input into the alphabet.
 *
 * Every excluded character maps to the one it is most often confused WITH, and
 * each substitution lands on a character that is itself in the alphabet — so
 * nothing maps twice. An earlier version chained (S became 5, then 5 became X)
 * which silently turned a correctly-typed code into a different one: the worst
 * possible failure here, because it reads as "that room does not exist".
 */
const CONFUSABLE = { I: 'J', L: 'J', 1: 'J', O: 'Q', 0: 'Q', Z: '2', S: '5' };

export function normaliseCode(raw) {
  return [...String(raw || '').toUpperCase()]
    .map((c) => CONFUSABLE[c] || c)
    .filter((c) => CODE_ALPHABET.includes(c))
    .slice(0, CODE_LENGTH)
    .join('');
}

export const isCode = (s) => typeof s === 'string'
  && s.length === CODE_LENGTH
  && [...s].every((c) => CODE_ALPHABET.includes(c));

/** Trim a display name to something that fits a lobby row and is not blank. */
export function cleanName(raw, fallback = 'Player') {
  const n = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return n || fallback;
}

export const MAX_PLAYERS = 4;

/**
 * What travels inside a relay payload. These are the game's own messages, and
 * the split follows how much a late or lost one costs:
 *
 *   STATE is sent continuously and is safe to miss — the next one supersedes it,
 *   and clients predict between them, so dropping one costs a few pixels.
 *
 *   Everything else happens ONCE. A missed death leaves a corpse walking; a
 *   missed level-up leaves one player paused while the others play on. They go
 *   out immediately rather than on the next tick.
 */
export const GAME = {
  PLAYER: 'p',                 // { x, y, vx, vy, hp, maxHp, level, dir, frame, moving, downed }
  ENEMIES: 'e',                // { at, list: [id, x, y, hp, targetId] } — the owner's batch
  ASSIGN: 'a',                 // { spawns: [{ id, type, x, y, owner, elite, champion }] }
  FIRE: 'f',                   // { weapon, x, y, dx, dy, speed, size, dmg, evolved }
  DAMAGE: 'd',                 // { id, delta, from } — sent TO the owner
  KILLED: 'k',                 // { id, x, y } — the owner's verdict
  PICKUP: 'u',                 // { id }
  DOWNED: 'w',                 // { id }
  REVIVED: 'v',                // { id, by }
  LEVELUP: 'l',                // { seq, id } — everyone pauses
  RESUMED: 'r',                // { seq, id }
  ORPHANS: 'o',                // { owner } — a client is gone, take its enemies
  // The lobby camp, not the run. Its own type because it is sent while the
  // room is still in the lobby, when none of the above mean anything yet.
  HUB: 'h',                    // { x, y, d, m } — where somebody is standing
};
