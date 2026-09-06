// ---------------------------------------------------------------------------
// cups.js (ui) — Piet's cups, on screen.
//
// The rules are in src/game/cups.js and know nothing about the DOM. This drives
// the animation and nothing else: three cups slide between three slots, the
// coin is shown, hidden, and shown again.
//
// THE ANIMATION IS THE GAME.
//
// Everything else here could be a list of numbers and it would still be
// correct, and it would not be playable — the whole thing is watching. So the
// cups move with a CSS transition rather than by redrawing, which gets real
// interpolation and a GPU for free, and the swap timing comes from one
// setTimeout chain rather than from a frame loop: a dropped frame must not
// change WHEN a swap happened, only how smoothly it drew, or two players
// watching the same seeded shuffle would disagree about it.
// ---------------------------------------------------------------------------

import * as game from '../game/cups.js';
import * as purse from '../game/purse.js';
import * as net from '../net/connection.js';
import { GAME } from '../net/protocol.js';
import { sfx } from '../core/audio.js';

let el = null;
let g = null;
let mode = 'solo';
let timers = [];
let slots = [0, 1, 2];      // slot -> which cup element is standing there
let off = null;

const SLOT_X = [-104, 0, 104];   // where the three slots are, in pixels

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

function note(text) { el.cupsNote.textContent = text; }

/** Put every cup where its slot says, and say whether it should animate. */
function place(animate) {
  for (let slot = 0; slot < game.CUPS; slot++) {
    const cup = el.cupsRow.children[slots[slot]];
    if (!cup) continue;
    cup.style.transition = animate ? `transform ${animate}ms cubic-bezier(.45,.05,.35,1)` : 'none';
    // The stylesheet composes this with the lift; setting `transform` here
    // directly would drop the lift the moment a cup slid.
    cup.style.setProperty('--x', `${SLOT_X[slot]}px`);
  }
}

function setLifted(on) {
  for (const cup of el.cupsRow.children) cup.classList.toggle('is-lifted', on);
}

/** The coin sits under whichever SLOT the game says, so it rides the shuffle. */
function showCoin(slot) {
  el.cupsCoin.hidden = slot < 0;
  if (slot >= 0) el.cupsCoin.style.transform = `translateX(${SLOT_X[slot]}px)`;
}

function renderScore() {
  el.cupsStreak.textContent = g.streak;
  el.cupsBest.textContent = g.best;
  el.cupsPurse.textContent = purse.purseCoin();
}

/**
 * Run one round: show the coin, drop the cups, swap, then ask.
 *
 * Chained timeouts rather than a frame loop, so the schedule is the same on a
 * slow machine as a fast one — see the note at the top for why that matters
 * when a table is watching the same shuffle.
 */
function play() {
  clearTimers();
  const shape = game.deal(g);
  slots = [0, 1, 2];
  place(0);
  setLifted(true);
  showCoin(g.start);
  renderScore();

  note(`Round ${g.round + 1}. Watch the coin.`);
  el.cupsRow.classList.remove('is-live');

  const PEEK = 1100;
  timers.push(setTimeout(() => {
    setLifted(false);
    showCoin(-1);
    sfx('back');
    g.phase = 'shuffling';
    note('…');

    g.swaps.forEach(([a, b], i) => {
      timers.push(setTimeout(() => {
        // Swap which cup stands in slot a and slot b, then let CSS move them.
        const t = slots[a]; slots[a] = slots[b]; slots[b] = t;
        place(Math.round(shape.speed * 0.82));
      }, i * shape.speed));
    });

    timers.push(setTimeout(() => {
      g.phase = 'choose';
      el.cupsRow.classList.add('is-live');
      note('Where is it?');
    }, g.swaps.length * shape.speed + 120));
  }, PEEK));
}

function reveal(result) {
  el.cupsRow.classList.remove('is-live');
  setLifted(true);
  // `g.coin` is already a SLOT — the swaps move slots, and resolve() follows
  // the coin through them. The reveal is not deciding anything, only lifting
  // the cup that has been standing over it the whole time.
  showCoin(g.coin);

  let paid = 0;
  if (result.correct) paid = purse.payOut(result.prize);
  renderScore();

  if (!result.correct) {
    sfx('hurt');
    note(`Not that one. ${g.best ? `Your best run was ${g.best}.` : ''} Again?`);
  } else if (paid > 0) {
    sfx('coin');
    note(`Right. ${paid} gold, and that is ${result.streak} in a row.`);
  } else {
    sfx('select');
    note(`Right — ${result.streak} in a row. The house is out of coin, though.`);
  }

  if (mode === 'table') {
    net.relay({ t: GAME.CUPS, k: 'result', wire: game.toWire(g), correct: result.correct });
  }
  el.cupsAgainBtn.hidden = false;
  el.cupsAgainBtn.querySelector('span').textContent = result.correct ? 'Again' : 'Start over';
}

export function openCups(asMode) {
  mode = asMode;
  // A table shares one seed so everybody watches the identical shuffle. Alone,
  // the clock will do.
  const lobby = net.lobbyState();
  g = game.newGame(mode === 'table' && lobby ? hashCode(lobby.code) : Date.now());
  el.cupsAgainBtn.hidden = true;
  renderScore();
  note(mode === 'table'
    ? 'Everyone here watches the same shuffle. Piet insists on it.'
    : 'Piet sets out three cups and a coin.');
  play();
}

/** A room code makes a perfectly good shared seed and needs no round trip. */
function hashCode(code) {
  let h = 2166136261;
  for (const ch of String(code)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function closeCups() {
  clearTimers();
  g = null;
}

export function initCups(elements) {
  el = elements;
  if (!el.cupsScreen) return;

  for (let i = 0; i < game.CUPS; i++) {
    const cup = document.createElement('button');
    cup.type = 'button';
    cup.className = 'cup';
    cup.setAttribute('aria-label', `Cup ${i + 1}`);
    cup.addEventListener('click', () => {
      if (!g || g.phase !== 'choose') return;
      // The cup element was clicked; the game thinks in SLOTS, so ask where
      // this element is standing rather than which one it was made as.
      const slot = slots.indexOf(i);
      const result = game.pick(g, slot);
      if (result) reveal(result);
    });
    el.cupsRow.append(cup);
  }
  place(0);

  el.cupsAgainBtn.addEventListener('click', () => {
    el.cupsAgainBtn.hidden = true;
    play();
  });

  off = net.on('relay', (msg) => {
    if (!g || mode !== 'table') return;
    const p = msg?.payload;
    if (p?.t !== GAME.CUPS || p.k !== 'result') return;
    const who = net.lobbyState()?.players.find((q) => q.id === msg.from);
    if (!who) return;
    note(p.correct
      ? `${who.name} got it — ${p.wire.streak} in a row.`
      : `${who.name} lost the coin.`);
  });
}

export function disposeCups() { off?.(); off = null; }
