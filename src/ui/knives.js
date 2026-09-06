// ---------------------------------------------------------------------------
// knives.js (ui) — the board on Oswin's wall.
//
// The rules and the scoring are in src/game/knives.js. This runs the sweep and
// draws where the knives went.
//
// THIS ONE DOES NEED A FRAME LOOP.
//
// Cups is timed by a schedule, because two players must see the same shuffle at
// the same moment. This is the opposite: it is a reflex test, so what matters is
// that the marker on screen is exactly where the game thinks it is at the
// instant of the press. Anything that lets the drawing drift from the model —
// a CSS animation the JS cannot query, an interpolated position — turns a
// missed bullseye into an argument. So the position comes from the clock on
// every frame, and the press reads the same function the drawing does.
//
// Timing is taken from `performance.now()` at the press rather than from the
// last frame's value: on a 30fps phone the last frame can be 33ms stale, which
// at the fastest sweep is a fifth of the board.
// ---------------------------------------------------------------------------

import * as game from '../game/knives.js';
import * as purse from '../game/purse.js';
import * as net from '../net/connection.js';
import { GAME } from '../net/protocol.js';
import { sfx } from '../core/audio.js';

let el = null;
let board = null;
let mode = 'solo';
let raf = 0;
let startedAt = 0;
let others = [];
let off = null;

function note(text) { el.knivesNote.textContent = text; }

/** The marker, as a percentage across the board's width. */
function frame() {
  if (!board || board.done) { raf = 0; return; }
  const t = (performance.now() - startedAt) / 1000;
  const pos = game.markerAt(t, board.throws.length);
  el.knivesMarker.style.left = `${(pos + 1) * 50}%`;
  raf = requestAnimationFrame(frame);
}

function startSweep() {
  startedAt = performance.now();
  if (!raf) raf = requestAnimationFrame(frame);
}

function stopSweep() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

/** Draw one knife where it landed. */
function pinKnife(pos, points) {
  const k = document.createElement('span');
  k.className = 'knife';
  k.style.left = `${(pos + 1) * 50}%`;
  k.title = `${points}`;
  el.knivesBoard.append(k);
}

function renderScore() {
  el.knivesTotal.textContent = game.boardTotal(board);
  el.knivesLeft.textContent = game.KNIVES - board.throws.length;
  el.knivesPurse.textContent = purse.purseCoin();
}

function finish() {
  stopSweep();
  const total = game.boardTotal(board);
  const want = game.prize(total);
  const paid = want ? purse.payOut(want) : 0;
  renderScore();

  if (total >= game.PERFECT) {
    sfx('levelup');
    note(`Three in the pin. ${paid} gold, and Oswin will not forget it.`);
  } else if (paid > 0) {
    sfx('coin');
    note(`${total} on the board. ${paid} gold.`);
  } else if (want > 0) {
    note(`${total} on the board — worth ${want}, but the house is out of coin.`);
  } else {
    sfx('back');
    note(`${total}. Oswin says nothing, which is worse.`);
  }

  if (mode === 'table') net.relay({ t: GAME.KNIVES, k: 'board', wire: game.toWire(board) });
  renderOthers();
  el.knivesThrowBtn.hidden = true;
  el.knivesAgainBtn.hidden = false;
}

function renderOthers() {
  const rows = [{ name: 'You', total: game.boardTotal(board), mine: true }, ...others]
    .sort((a, b) => b.total - a.total);
  el.knivesTable.replaceChildren(...rows.map((r, i) => {
    const li = document.createElement('li');
    li.className = 'dice-row' + (i === 0 && rows.length > 1 ? ' is-winner' : '');
    const name = document.createElement('span');
    name.className = 'dice-who';
    name.textContent = r.name;
    const score = document.createElement('strong');
    score.className = 'dice-score';
    score.textContent = r.total;
    li.append(name, score);
    return li;
  }));
  el.knivesTable.hidden = rows.length < 2;
}

function throwNow() {
  if (!board || board.done) return;
  // Read the clock here, not from the last drawn frame — see the note at the
  // top. This is the whole difference between fair and infuriating.
  const t = (performance.now() - startedAt) / 1000;
  const pos = game.markerAt(t, board.throws.length);
  const hit = game.throwKnife(board, pos);
  if (!hit) return;

  sfx(hit.points >= 25 ? 'hit' : 'select');
  pinKnife(pos, hit.points);
  renderScore();

  if (board.done) { finish(); return; }
  note(`${hit.name} — ${hit.points}. ${game.KNIVES - board.throws.length} to go, and it speeds up.`);
  startSweep();
}

function begin() {
  stopSweep();
  board = game.newBoard('You');
  el.knivesBoard.querySelectorAll('.knife').forEach((k) => k.remove());
  el.knivesThrowBtn.hidden = false;
  el.knivesAgainBtn.hidden = true;
  renderScore();
  renderOthers();
  note('Three knives. It gets faster with each one.');
  startSweep();
}

export function openKnives(asMode) {
  mode = asMode;
  others = [];
  begin();
}

export function closeKnives() {
  stopSweep();
  board = null;
}

export function initKnives(elements) {
  el = elements;
  if (!el.knivesScreen) return;

  el.knivesThrowBtn.addEventListener('click', throwNow);
  el.knivesAgainBtn.addEventListener('click', begin);

  // The board is the target, so pressing it is the natural way to throw.
  el.knivesBoard.addEventListener('pointerdown', (e) => { e.preventDefault(); throwNow(); });

  off = net.on('relay', (msg) => {
    if (mode !== 'table') return;
    const p = msg?.payload;
    if (p?.t !== GAME.KNIVES || p.k !== 'board') return;
    const theirs = game.fromWire(p.wire);
    const who = net.lobbyState()?.players.find((q) => q.id === msg.from);
    others = others.filter((o) => o.id !== msg.from);
    others.push({ id: msg.from, name: who?.name || theirs.name, total: game.boardTotal(theirs) });
    renderOthers();
  });
}

export function disposeKnives() { off?.(); off = null; }
