// ---------------------------------------------------------------------------
// market.js — the Long Market: the hub you are pushed into after every boss.
//
// A hand-laid square rather than more procedural world, because the point of it
// is to feel like somewhere specific. The run is suspended while you are here:
// the clock stops, the horde is gone, and the only thing that carries back out
// is what you bought.
//
// The crowd is the part that has to earn its keep. Townsfolk run Reynolds-style
// steering (wander + arrive + separation + containment) under a four-state
// routine — stroll, browse, chat, linger — so nobody walks a straight line,
// nobody stands in anybody, and the square is never uniformly busy. Each has a
// favourite stall they drift back to, which is what makes repeat visits read as
// the same town rather than a fresh shuffle.
//   Steering: Reynolds, "Steering Behaviors For Autonomous Characters" (GDC 99)
// ---------------------------------------------------------------------------

import { clamp, rand, randInt, pick, makeRng, TAU } from '../core/util.js';
import { sfx, playMusic } from '../core/audio.js';
import { speakAs, preloadVendor } from '../core/voice.js';
import { input, pollInput } from '../core/input.js';
import { S } from './state.js';
import { VENDORS, rollStock } from './shop.js';
import { folkBodyOf, pickFolkVariant } from '../art/folk.js';
import { RTP_CROWD_POOL } from '../art/rtp.js';
import { say as emote, tickBalloon } from '../art/balloons.js';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
export const BOUNDS = { left: -560, right: 560, top: -380, bottom: 380 };
const ENTRY = { x: 0, y: 300 };

/** Solid furniture. `r` is a half-extent box the player and crowd walk around. */
const LAYOUT = {
  stalls: [
    { vendor: 'oswin',       kind: 'arms',  x: -330, y: -210 },
    { vendor: 'coinweigher', kind: 'coin',  x: 0,    y: -290 },
    { vendor: 'marta',       kind: 'herbs', x: 330,  y: -210 },
    { vendor: null,          kind: 'cloth', x: -430, y: 90 },
    { vendor: null,          kind: 'fruit', x: 430,  y: 90 },
  ],
  props: [
    ['well', 0, -30, 0],
    ['barrel', -250, -60, 0], ['barrel', -228, -44, 0], ['crate', -272, -32, 0],
    ['crate', 250, -60, 0], ['sack', 276, -40, 0], ['barrel', 230, -34, 0],
    ['basket', -150, 150, 0], ['basket', -120, 162, 0], ['urn', -186, 140, 0],
    ['basket', 150, 150, 0], ['urn', 186, 140, 0], ['sack', 120, 164, 0],
    ['bench', -60, 210, 0], ['bench', 60, 210, 0],
    ['crate', -470, -150, 0], ['barrel', 470, -150, 0],
    ['sack', -420, -60, 0], ['urn', 420, -60, 0],
  ],
  braziers: [[-480, -300], [480, -300], [-480, 250], [480, 250]],
  lamps: [[-300, 300], [300, 300], [-500, 30], [500, 30]],
  // Lantern strings, given as index pairs into `lamps`.
  strings: [[0, 1], [2, 0], [1, 3]],
};

// Collision boxes, half-extents. Stalls are wide and shallow; you walk in front.
const BOX = {
  stall: [68, 26], well: [42, 22], barrel: [14, 12], crate: [16, 12],
  sack: [13, 11], basket: [15, 10], urn: [13, 12], bench: [28, 9],
};

// How far out furniture starts pushing the crowd around it.
const AVOID_R = 48;

let solids = [];

// Everything the crowd decides runs off a seeded generator rather than
// Math.random, so the same run reloaded gets the same market, and the crowd
// tests are reproducible instead of flaky.
let mrng = makeRng(1);
const mrand = (a, b) => (b === undefined ? mrng() * a : a + mrng() * (b - a));
const mrandInt = (a, b) => Math.floor(mrand(a, b + 1));

function buildSolids() {
  solids = [];
  for (const s of LAYOUT.stalls) solids.push({ x: s.x, y: s.y + 24, hw: BOX.stall[0], hh: BOX.stall[1] });
  for (const [kind, x, y] of LAYOUT.props) {
    const b = BOX[kind] || [12, 10];
    solids.push({ x, y, hw: b[0], hh: b[1] });
  }
  for (const [x, y] of LAYOUT.braziers) solids.push({ x, y, hw: 16, hh: 12 });
}

/** Push a circle out of every solid it overlaps. Cheap, and stable enough here. */
function resolveSolids(e, radius = 12) {
  for (const s of solids) {
    const dx = e.x - s.x, dy = e.y - s.y;
    const ox = s.hw + radius - Math.abs(dx);
    const oy = s.hh + radius - Math.abs(dy);
    if (ox <= 0 || oy <= 0) continue;
    // Eject along the shallower axis so you slide along a stall front.
    if (ox < oy) e.x += dx > 0 ? ox : -ox;
    else e.y += dy > 0 ? oy : -oy;
  }
  e.x = clamp(e.x, BOUNDS.left + 20, BOUNDS.right - 20);
  e.y = clamp(e.y, BOUNDS.top + 20, BOUNDS.bottom - 20);
}

// ---------------------------------------------------------------------------
// The scene
// ---------------------------------------------------------------------------
export const M = {
  active: false,
  t: 0,
  player: null,
  folk: [],
  vendors: [],
  prompt: null,          // { kind: 'vendor'|'exit', id, label }
  talking: null,         // vendor id while the dialogue box is open
  cam: { x: 0, y: 0 },
  visit: 0,
  bossName: '',
  chimeT: 6,
  crowdT: 3,
  onExit: null,
  fade: 1,               // 1 -> 0 on entry, back to 1 on the way out
  leaving: false,
};

const WAYPOINTS = () => {
  const out = [];
  for (const s of LAYOUT.stalls) out.push({ x: s.x + mrand(-46, 46), y: s.y + 70 });
  out.push({ x: 0, y: 40 }, { x: -170, y: 90 }, { x: 170, y: 90 });
  out.push({ x: -380, y: -30 }, { x: 380, y: -30 }, { x: 0, y: 190 });
  return out;
};

/**
 * Enter the market. `onExit` is called when the player walks back out, which is
 * what resumes the run.
 */
export function enterMarket({ visit, bossName, onExit }) {
  buildSolids();
  mrng = makeRng((S.seed ^ (visit * 2654435761)) >>> 0);
  M.active = true;
  M.t = 0;
  M.visit = visit;
  M.bossName = bossName || '';
  M.onExit = onExit;
  M.prompt = null;
  M.talking = null;
  M.fade = 1;
  M.leaving = false;
  M.chimeT = 5;
  M.crowdT = 2.5;

  M.player = {
    x: ENTRY.x, y: ENTRY.y + 60, vx: 0, vy: 0,
    dir: 'north', frame: 0, animT: 0, moving: false,
  };
  M.cam.x = M.player.x;
  M.cam.y = M.player.y - 40;

  // Vendors stand behind their stalls.
  M.vendors = LAYOUT.stalls
    .filter((s) => s.vendor)
    .map((s) => ({
      id: s.vendor,
      x: s.x, y: s.y - 4,
      stock: rollStock(s.vendor, S.seed, visit),
      greetT: 0,
      bal: null,
      bob: mrand(0, TAU),
    }));
  for (const v of M.vendors) preloadVendor(v.id);

  emote(M.player, 'exclaim', 1.9);
  spawnCrowd(10 + Math.min(6, visit * 2));
  playMusic('market');
  sfx('market-open');
}

export function leaveMarket() {
  if (M.leaving) return;
  M.leaving = true;
  sfx('market-close');
}

function spawnCrowd(n) {
  const wps = WAYPOINTS();
  M.folk = [];

  // Every person in the square gets a different face. The pool is shuffled
  // with the market's own seeded RNG and dealt from the top, so a visit is
  // still reproducible but no two shoppers are ever twins — which is the one
  // thing that makes a crowd read as a crowd rather than as a spawner.
  const faces = RTP_CROWD_POOL.slice();
  for (let i = faces.length - 1; i > 0; i--) {
    const j = mrandInt(0, i);
    [faces[i], faces[j]] = [faces[j], faces[i]];
  }
  // The cast is the ceiling: a square can hold no more people than there are
  // faces for, because two of the same person standing in it is worse than one
  // fewer shopper. The pool is only the ordinary townsfolk — the merchants and
  // the RPG Maker sheets' royalty are both left out of it.
  n = Math.min(n, faces.length);
  for (let i = 0; i < n; i++) {
    const wp = wps[(mrng() * wps.length) | 0];
    const f = {
      x: wp.x + mrand(-70, 70), y: wp.y + mrand(-50, 50),
      vx: 0, vy: 0,
      variant: pickFolkVariant(mrng),
      // Which of the thirty-two sheeted townsfolk this person wears. Dealt from
      // the shuffled pool rather than rolled, so it cannot collide; decided here
      // rather than at draw time so a visit looks the same whether or not the
      // atlas loaded. The three merchants are not in the pool.
      sheet: faces[i % faces.length],
      scale: 3,
      speed: mrand(34, 58),
      dir: 'south', frame: 0, animT: 0, moving: false,
      state: 'stroll', stateT: mrand(0, 2), strollT: 0,
      target: { ...wps[(mrng() * wps.length) | 0] },
      wanderAngle: mrand(0, TAU),
      favourite: mrandInt(0, LAYOUT.stalls.length - 1),
      partner: null,
      chatty: mrng(),
      barkT: mrand(4, 18),
      emoteT: mrand(3, 14),
      socialT: mrand(4, 18),
      bal: null,
    };
    // An elder walks slower and stops for longer; a porter is on an errand and
    // barely dawdles. Behaviour reading off the silhouette is most of what
    // makes a crowd look like individuals rather than one algorithm.
    const body = folkBodyOf(f.variant);
    if (body === 'elder') { f.speed *= 0.62; f.chatty = Math.max(f.chatty, 0.55); }
    else if (body === 'porter') { f.speed *= 1.25; f.chatty *= 0.35; }
    else if (body === 'gown') f.speed *= 0.86;
    // Nobody starts standing inside a barrel.
    resolveSolids(f, 10);
    M.folk.push(f);
  }
}

// What the crowd says without words. Conversation skews warm; idling skews
// bored, which is the difference between a market and a waiting room.
const CHAT_EMOTES = ['note', 'heart', 'question', 'exclaim', 'silence', 'note'];
const IDLE_EMOTES = ['question', 'silence', 'note', 'confused', 'idea'];
const IDLE_EMOTES_ELDER = ['sleep', 'silence', 'confused', 'question'];

// ---------------------------------------------------------------------------
// Crowd behaviour
// ---------------------------------------------------------------------------
function pickDestination(f) {
  // A townsperson goes back to their favourite stall about half the time; the
  // rest of the walk is genuinely aimless. That mix is what stops the square
  // looking either random or scripted.
  if (mrng() < 0.5) {
    const s = LAYOUT.stalls[f.favourite];
    return { x: s.x + mrand(-52, 52), y: s.y + mrand(62, 86) };
  }
  const wps = WAYPOINTS();
  return wps[(mrng() * wps.length) | 0];
}

/** Somebody standing about who is not already in a conversation. */
function findCompany(f) {
  let best = null, bestD = 260;
  for (const o of M.folk) {
    if (o === f || o.partner || o.state === 'chat' || o.state === 'approach') continue;
    if (o.state !== 'linger' && o.state !== 'browse') continue;
    const d = Math.hypot(o.x - f.x, o.y - f.y);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

function steerFolk(f, dt) {
  let ax = 0, ay = 0;
  let wantX = 0, wantY = 0;          // where this person is trying to go

  if (f.state === 'stroll' || f.state === 'approach') {
    // An approach re-aims at a moving person; a stroll walks to a fixed point.
    const tx = f.state === 'approach' && f.partner ? f.partner.x : f.target.x;
    const ty = f.state === 'approach' && f.partner ? f.partner.y : f.target.y;

    // --- arrive: ease off inside the slowing radius so nobody skids to a stop
    const dx = tx - f.x, dy = ty - f.y;
    const d = Math.hypot(dx, dy) || 1;
    wantX = dx / d; wantY = dy / d;
    const urgency = f.state === 'approach' ? 1.18 : 1;
    const want = (d < 70 ? f.speed * (d / 70) : f.speed) * urgency;
    ax += wantX * want;
    ay += wantY * want;

    // --- wander: a point on a circle projected ahead, drifting each frame
    f.wanderAngle += mrand(-2.4, 2.4) * dt;
    const wob = f.state === 'approach' ? 0.12 : 0.35;
    ax += Math.cos(f.wanderAngle) * f.speed * wob;
    ay += Math.sin(f.wanderAngle) * f.speed * wob;

    if (f.state === 'approach') {
      if (!f.partner || f.partner.partner !== f) {
        f.state = 'stroll';
        f.partner = null;
        f.target = pickDestination(f);
      } else if (d < 46) {
        f.state = 'chat';
        f.partner.state = 'chat';
        f.stateT = f.partner.stateT = mrand(5, 11);
        // Whoever walked over speaks first.
        emote(f, CHAT_EMOTES[(mrng() * CHAT_EMOTES.length) | 0], 2.2);
        f.emoteT = 2.6;
        f.partner.emoteT = 3.4;
      }
    } else if (d < 26) {
      const roll = mrng();
      const company = roll < 0.42 ? findCompany(f) : null;
      if (company && f.chatty > 0.22) {
        // Go over and say something. This is what makes conversation a routine
        // rather than a coincidence of two people idling in the same spot.
        f.state = 'approach';
        f.partner = company;
        company.partner = f;
        f.stateT = 20;               // give up if they wander off
        // And the other person waits: they have seen you coming. Without this
        // their idle timer runs out mid-approach, they walk off, and the
        // conversation almost never happens.
        company.state = 'linger';
        company.stateT = 22;
      } else {
        f.state = roll < 0.76 ? 'browse' : 'linger';
        f.stateT = f.state === 'browse' ? mrand(6, 14) : mrand(4, 9);
      }
    }
  } else if (f.state === 'chat' && f.partner) {
    // Hold station facing the other person, shuffling very slightly.
    const dx = f.partner.x - f.x, dy = f.partner.y - f.y;
    const d = Math.hypot(dx, dy) || 1;
    const want = (d - 30) * 1.4;
    ax += (dx / d) * want;
    ay += (dy / d) * want;
  }

  // --- separation: the reason a crowd looks like people and not a queue
  for (const o of M.folk) {
    if (o === f) continue;
    const dx = f.x - o.x, dy = f.y - o.y;
    const d2 = dx * dx + dy * dy;
    const near = f.partner === o ? 26 : 34;
    if (d2 > near * near || d2 < 0.01) continue;
    const d = Math.sqrt(d2);
    const push = (near - d) / near;
    ax += (dx / d) * push * 130;
    ay += (dy / d) * push * 130;
  }

  // --- obstacle avoidance -------------------------------------------------
  // Pushing out of a solid is not enough on its own: somebody whose target is
  // on the far side of a stall walks into the counter and stays there, being
  // ejected and re-seeking forever. So each obstacle also contributes a
  // tangential force, and they curve around it instead.
  for (const s of solids) {
    const nx = clamp(f.x, s.x - s.hw, s.x + s.hw);
    const ny = clamp(f.y, s.y - s.hh, s.y + s.hh);
    let dx = f.x - nx, dy = f.y - ny;
    let d = Math.hypot(dx, dy);
    if (d > AVOID_R) continue;
    if (d < 0.001) { dx = 0; dy = 1; d = 1; }       // dead centre: pick a side
    const ux = dx / d, uy = dy / d;
    const w = (AVOID_R - d) / AVOID_R;
    ax += ux * w * 165;
    ay += uy * w * 165;
    // Slide along whichever tangent agrees with where this person wants to go.
    const sgn = (-uy * wantX + ux * wantY) >= 0 ? 1 : -1;
    ax += -uy * sgn * w * 150;
    ay += ux * sgn * w * 150;
  }

  // --- give the player room: townsfolk step aside rather than clip through
  const pdx = f.x - M.player.x, pdy = f.y - M.player.y;
  const pd = Math.hypot(pdx, pdy);
  if (pd < 44 && pd > 0.01) {
    ax += (pdx / pd) * ((44 - pd) / 44) * 190;
    ay += (pdy / pd) * ((44 - pd) / 44) * 190;
  }

  // --- containment: turn back before the wall, not at it
  const margin = 60;
  if (f.x < BOUNDS.left + margin) ax += (BOUNDS.left + margin - f.x) * 1.6;
  if (f.x > BOUNDS.right - margin) ax -= (f.x - (BOUNDS.right - margin)) * 1.6;
  if (f.y < BOUNDS.top + margin) ay += (BOUNDS.top + margin - f.y) * 1.6;
  if (f.y > BOUNDS.bottom - margin) ay -= (f.y - (BOUNDS.bottom - margin)) * 1.6;

  // Steering is an acceleration; the damping is what keeps it from oscillating.
  f.vx += (ax - f.vx * 2.6) * dt * 3.4;
  f.vy += (ay - f.vy * 2.6) * dt * 3.4;

  const sp = Math.hypot(f.vx, f.vy);
  const cap = f.state === 'stroll' ? f.speed : f.speed * 0.35;
  if (sp > cap) { f.vx = (f.vx / sp) * cap; f.vy = (f.vy / sp) * cap; }
}

function updateFolk(dt) {
  for (const f of M.folk) {
    f.stateT -= dt;
    f.barkT -= dt;
    f.strollT = f.state === 'stroll' ? f.strollT + dt : 0;

    if (f.state !== 'stroll' && f.stateT <= 0) {
      if (f.partner) { f.partner.partner = null; f.partner = null; }
      f.state = 'stroll';
      f.target = pickDestination(f);
    }

    // Last resort: a destination that cannot be reached (something was placed
    // in front of it, or a knot of people is in the way) is abandoned rather
    // than walked at forever.
    if (f.strollT > 11) {
      f.strollT = 0;
      f.target = pickDestination(f);
    }

    // Wanting to talk to somebody is its own impulse on its own clock, not
    // something that can only occur to you at the exact moment you finish
    // walking somewhere. Leaving it to that coincidence meant whole visits
    // where nobody in the square ever spoke, purely by bad luck.
    f.socialT -= dt;
    if (f.socialT <= 0 && !f.partner && f.chatty > 0.22 &&
        (f.state === 'stroll' || f.state === 'linger' || f.state === 'browse')) {
      const company = findCompany(f);
      if (company) {
        f.state = 'approach';
        f.partner = company;
        company.partner = f;
        f.stateT = 20;
        company.state = 'linger';
        company.stateT = 22;
        f.socialT = mrand(24, 48);
      } else {
        f.socialT = mrand(4, 9);       // nobody free just now; ask again soon
      }
    }

    tickBalloon(f, dt);
    f.emoteT -= dt;
    if (f.emoteT <= 0) {
      f.emoteT = mrand(6, 20);
      if (f.state === 'chat') {
        // Mid-conversation: the two of them trade expressions.
        emote(f, CHAT_EMOTES[(mrng() * CHAT_EMOTES.length) | 0], mrand(1.6, 2.6));
      } else if (f.state === 'linger' || f.state === 'browse') {
        const body = folkBodyOf(f.variant);
        const pool = body === 'elder' ? IDLE_EMOTES_ELDER : IDLE_EMOTES;
        emote(f, pool[(mrng() * pool.length) | 0], mrand(1.6, 2.8));
      }
    }

    steerFolk(f, dt);
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    resolveSolids(f, 10);

    const moving = Math.hypot(f.vx, f.vy) > 6;
    if (moving) {
      f.dir = Math.abs(f.vx) > Math.abs(f.vy) ? (f.vx > 0 ? 'east' : 'west') : (f.vy > 0 ? 'south' : 'north');
      f.animT += dt * 6;
      f.frame = Math.floor(f.animT) % 4;
    } else {
      if (f.partner) {
        // Turn to face whoever you are talking to.
        const dx = f.partner.x - f.x, dy = f.partner.y - f.y;
        f.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');
      }
      f.animT = 0;
      f.frame = 0;
    }
    f.moving = moving;
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
export function updateMarket(dt, view) {
  if (!M.active) return;
  M.t += dt;

  // Fade in on arrival, out on the way back to the run.
  if (M.leaving) {
    M.fade = Math.min(1, M.fade + dt * 2.2);
    if (M.fade >= 1) { M.active = false; M.onExit?.(); }
  } else if (M.fade > 0) {
    M.fade = Math.max(0, M.fade - dt * 1.8);
  }

  const p = M.player;

  if (!M.talking && !M.leaving) {
    pollInput();
    let mx = input.x, my = input.y;
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }
    const speed = 168;
    p.vx = mx * speed;
    p.vy = my * speed;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    resolveSolids(p, 12);
    p.moving = mag > 0.02;
    if (p.moving) {
      p.dir = Math.abs(mx) > Math.abs(my) ? (mx > 0 ? 'east' : 'west') : (my > 0 ? 'south' : 'north');
      p.animT += dt * (6 + mag * 3);
      p.frame = Math.floor(p.animT) % 4;
    } else {
      p.animT = 0;
      p.frame = 0;
    }
  } else {
    p.moving = false;
    p.frame = 0;
  }

  updateFolk(dt);
  for (const v of M.vendors) tickBalloon(v, dt);
  tickBalloon(M.player, dt);
  updatePrompt();
  updateAmbience(dt);

  // Camera follows loosely and stays inside the square.
  const k = 1 - Math.pow(0.0009, dt);
  M.cam.x += (p.x - M.cam.x) * k;
  M.cam.y += (p.y - 30 - M.cam.y) * k;
  const halfW = (view?.w || 800) / 2, halfH = (view?.h || 600) / 2;
  M.cam.x = clamp(M.cam.x, BOUNDS.left + halfW - 90, BOUNDS.right - halfW + 90);
  M.cam.y = clamp(M.cam.y, BOUNDS.top + halfH - 90, BOUNDS.bottom - halfH + 90);
  if (halfW * 2 > BOUNDS.right - BOUNDS.left + 180) M.cam.x = 0;
  if (halfH * 2 > BOUNDS.bottom - BOUNDS.top + 180) M.cam.y = 0;
}

function updatePrompt() {
  if (M.talking || M.leaving) { M.prompt = null; return; }
  const p = M.player;
  let best = null, bestD = 96;

  for (const v of M.vendors) {
    const d = Math.hypot(v.x - p.x, (v.y + 40) - p.y);
    if (d < bestD) { bestD = d; best = { kind: 'vendor', id: v.id, label: `${VENDORS[v.id].name}, ${VENDORS[v.id].trade}` }; }
  }
  const dExit = Math.hypot(ENTRY.x - p.x, (ENTRY.y + 70) - p.y);
  if (dExit < bestD) best = { kind: 'exit', id: 'exit', label: 'Back to the hunt' };

  // A vendor notices you approaching, once.
  if (best?.kind === 'vendor' && M.prompt?.id !== best.id) {
    const v = M.vendors.find((x) => x.id === best.id);
    if (v && M.t - v.greetT > 12) {
      v.greetT = M.t;
      speakAs(v.id, 'greet', { gain: 0.7 });
      emote(v, 'exclaim', 1.6);
    }
  }
  M.prompt = best;
}

function updateAmbience(dt) {
  // A distant bell, and voices in the crowd that are never quite words.
  M.chimeT -= dt;
  if (M.chimeT <= 0) { M.chimeT = rand(14, 26); sfx('chime'); }

  M.crowdT -= dt;
  if (M.crowdT <= 0) {
    M.crowdT = rand(2.4, 6.5);
    const f = M.folk[randInt(0, M.folk.length - 1)];
    if (f && Math.hypot(f.x - M.player.x, f.y - M.player.y) < 460) {
      // Quieter the further away they are, so the square has depth.
      const d = Math.hypot(f.x - M.player.x, f.y - M.player.y);
      speakAs(
        { who: ['alex', 'ian', 'karen', 'meghan', 'sean'][f.variant % 5], rate: 0.88 + (f.variant % 5) * 0.06 },
        pick(['greet', 'confirm', 'wow', 'farewell']),
        { background: true, gain: 0.16 * (1 - d / 520), rateJitter: 0.12 }
      );
    }
  }
}

/** Act on the current prompt. Returns what happened so the UI can respond. */
export function interact() {
  if (!M.prompt || M.talking || M.leaving) return null;
  if (M.prompt.kind === 'exit') { leaveMarket(); return { kind: 'exit' }; }
  const v = M.vendors.find((x) => x.id === M.prompt.id);
  if (!v) return null;
  M.talking = v.id;
  sfx('market-open');
  speakAs(v.id, 'greet', { gain: 0.9 });
  return { kind: 'vendor', vendor: v };
}

export function closeShop() {
  if (!M.talking) return;
  const id = M.talking;
  M.talking = null;
  sfx('market-close');
  speakAs(id, 'farewell', { gain: 0.8 });
}

/**
 * Let a vendor show what they think of what just happened. Called by the shop
 * screen, which is DOM and cannot draw into the world itself.
 */
export function vendorReact(id, kind, seconds = 1.8) {
  const v = M.vendors.find((x) => x.id === id);
  if (v) emote(v, kind, seconds);
}

/** The hero can emote too — on arrival, and when a purchase lands. */
export function playerReact(kind, seconds = 1.8) {
  if (M.player) emote(M.player, kind, seconds);
}

export const vendorById = (id) => M.vendors.find((v) => v.id === id);
export const marketLayout = LAYOUT;
export const marketEntry = ENTRY;
