// ---------------------------------------------------------------------------
// hubNet.js — the others, walking around the Waystation.
//
// This is the same idea as src/net/session.js and deliberately a separate,
// much smaller piece of it. A run needs enemy ownership, damage events, death,
// level-ups and orphan adoption; a camp needs one thing — where everybody is.
// Folding the camp into the run's session would mean teaching that machinery
// about a mode with no enemies in it, so instead this borrows the one part it
// actually needs: send a position at a fixed rate, and draw the others BETWEEN
// the positions rather than at them.
//
// WHY INTERPOLATION, AGAIN.
//
// Positions arrive ten times a second and the screen redraws sixty. Drawing
// each one as it lands gives ten distinct positions a second, which does not
// look like a slow walk — it looks like a broken one. So each avatar is drawn
// a tenth of a second in the PAST, between the last two samples, which trades
// a delay nobody can see for movement everybody can.
//
// Nothing here is authoritative and nothing needs to be. If a packet is lost
// the avatar keeps walking to the last place it was told about and then stops,
// and the next packet corrects it. The worst outcome is a teammate who appears
// to hesitate, in a room where nothing is at stake.
// ---------------------------------------------------------------------------

import * as net from './connection.js';
import { GAME } from './protocol.js';
import { H } from '../game/hub.js';

/** Ten a second. A walking avatar does not need more, and this is a lobby. */
const SEND_HZ = 10;
const SEND_MS = 1000 / SEND_HZ;

/** How far behind live the others are drawn. One sample plus a little slack. */
const INTERP_MS = 120;

/** Drop a teammate whose updates stopped this long ago. */
const STALE_MS = 5000;

let sending = 0;
let joined = false;
const buffers = new Map();       // playerId -> [{ t, x, y, dir, moving }]

let off = null;

/** Start relaying our position, and listening for everyone else's. */
export function joinHubNet() {
  if (joined) return;
  joined = true;
  buffers.clear();
  H.others = [];
  // Subscribed here rather than in main.js: the run's session is already
  // listening to the same event, and each ignores what is not addressed to it.
  // Keeping the subscription next to the handler means there is one place where
  // this module is switched on and off.
  off = net.on('relay', handleHubRelay);
}

export function leaveHubNet() {
  joined = false;
  off?.();
  off = null;
  buffers.clear();
  H.others = [];
}

export const inHubNet = () => joined;

/**
 * Called every frame while the camp is on screen.
 *
 * Sends on a clock rather than on movement: a player who stops walking still
 * has to say so, or they freeze mid-stride on everyone else's screen.
 */
export function tickHubNet(dt) {
  if (!joined || !net.lobbyState()) return;
  sending += dt * 1000;
  if (sending >= SEND_MS) {
    sending = 0;
    const p = H.player;
    net.relay({
      t: GAME.HUB,
      x: Math.round(p.x),
      y: Math.round(p.y),
      d: p.dir,
      m: p.moving ? 1 : 0,
    });
  }
  interpolate();
  prune();
}

/** A relayed message arrived. Returns true if it was ours to handle. */
export function handleHubRelay(msg) {
  if (!joined || msg?.payload?.t !== GAME.HUB) return false;
  const from = msg.from;
  if (!from || from === net.selfPlayerId()) return true;

  const p = msg.payload;
  const list = buffers.get(from) || [];
  list.push({ t: performance.now(), x: p.x, y: p.y, dir: p.d, moving: !!p.m });
  // Two samples is all the interpolator reads; a third is kept as slack for a
  // frame that lands between packets. Anything older is history nobody wants.
  while (list.length > 3) list.shift();
  buffers.set(from, list);
  return true;
}

/**
 * Rebuild H.others from the buffers, positioned INTERP_MS in the past.
 *
 * The name and character come from the lobby, not from the position packets —
 * they never change while somebody is standing here, and sending them ten times
 * a second would triple the size of the one message this sends often.
 */
function interpolate() {
  const lobby = net.lobbyState();
  if (!lobby) { H.others = []; return; }
  const at = performance.now() - INTERP_MS;
  const out = [];

  for (const player of lobby.players) {
    if (player.id === net.selfPlayerId()) continue;
    const list = buffers.get(player.id);
    if (!list || !list.length) continue;

    let x, y, dir, moving;
    if (list.length === 1 || at <= list[0].t) {
      ({ x, y, dir, moving } = list[0]);
    } else {
      // Find the pair the requested moment sits between.
      let a = list[0], b = list[list.length - 1];
      for (let i = 0; i < list.length - 1; i++) {
        if (list[i].t <= at && at <= list[i + 1].t) { a = list[i]; b = list[i + 1]; break; }
      }
      const span = b.t - a.t;
      const k = span > 0 ? Math.min(1, (at - a.t) / span) : 1;
      x = a.x + (b.x - a.x) * k;
      y = a.y + (b.y - a.y) * k;
      dir = b.dir;
      moving = b.moving;
    }

    const prev = H.others.find((o) => o.id === player.id);
    out.push({
      id: player.id,
      name: player.name,
      charId: player.charId || 'ranger',
      x, y, dir: dir || 'south', moving,
      // The walk cycle is kept across frames so a teammate's legs do not reset
      // to standing every time a packet lands.
      anim: prev?.anim || 0,
      frame: prev?.frame || 0,
      sortY: y,
    });
  }
  H.others = out;
}

/** Forget anybody who stopped talking — a closed tab, or a dropped link. */
function prune() {
  const now = performance.now();
  for (const [id, list] of buffers) {
    if (now - list[list.length - 1].t > STALE_MS) buffers.delete(id);
  }
}
