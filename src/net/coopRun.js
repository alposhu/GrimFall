// ---------------------------------------------------------------------------
// coopRun.js — the seam between a co-op session and the running game.
//
// session.js knows the wire. game.js knows the simulation. Neither imports the
// other, and this is the only file that knows both — so single player never
// loads a line of networking, and the netcode can be reasoned about without
// reading the game.
//
// It exists because almost every hook here is a one-line translation between
// the two vocabularies ("a creature was hit" -> "tell its owner"), and scattering
// twenty of those through the game modules would bury the model.
// ---------------------------------------------------------------------------

import * as net from './connection.js';
import * as session from './session.js';
import { S, netBridge, spawnShot } from '../game/state.js';
import { setRemoteCollectHandler } from '../game/game.js';
import { setSpawnAuthority, setSpawnListener, makeEnemyFromNet } from '../game/enemies.js';

let wired = false;
export let assignSeen = 0, assignBuilt = 0, assignFailed = 0;
export const assignCounts = () => ({ assignSeen, assignBuilt, assignFailed });

/**
 * Start a networked run. `startRun` has already built the local player and the
 * world; this only attaches the others and the wiring.
 */
export function startCoopRun(started, selfId) {
  session.beginSession({
    seed: started.seed,
    players: started.players,
    hostId: started.hostId,
    selfId,
  });

  // Reporting hooks. Each is the same shape: something happened locally, and
  // exactly one other party needs to hear about it.
  netBridge.onShotFired = (shot) => session.reportShot(shot, shot.kind);
  netBridge.onEnemyDamaged = (e, delta) => session.reportDamage(e, delta);
  netBridge.onEnemyKilled = (e) => session.reportKill(e);
  netBridge.onPlayerDowned = (p) => session.reportDowned(p);
  netBridge.onPlayerRevived = (p, by) => session.reportRevive(p, by);
  netBridge.ownedHere = (e) => e.owner === session.localId();

  // A pickup taken by a teammate: the object goes, the contents do not come
  // here. Their client awards it to them.
  setRemoteCollectHandler((item) => session.reportPickup(item));

  // Only the host runs the spawner, and it deals each wave out as it arrives.
  setSpawnAuthority(() => session.isHost());
  setSpawnListener((fresh) => session.assignSpawns(fresh));

  session.setSessionHooks({
    // The host has spawned a wave and dealt it out. Everyone else has already
    // created the same creatures from the same seed — this only records who is
    // responsible for which.
    // The host has spawned a wave. Everyone else BUILDS it from this — the
    // message carries type, position and elite, so no client has to reproduce a
    // spawn decision it did not make.
    onAssign: (list) => {
      assignSeen += list.length;
      for (const a of list) {
        const existing = S.enemies.find((x) => x.netId === a.id);
        if (existing) { existing.owner = a.o; existing.netX = a.x; existing.netY = a.y; continue; }
        const made = makeEnemyFromNet(a);
        if (made) { made.netX = a.x; made.netY = a.y; assignBuilt++; }
        else assignFailed++;
      }
    },

    // Somebody else fired. The projectile is created here with the same
    // properties and then flies under its own steam: after this message there
    // is nothing further to sync, because a bolt travelling in a straight line
    // is the same on every machine.
    onRemoteShot: (m) => {
      spawnShot({
        x: m.x, y: m.y, vx: m.vx, vy: m.vy,
        size: m.s, dmg: m.dmg, kind: m.k,
        // Not ours: it must not award us the kill or spend our pierce budget,
        // and its damage is reported by the client that fired it.
        foreign: true, pierce: 1, life: 3,
      });
    },

    onPause: (who, paused) => { if (onPauseChanged) onPauseChanged(who, paused); },
  });

  if (!wired) {
    net.on('relay', (m) => session.handleRelay(m));
    wired = true;
  }
}

export function endCoopRun() {
  session.endSession();
  netBridge.onShotFired = null;
  netBridge.onEnemyDamaged = null;
  netBridge.onEnemyKilled = null;
  netBridge.onPlayerDowned = null;
  netBridge.onPlayerRevived = null;
  netBridge.ownedHere = null;
  setRemoteCollectHandler(null);
  setSpawnAuthority(null);
  setSpawnListener(null);
}

let onPauseChanged = null;
export function setPauseHandler(fn) { onPauseChanged = fn; }

/**
 * Called once per frame from the main loop, after `update`.
 *
 * The order matters: the local simulation has already moved everything, so
 * corrections are applied to a world that has finished thinking, and the
 * outgoing snapshot describes where things actually ended up this frame rather
 * than where they were at the start of it.
 */
export function tickCoop(dt) {
  if (!session.isActive()) return;
  session.correctEnemies(dt);
  session.tickSession(dt);
}

export { session };
