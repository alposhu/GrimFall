/*
 * The Hearthhall, checked without a browser.
 *
 *   node tools/hub-smoke.mjs
 *
 * The inn is built by a script from a declaration, which is the right way to
 * author it and also the way to end up with a building nobody can walk across.
 * A partition wall with no doorway in it, a barrel dropped on the stairs, an
 * innkeeper sealed behind her own bar — none of these throw, none of them look
 * wrong in the source, and all of them are only visible by playing.
 *
 * So the invariants are checked here, on every floor: you can stand where you
 * arrive, and from there you can reach every room, every landmark and everybody
 * worth talking to.
 */

import './dom-stub.mjs';

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

const hub = await import('../src/game/hub.js');
const { H, TILE, MATERIALS, AREAS } = hub;

hub.buildHub();
check(H.built, 'the inn did not build');

/** Flood fill an area from its own arrival mark. */
function reachOf(id) {
  H.area = id;
  const a = hub.A();
  const spawn = AREAS[id].spawn;
  const seen = new Uint8Array(a.w * a.h);
  const queue = [[spawn.x, spawn.y]];
  seen[spawn.y * a.w + spawn.x] = 1;
  let n = 0;
  while (queue.length) {
    const [x, y] = queue.pop();
    n++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= a.w || ny >= a.h) continue;
      if (seen[ny * a.w + nx] || hub.isSolid(nx, ny)) continue;
      seen[ny * a.w + nx] = 1;
      queue.push([nx, ny]);
    }
  }
  return { a, seen, n };
}

for (const id of Object.keys(AREAS)) {
  const def = AREAS[id];
  const { a, seen, n } = reachOf(id);

  check(!hub.isSolid(def.spawn.x, def.spawn.y),
    `${id}: you arrive inside scenery`);
  check(a.props.length > 30, `${id} has only ${a.props.length} things in it`);

  const open = a.w * a.h - a.solid.reduce((t, v) => t + v, 0);
  check(n > open * 0.85,
    `${id}: only ${n} of ${open} open tiles can be reached — a room is sealed off`);

  // Every ROOM the plan declares must be enterable. This is the check that
  // catches a partition wall drawn with no doorway in it, which is the mistake
  // this style of authoring invites and the one that looks perfectly fine in
  // the source.
  for (const [rx, ry, rw, rh] of def.rooms) {
    let got = 0;
    for (let ty = ry; ty < ry + rh; ty++) {
      for (let tx = rx; tx < rx + rw; tx++) {
        if (tx < a.w && ty < a.h && seen[ty * a.w + tx]) got++;
      }
    }
    check(got > 0, `${id}: the room at ${rx},${ry} ${rw}x${rh} cannot be entered at all`);
  }

  // Every landmark must be stood NEXT to — not on: a bar is solid, and you
  // order from in front of it.
  for (const pt of a.points) {
    const r = Math.ceil(pt.r / TILE);
    let ok = false;
    for (let ty = pt.y - r; ty <= pt.y + r && !ok; ty++) {
      for (let tx = pt.x - r; tx <= pt.x + r && !ok; tx++) {
        if (tx < 0 || ty < 0 || tx >= a.w || ty >= a.h) continue;
        if (!seen[ty * a.w + tx]) continue;
        const d = Math.hypot((tx - pt.x) * TILE, (ty - pt.y) * TILE);
        if (d < pt.r) ok = true;
      }
    }
    check(ok, `${id}: "${pt.id}" cannot be reached`);
  }

  // And everybody with something to say must be walkable-up-to.
  for (const f of a.folk) {
    if (!f.lines) continue;
    const fx = Math.floor(f.x / TILE), fy = Math.floor(f.y / TILE);
    const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .some(([dx, dy]) => seen[(fy + dy) * a.w + (fx + dx)]);
    check(beside, `${id}: "${f.id}" is walled in — nobody can stand next to them`);
    check(f.lines.length > 0, `${id}: "${f.id}" has nothing to say`);
  }

  // Two landmarks close enough to overlap make a prompt that flickers between
  // them as you walk, which reads as a bug.
  for (let i = 0; i < a.points.length; i++) {
    for (let j = i + 1; j < a.points.length; j++) {
      const p = a.points[i], q = a.points[j];
      const d = Math.hypot((p.x - q.x) * TILE, (p.y - q.y) * TILE);
      check(d > Math.max(p.r, q.r), `${id}: "${p.id}" and "${q.id}" overlap`);
    }
  }
  console.log(`${id.padEnd(8)}          ok (${n} tiles, ${def.rooms.length} rooms, `
    + `${a.points.length} landmarks, ${a.folk.filter((f) => f.lines).length} to talk to)`);
}

// --- the stairs actually connect the floors --------------------------------
// Two floors joined by nothing is two maps, and the only symptom is a player
// standing on a staircase pressing a button that does not answer.
const stairs = { ground: 'upstairs', upper: 'downstairs' };
for (const [id, point] of Object.entries(stairs)) {
  check(H.areas[id].points.some((p) => p.id === point),
    `${id} has no "${point}" — the floors are not connected`);
}
hub.enterHub();
check(H.area === 'ground', 'the inn should open on the ground floor');
hub.goToArea('upper');
check(H.area === 'upper', 'the stairs did not go up');
check(!hub.isSolid(Math.floor(H.player.x / TILE), Math.floor(H.player.y / TILE)),
  'you arrive upstairs inside a wall');
hub.goToArea('ground');
check(H.area === 'ground', 'the stairs did not come back down');
console.log('stairs            ok (both floors, arriving somewhere solid-free)');

// --- the ids the game wires to must all exist ------------------------------
const WIRED = {
  ground: ['door', 'settings', 'party', 'sanctuary', 'help', 'arena',
    'dice', 'cups', 'knives', 'upstairs'],
  upper: ['downstairs', 'help', 'variants'],
};
for (const [id, ids] of Object.entries(WIRED)) {
  for (const want of ids) {
    check(H.areas[id].points.some((p) => p.id === want),
      `main.js wires "${want}" on ${id}, which the plan does not have`);
  }
}

// --- walking ---------------------------------------------------------------
hub.enterHub();
const before = { x: H.player.x, y: H.player.y };
for (let i = 0; i < 30; i++) hub.updateHub(1 / 60, { x: 0, y: -1 }, { w: 960, h: 540 });
check(H.player.y < before.y - 20, 'walking north did not move the player north');
check(H.player.dir === 'north', `facing should follow the walk, got ${H.player.dir}`);

hub.enterHub();
for (let i = 0; i < 900; i++) hub.updateHub(1 / 60, { x: -1, y: -1 }, { w: 960, h: 540 });
check(!hub.isSolid(Math.floor(H.player.x / TILE), Math.floor(H.player.y / TILE)),
  'walking into the corner put the player inside a wall');
console.log('walking           ok (moves, faces, and is stopped by the building)');

// --- the floor only holds materials the atlas can draw ---------------------
const known = new Set(MATERIALS);
for (const id of Object.keys(AREAS)) {
  H.area = id;
  const a = hub.A();
  let unknown = 0;
  for (let i = 0; i < a.floor.length; i++) if (!known.has(MATERIALS[a.floor[i]])) unknown++;
  check(unknown === 0, `${id}: ${unknown} tiles carry a material with no name`);
}

// --- talking ---------------------------------------------------------------
hub.enterHub();
const keeper = hub.A().folk.find((f) => f.id === 'keeper');
H.player.x = keeper.x;
H.player.y = keeper.y + 40;
hub.updateHub(1 / 60, { x: 0, y: 0 }, { w: 960, h: 540 });
check(hub.hubFolkTarget() === keeper, 'standing next to the Keeper offered no conversation');
check(hub.talkToFolk(), 'the Keeper did not answer');
const first = H.speech.text;
hub.talkToFolk();
check(H.speech.text !== first, 'asking twice gave the same answer twice');
console.log('talking           ok (answers, and answers differently)');

// --- the renderer runs on both floors --------------------------------------
const { renderHub } = await import('../src/game/hubRender.js');
const { makeCanvas } = await import('./dom-stub.mjs');
const canvas = makeCanvas();
canvas.width = 960;
canvas.height = 540;
const ctx = canvas.getContext('2d');

let threw = null;
try {
  for (const id of Object.keys(AREAS)) {
    hub.enterHub();
    hub.goToArea(id);
    H.others = [{
      id: 'p2', name: 'Ece', charId: 'ranger',
      x: H.player.x + 40, y: H.player.y, dir: 'south', moving: true, frame: 1, sortY: H.player.y,
    }];
    for (let i = 0; i < 3; i++) {
      hub.updateHub(1 / 60, { x: 1, y: 0 }, { w: 960, h: 540 });
      renderHub(ctx, canvas, 1);
    }
  }
} catch (e) { threw = e; }
check(!threw, `drawing the inn threw: ${threw && threw.message}`);
console.log('render            ok (both floors, with a teammate on screen)');

// --- everything placed must be something the atlas ships -------------------
const { RTP_PROPS } = await import('../src/art/rtp.js');
const shipped = new Set(RTP_PROPS);
for (const id of Object.keys(AREAS)) {
  const missing = [...new Set(H.areas[id].props.map((p) => p.prop))].filter((n) => !shipped.has(n));
  check(missing.length === 0, `${id} places props the atlas does not have: ${missing.join(', ')}`);
}

if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('\nAll Hearthhall checks passed.');
