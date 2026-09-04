// ---------------------------------------------------------------------------
// session.js — a co-op run, from the game's side of the wire.
//
// THE MODEL, because every decision below follows from it:
//
// Nothing is simulated on the server. Every client runs the whole game — all
// the enemies, all the collision, all the steering — using the same code the
// single-player game uses. What is split is OWNERSHIP: each creature belongs to
// exactly one client, and that client's copy is the one that counts.
//
// This is what makes hundreds of enemies possible at all. Pushing every
// creature's position from one authority to three others sixty times a second
// is thousands of updates a second before anything interesting happens. Instead
// each client predicts everything locally and receives a correction for the
// three quarters it does not own five times a second, then eases toward it.
//
// The split between what is corrected and what is announced follows how much a
// late message costs:
//
//   POSITION is continuous, sent on a slow tick, and gently corrected toward. A
//       missed update costs nothing: the next supersedes it and prediction
//       covered the gap.
//
//   DAMAGE, DEATH and PICKUPS happen once. They go out the moment they happen,
//       and the owner applies them in the order they arrive — which is also how
//       "who got the kill" settles itself without anyone arbitrating.
//
// Because this is co-operative there is no cheating to defend against and
// nothing needs to be exact. Two clients disagreeing about where a bat is by a
// few pixels is invisible, and that slack is what makes this achievable.
// ---------------------------------------------------------------------------

import * as net from './connection.js';
import { GAME } from './protocol.js';
import {
  S, damageEnemy, killEnemy, revivePlayer, downPlayer, showToast,
} from '../game/state.js';
import { seedRandom } from '../core/util.js';
import { setCoopScale } from '../game/config.js';

// How often the local player's transform goes out. Fast enough that a teammate
// at full speed is never more than a few pixels stale once interpolated, slow
// enough to be a rounding error on any connection.
const PLAYER_HZ = 18;
// Enemies go out far more slowly, because prediction is doing the work. The
// shipped version of this genre runs it as low as 1Hz once prediction is solid;
// five is a comfortable start with a lot of room to come down.
const ENEMY_HZ = 5;
// Remote players are drawn this far in the past, so there is always a pair of
// real samples to move between instead of extrapolating into a guess.
const INTERP_MS = 100;

let active = false;
let selfId = null;
let hostId = null;
let seq = 0;
let playerAcc = 0;
let enemyAcc = 0;
let nextOwner = 0;

const remotes = new Map();       // id -> ghost player (also present in S.players)
const stats = { sent: 0, recv: 0, owned: 0, since: 0, rate: 0, ping: 0, players: 0 };

/**
 * A one-line description of the run, for the F3 overlay.
 *
 * Built here rather than in the interface because these are the numbers you
 * tune the protocol against — how many creatures this client is answering for,
 * how much traffic that costs, and whether the two are still in proportion when
 * the crowd doubles.
 */
export function debugLines() {
  const owned = stats.owned;
  const total = S.enemies.length;
  const share = total ? Math.round((owned / total) * 100) : 0;
  return [
    `co-op   ${isHost() ? 'HOST' : 'peer'}  as ${selfId || '-'}`,
    `team    ${S.players.length}  (${[...remotes.values()].map((g) => g.name).join(', ') || 'alone'})`,
    `crowd   ${total} alive, ${owned} mine (${share}%)`,
    `msgs    ${stats.rate}/s   out ${stats.sent}  in ${stats.recv}`,
    `rates   player ${PLAYER_HZ}Hz  enemies ${ENEMY_HZ}Hz  lerp ${INTERP_MS}ms`,
  ];
}

export const isActive = () => active;
export const isHost = () => selfId === hostId;
export const netStats = () => stats;
export const localId = () => selfId;

function send(payload, to = null) {
  stats.sent++;
  net.relay(payload, to);
}

// ---------------------------------------------------------------------------
// Starting and stopping
// ---------------------------------------------------------------------------
/**
 * Turn a freshly started local run into a co-op run.
 *
 * The local player already exists — `startRun` built it — so this only adds the
 * others. Their stats are NOT recomputed here: a player's passives, meta
 * upgrades and character live on their own device, so their maximum health and
 * damage are things only they can know, and everything else takes their word
 * for it. With no competition to police, that is simply the cheapest correct
 * answer.
 */
export function beginSession({ seed, players, hostId: host, selfId: me }) {
  active = true;
  selfId = me;
  hostId = host;
  seq = 0;
  nextOwner = 0;
  remotes.clear();
  seedRandom(seed);

  S.player.netId = me;
  S.player.name = players.find((p) => p.id === me)?.name || 'You';
  S.players = [S.player];

  for (const p of players) {
    if (p.id === me) continue;
    const ghost = {
      netId: p.id, name: p.name, remote: true,
      x: 0, y: 0, vx: 0, vy: 0,
      hp: 100, maxHp: 100, level: 1, armor: 0,
      dir: 'south', frame: 0, animT: 0, moving: false,
      charId: p.charId || 'ranger',
      dead: false, downed: false, downTimer: 0, reviveProgress: 0,
      invuln: 0, hurtFlash: 0, kx: 0, ky: 0,
      buffer: [],
    };
    remotes.set(p.id, ghost);
    S.players.push(ghost);
  }
  setCoopScale(S.players.length);
  stats.since = (typeof performance !== 'undefined' ? performance.now() : Date.now());
}

export function endSession() {
  active = false;
  remotes.clear();
  S.players = S.player ? [S.player] : [];
  setCoopScale(1);
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------
/** Called once per frame from the game loop, after the simulation has run. */
export function tickSession(dt) {
  if (!active) return;
  const t = now();

  playerAcc += dt;
  if (playerAcc >= 1 / PLAYER_HZ) {
    playerAcc = 0;
    const p = S.player;
    send({
      t: GAME.PLAYER,
      x: Math.round(p.x), y: Math.round(p.y),
      vx: Math.round(p.vx), vy: Math.round(p.vy),
      hp: Math.round(p.hp), mx: Math.round(p.maxHp || p.hp),
      lv: p.level, d: p.dir, f: p.frame,
      m: p.moving ? 1 : 0, w: p.downed ? 1 : 0,
    });
  }

  enemyAcc += dt;
  if (enemyAcc >= 1 / ENEMY_HZ) {
    enemyAcc = 0;
    sendOwnedEnemies(t);
  }

  interpolate(t);

  if (t - stats.since > 1000) {
    stats.rate = stats.sent + stats.recv;
    stats.sent = 0;
    stats.recv = 0;
    stats.since = t;
  }
}

/**
 * One message for every creature this client owns, not one per creature.
 *
 * A busy screen is a couple of hundred enemies; a message each would be a
 * couple of hundred frames on the wire five times a second, and the per-message
 * overhead would dwarf the four numbers actually being sent. Flattened into one
 * array it is a single message carrying all of them.
 */
function sendOwnedEnemies(at) {
  const list = [];
  let owned = 0;
  for (const e of S.enemies) {
    if (e.owner !== selfId || e.dead) continue;
    owned++;
    list.push(e.netId, Math.round(e.x), Math.round(e.y), Math.round(e.hp));
  }
  stats.owned = owned;
  if (list.length) send({ t: GAME.ENEMIES, at, list });
}

/** A projectile is announced once and then flies itself on every client. */
export function reportShot(shot, weaponId) {
  if (!active) return;
  send({
    t: GAME.FIRE, w: weaponId,
    x: Math.round(shot.x), y: Math.round(shot.y),
    vx: Math.round(shot.vx), vy: Math.round(shot.vy),
    s: shot.size, dmg: Math.round(shot.dmg), k: shot.kind,
  });
}

/**
 * A hit landed here on a creature somebody else owns.
 *
 * The DELTA goes out, never the resulting health. Two players hitting the same
 * enemy in the same moment both send "minus forty" and the owner applies both.
 * If either sent "its health is now sixty" the second would erase the first and
 * the enemy would take half the damage it was actually dealt.
 */
export function reportDamage(enemy, delta) {
  if (!active || !enemy.owner || enemy.owner === selfId) return;
  send({ t: GAME.DAMAGE, id: enemy.netId, d: Math.round(delta) }, enemy.owner);
}

export function reportKill(enemy) {
  if (!active || enemy.owner !== selfId) return;
  send({ t: GAME.KILLED, id: enemy.netId, x: Math.round(enemy.x), y: Math.round(enemy.y) });
}

export function reportPickup(item) {
  if (active && item.netId !== undefined) send({ t: GAME.PICKUP, id: item.netId });
}

export function reportDowned(p) {
  if (active && p === S.player) send({ t: GAME.DOWNED, id: selfId });
}

export function reportRevive(p, by) {
  if (active) send({ t: GAME.REVIVED, id: p.netId, by: by ? by.netId : null });
}

/**
 * Deal newly spawned creatures out across the room, round robin.
 *
 * Only the host spawns. Letting every client spawn its own share sounds
 * symmetrical and is not: the random stream is shared, but the number of
 * creatures alive on each client is not identical at the moment of spawning, so
 * the sequences drift apart. One spawner and an explicit assignment cannot
 * drift.
 */
export function assignSpawns(spawned) {
  if (!active || !isHost() || !spawned.length) return;
  const ids = [selfId, ...remotes.keys()];
  const out = [];
  for (const e of spawned) {
    e.owner = ids[nextOwner % ids.length];
    nextOwner++;
    out.push({
      id: e.netId, ty: e.typeId, x: Math.round(e.x), y: Math.round(e.y),
      o: e.owner, el: e.eliteIndex === undefined ? -1 : e.eliteIndex,
    });
  }
  send({ t: GAME.ASSIGN, s: out });
}

// ---------------------------------------------------------------------------
// Receiving
// ---------------------------------------------------------------------------
export function handleRelay({ from, payload }) {
  if (!active || !payload) return;
  stats.recv++;

  switch (payload.t) {
    case GAME.PLAYER: {
      const g = remotes.get(from);
      if (!g) return;
      // Kept as a short history rather than applied straight away: drawing the
      // newest sample the instant it lands means a teammate jumping between
      // eighteen positions a second. Held back by INTERP_MS there is always a
      // sample either side of "now" to move between.
      g.buffer.push({ at: now(), x: payload.x, y: payload.y, vx: payload.vx, vy: payload.vy });
      if (g.buffer.length > 12) g.buffer.shift();
      g.hp = payload.hp;
      g.maxHp = payload.mx;
      g.level = payload.lv;
      g.dir = payload.d;
      g.frame = payload.f;
      g.moving = !!payload.m;
      g.downed = !!payload.w;
      return;
    }

    case GAME.ENEMIES: {
      for (let i = 0; i < payload.list.length; i += 4) {
        const e = byNetId(payload.list[i]);
        if (!e || e.owner === selfId) continue;
        // A correction is a TARGET, not a position. Snapping would make every
        // creature stutter five times a second on every screen but the owner's;
        // easing spends the difference over the next few frames unseen.
        e.netX = payload.list[i + 1];
        e.netY = payload.list[i + 2];
        e.hp = payload.list[i + 3];
      }
      return;
    }

    case GAME.ASSIGN:
      if (onAssign) onAssign(payload.s);
      return;

    case GAME.FIRE:
      if (onRemoteShot) onRemoteShot(payload, from);
      return;

    case GAME.DAMAGE: {
      const e = byNetId(payload.id);
      if (e && e.owner === selfId && !e.dead) damageEnemy(e, payload.d, { quiet: true });
      return;
    }

    case GAME.KILLED: {
      const e = byNetId(payload.id);
      if (e && !e.dead) killEnemy(e, { quiet: true });
      return;
    }

    case GAME.PICKUP: {
      const i = S.pickups.findIndex((it) => it.netId === payload.id);
      if (i >= 0) S.pickups.splice(i, 1);
      return;
    }

    case GAME.DOWNED: {
      const p = byNetPlayer(payload.id);
      if (p) downPlayer(p, true);
      return;
    }

    case GAME.REVIVED: {
      const p = byNetPlayer(payload.id);
      if (p) revivePlayer(p, byNetPlayer(payload.by), true);
      return;
    }

    case GAME.LEVELUP:
      if (onPause) onPause(payload.id, true);
      return;

    case GAME.RESUMED:
      if (onPause) onPause(payload.id, false);
      return;

    case GAME.ORPHANS:
      adoptOrphans(payload.owner);
      return;

    default:
  }
}

/**
 * A client left mid-run, and its share of the horde is now nobody's.
 *
 * Every remaining client runs the same rule over the same list and reaches the
 * same answer with no coordination: sort the survivors, deal the orphans out in
 * order. No election, no messages, and no window in which two clients both
 * believe they own the same creature.
 */
function adoptOrphans(goneId) {
  const gone = remotes.get(goneId);
  if (gone) {
    showToast(`${gone.name || 'A player'} disconnected`, '#ff9aa8', 3.4);
    remotes.delete(goneId);
    const i = S.players.indexOf(gone);
    if (i >= 0) S.players.splice(i, 1);
  }
  if (hostId === goneId) hostId = [selfId, ...remotes.keys()].sort()[0];

  setCoopScale(S.players.length);

  const ids = [selfId, ...remotes.keys()].sort();
  let n = 0;
  for (const e of S.enemies) {
    if (e.owner !== goneId) continue;
    e.owner = ids[n % ids.length];
    n++;
  }
}

const byNetId = (id) => S.enemies.find((e) => e.netId === id);
const byNetPlayer = (id) => (id === selfId ? S.player : remotes.get(id) || null);

// ---------------------------------------------------------------------------
// Interpolation and correction
// ---------------------------------------------------------------------------
/**
 * Move every remote player to where they were INTERP_MS ago, between the two
 * samples that straddle that moment. Running a tenth of a second behind is
 * invisible in a game where nobody shoots at each other, and it buys smooth
 * motion out of updates arriving eighteen times a second.
 */
function interpolate(t) {
  const at = t - INTERP_MS;
  for (const g of remotes.values()) {
    const b = g.buffer;
    if (b.length === 0) continue;
    if (b.length === 1) { g.x = b[0].x; g.y = b[0].y; continue; }

    let i = b.length - 1;
    while (i > 0 && b[i].at > at) i--;
    const a = b[i];
    const c = b[i + 1];
    if (!c) {
      // Past the newest sample: carry on at the last known velocity rather than
      // stopping dead. A teammate who freezes every time a packet is late looks
      // far worse than one who overshoots a little.
      const ahead = Math.min(0.25, (at - a.at) / 1000);
      g.x = a.x + a.vx * ahead;
      g.y = a.y + a.vy * ahead;
      continue;
    }
    const span = c.at - a.at;
    const k = span > 0 ? Math.max(0, Math.min(1, (at - a.at) / span)) : 0;
    g.x = a.x + (c.x - a.x) * k;
    g.y = a.y + (c.y - a.y) * k;
    g.vx = a.vx;
    g.vy = a.vy;
  }
}

/**
 * Ease every creature this client does NOT own toward its owner's last word.
 * Called from the game loop once the local simulation has moved everything.
 */
export function correctEnemies(dt) {
  if (!active) return;
  const k = 1 - Math.pow(0.0005, dt);          // most of the gap inside ~200ms
  for (const e of S.enemies) {
    if (e.owner === selfId || e.netX === undefined) continue;
    e.x += (e.netX - e.x) * k;
    e.y += (e.netY - e.y) * k;
  }
}

// ---------------------------------------------------------------------------
// Hooks the game layer fills in, and the level-up pause
// ---------------------------------------------------------------------------
let onAssign = null;
let onRemoteShot = null;
let onPause = null;

export function setSessionHooks(h) {
  onAssign = h.onAssign || null;
  onRemoteShot = h.onRemoteShot || null;
  onPause = h.onPause || null;
}

/**
 * Everyone stops while anyone is choosing an upgrade.
 *
 * The blocking version, which is what the shipped co-op of this genre does. The
 * alternative — only the chooser pauses — means someone picking a card while
 * three other people are still fighting, which either makes them invulnerable
 * for the duration or gets them killed by a screen they are not looking at.
 * Neither is better than everyone taking a breath together.
 */
export function announceLevelUp() {
  if (!active) return 0;
  seq++;
  send({ t: GAME.LEVELUP, seq, id: selfId });
  return seq;
}

export function announceResumed() {
  if (!active) return;
  seq++;
  send({ t: GAME.RESUMED, seq, id: selfId });
}
