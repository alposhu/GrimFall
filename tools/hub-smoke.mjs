/*
 * The Hearthhall, checked without a browser.
 *
 *   node tools/hub-smoke.mjs
 *
 * The map is built by a script from a declaration, which is the right way to
 * author it and also the way to end up with a place nobody can walk across. A
 * tree scattered onto the gate road, a prop dropped on the spawn, a district
 * fenced off by its own decoration — none of these throw, none of them look
 * wrong in the source, and all of them are only visible by playing.
 *
 * So the invariants are checked here: you can stand where you arrive, and from
 * there you can reach every single thing the map offers.
 */

import './dom-stub.mjs';

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

const hub = await import('../src/game/hub.js');
const { H, TILE, MAP_W, MAP_H, POINTS, SPAWN, MATERIALS } = hub;

hub.buildHub();
check(H.built, 'the hub did not build');
check(H.props.length > 60, `a hall with ${H.props.length} things in it is not furnished`);

// --- you can stand where you arrive ----------------------------------------
const sx = Math.floor(SPAWN.x / TILE);
const sy = Math.floor(SPAWN.y / TILE);
check(!hub.isSolid(sx, sy), 'the spawn tile is solid — the player arrives inside scenery');

// --- and walk out of it ----------------------------------------------------
// Flood fill from the spawn across everything not solid. Anything the fill does
// not touch is somewhere the player cannot get to, however good it looks.
const seen = new Uint8Array(MAP_W * MAP_H);
const queue = [[sx, sy]];
seen[sy * MAP_W + sx] = 1;
let reachable = 0;
while (queue.length) {
  const [x, y] = queue.pop();
  reachable++;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
    if (seen[ny * MAP_W + nx] || hub.isSolid(nx, ny)) continue;
    seen[ny * MAP_W + nx] = 1;
    queue.push([nx, ny]);
  }
}
const walkable = MAP_W * MAP_H - H.solid.reduce((n, v) => n + v, 0);
check(reachable > walkable * 0.9,
  `only ${reachable} of ${walkable} open tiles can be reached — the hall is cut in two`);

// --- every point of interest can be stood NEXT to ---------------------------
// Not stood ON: a signpost is solid, and the player reads it from beside it. So
// the test is the real requirement — is there anywhere reachable within arm's
// length of this thing.
for (const pt of POINTS) {
  const r = Math.ceil(pt.r / TILE);
  const cx = Math.floor(pt.x / TILE), cy = Math.floor(pt.y / TILE);
  let ok = false;
  for (let ty = cy - r; ty <= cy + r && !ok; ty++) {
    for (let tx = cx - r; tx <= cx + r && !ok; tx++) {
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
      if (!seen[ty * MAP_W + tx]) continue;
      const wx = tx * TILE + TILE / 2, wy = ty * TILE + TILE / 2;
      if (Math.hypot(wx - pt.x, wy - pt.y) < pt.r) ok = true;
    }
  }
  check(ok, `"${pt.id}" cannot be reached — nowhere walkable is within ${pt.r} of it`);
}
console.log(`reach             ok (${reachable} tiles, all ${POINTS.length} points reachable)`);

// --- everybody worth talking to can be walked up to -------------------------
// An NPC standing behind a table is an NPC nobody can reach, and the only
// symptom is a line of dialogue no player ever sees.
for (const f of hub.FOLK) {
  const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .some(([dx, dy]) => seen[(f.y + dy) * MAP_W + (f.x + dx)]);
  check(beside, `"${f.id}" is walled in — nobody can stand next to them`);
  check(f.lines.length > 0, `"${f.id}" has nothing to say`);
}
console.log(`folk              ok (${hub.FOLK.length} to talk to, all reachable)`);

// --- talking works ----------------------------------------------------------
hub.enterHub();
const keeper = H.folk.find((f) => f.id === 'keeper');
H.player.x = keeper.x;
H.player.y = keeper.y + 40;
hub.updateHub(1 / 60, { x: 0, y: 0 }, { w: 960, h: 540 });
check(hub.hubFolkTarget() === keeper, 'standing next to the Keeper did not offer a conversation');
check(hub.talkToFolk(), 'the Keeper did not answer');
check(!!H.speech && H.speech.who === keeper, 'nothing was said');
const first = H.speech.text;
hub.talkToFolk();
check(H.speech.text !== first, 'asking twice gave the same answer twice');
console.log('talking           ok (answers, and answers differently)');

// --- the ids the game wires to must all exist ------------------------------
// main.js maps these to screens. A renamed id silently produces a place you can
// walk to that does nothing when you press the button.
const WIRED = ['door', 'settings', 'party', 'sanctuary', 'help', 'arena'];
for (const id of WIRED) {
  check(POINTS.some((p) => p.id === id), `main.js wires "${id}", which the map does not have`);
}

// --- no two points overlap -------------------------------------------------
// The nearest wins when they do, so this is not a crash — it is a prompt that
// flickers between two labels as you walk, which reads as a bug.
for (let i = 0; i < POINTS.length; i++) {
  for (let j = i + 1; j < POINTS.length; j++) {
    const a = POINTS[i], b = POINTS[j];
    check(Math.hypot(a.x - b.x, a.y - b.y) > Math.max(a.r, b.r),
      `"${a.id}" and "${b.id}" overlap, so the prompt will flicker between them`);
  }
}

// --- walking actually moves you, and walls actually stop you ---------------
hub.enterHub();
const before = { x: H.player.x, y: H.player.y };
for (let i = 0; i < 30; i++) hub.updateHub(1 / 60, { x: 0, y: -1 }, { w: 960, h: 540 });
check(H.player.y < before.y - 20, 'walking north did not move the player north');
check(H.player.dir === 'north', `facing should follow the walk, got ${H.player.dir}`);
check(H.player.moving, 'the player should report as moving while walking');

hub.enterHub();
for (let i = 0; i < 600; i++) hub.updateHub(1 / 60, { x: -1, y: 0 }, { w: 960, h: 540 });
check(H.player.x > 0, 'the player walked out through the west wall');
check(!hub.isSolid(Math.floor(H.player.x / TILE), Math.floor(H.player.y / TILE)),
  'the player ended up inside a solid tile');
console.log('walking           ok (moves, faces, and is stopped by the world)');

// --- the floor only ever holds materials the atlas can draw ----------------
const known = new Set(MATERIALS);
let unknown = 0;
for (let i = 0; i < H.floor.length; i++) if (!known.has(MATERIALS[H.floor[i]])) unknown++;
check(unknown === 0, `${unknown} tiles carry a material with no name`);

// --- and the camera stays inside the map ----------------------------------
hub.enterHub();
for (let i = 0; i < 600; i++) hub.updateHub(1 / 60, { x: 1, y: 1 }, { w: 960, h: 540 });
check(H.cam.x <= hub.WORLD_W - 480 + 1 && H.cam.y <= hub.WORLD_H - 270 + 1,
  'the camera showed empty space past the south-east corner');
console.log('camera            ok (clamped to the map)');


// --- the renderer runs -----------------------------------------------------
// Not a picture test — a headless canvas draws nothing. This catches the class
// of mistake that is otherwise invisible until somebody opens the camp in a
// browser: a misspelled context call, a sprite accessor that does not exist, a
// prop name in the map that the atlas has never heard of. All of those throw on
// the first frame, and the first frame is exactly what this draws.
const { renderHub } = await import('../src/game/hubRender.js');
const { makeCanvas } = await import('./dom-stub.mjs');
const canvas = makeCanvas();
canvas.width = 960;
canvas.height = 540;
const ctx = canvas.getContext('2d');

hub.enterHub();
// With a teammate standing next to us, so the avatar and name-tag paths are
// covered too — they only ever run when somebody else is here.
H.others = [{
  id: 'p2', name: 'Ece', charId: 'ranger',
  x: SPAWN.x + 40, y: SPAWN.y, dir: 'south', moving: true, frame: 1, sortY: SPAWN.y,
}];
let threw = null;
try {
  for (let i = 0; i < 3; i++) {
    hub.updateHub(1 / 60, { x: 1, y: 0 }, { w: 960, h: 540 });
    renderHub(ctx, canvas, 1);
  }
} catch (e) {
  threw = e;
}
check(!threw, `drawing the hall threw: ${threw && threw.message}`);
console.log('render            ok (three frames, with a teammate on screen)');

// Every prop the map places must be a prop the atlas actually ships, or it
// draws as a grey box and nobody notices until they walk past it.
const { RTP_PROPS } = await import('../src/art/rtp.js');
const shipped = new Set(RTP_PROPS);
const missing = [...new Set(H.props.map((p) => p.prop))].filter((n) => !shipped.has(n));
check(missing.length === 0, `the map places props the atlas does not have: ${missing.join(', ')}`);
if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('\nAll Hearthhall checks passed.');
