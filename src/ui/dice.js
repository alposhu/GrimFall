// ---------------------------------------------------------------------------
// dice.js (ui) — the table, on screen.
//
// The rules live in src/game/dice.js and know nothing about the DOM. This is
// the other half: five dice you can click to keep, one button that changes
// meaning once, and everybody's hand listed underneath as it arrives.
//
// ALONE AND TOGETHER ARE THE SAME SCREEN.
//
// Not two modes with a branch through the middle — one round, and the only
// difference is who else is at the table. Alone, Old Ren sits down. In a party,
// whoever is in the lobby does. The screen does not ask which it is anywhere
// except when deciding whether to send the result, because everything else
// about it is identical, and a minigame with two implementations is a minigame
// with one of them broken.
// ---------------------------------------------------------------------------

import * as game from '../game/dice.js';
import * as purse from '../game/purse.js';
import * as net from '../net/connection.js';
import { GAME } from '../net/protocol.js';
import { sfx } from '../core/audio.js';

let el = null;
let hooks = {};
let round = null;
let mode = game.SOLO;
let off = null;
let paid = 0;

/** A die face, drawn as pips rather than a glyph, so it reads at any size. */
const PIPS = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

function dieEl(value, kept, onClick) {
  const d = document.createElement('button');
  d.type = 'button';
  d.className = 'die' + (kept ? ' is-kept' : '');
  d.setAttribute('aria-label', `${value}${kept ? ', kept' : ''}`);
  for (let i = 0; i < 9; i++) {
    const pip = document.createElement('span');
    pip.className = 'pip' + (PIPS[value].includes(i) ? ' on' : '');
    d.append(pip);
  }
  if (onClick) d.addEventListener('click', onClick);
  else d.disabled = true;
  return d;
}

function note(text) { el.diceNote.textContent = text; }

function renderHand() {
  const hand = round.hands.me;
  el.diceHand.replaceChildren(...(hand ? hand.dice.map((v, i) => dieEl(
    v, hand.keep[i],
    hand.rerolled || hand.done ? null : () => { game.keep(round, 'me', i); renderHand(); },
  )) : []));

  const rolled = !!hand;
  el.diceRollBtn.hidden = rolled;
  el.diceRerollBtn.hidden = !rolled || hand.rerolled;
  el.diceStandBtn.hidden = !rolled || hand.done;
  el.diceAgainBtn.hidden = round.phase !== 'done';

  if (!rolled) note('Five dice, one re-roll, highest total takes it.');
  else if (!hand.rerolled) note('Tap the dice you want to keep, then throw the rest again — or stand.');
  else if (!hand.done) note(`You have ${game.total(hand)}. Stand on it?`);
}

function renderTable() {
  const rows = round.order
    .map((id) => round.hands[id])
    .filter((h) => h && h.done)
    .sort((a, b) => game.total(b) - game.total(a));

  el.diceTable.replaceChildren(...rows.map((h) => {
    const li = document.createElement('li');
    li.className = 'dice-row';
    if (round.winner?.kind === 'win' && round.winner.hand === h) li.classList.add('is-winner');
    if (round.winner?.kind === 'draw' && round.winner.hands.includes(h)) li.classList.add('is-draw');

    const name = document.createElement('span');
    name.className = 'dice-who';
    name.textContent = h.id === 'me' ? 'You' : h.name;

    const dice = document.createElement('span');
    dice.className = 'dice-mini';
    dice.append(...h.dice.map((v) => dieEl(v, false, null)));

    const score = document.createElement('strong');
    score.className = 'dice-score';
    score.textContent = game.total(h);

    li.append(name, dice, score);
    return li;
  }));

  el.dicePurse.textContent = purse.purseCoin();
  if (round.winner) {
    const w = round.winner;
    const coin = paid > 0 ? ` ${paid} gold.` : '';
    note(w.kind === 'draw'
      ? `A draw on ${w.score}.${coin || ' Nobody pays.'}`
      : (w.hand.id === 'me'
        ? `You take it with ${w.score}.${coin || ' The house is out of coin.'}`
        : `${w.hand.name} takes it with ${w.score}.`));
  }
}

/** Everybody has thrown — or we are alone and Ren has. Settle it. */
function maybeSettle() {
  if (round.phase === 'done') return;
  if (!game.everybodyDone(round)) return;
  const result = game.settle(round);
  // Only a hand YOU are in pays you, and only out of what the house has left.
  const mine = result?.kind === 'draw'
    ? result.hands.some((h) => h.id === 'me')
    : result?.hand?.id === 'me';
  paid = mine ? purse.payOut(game.prize(result)) : 0;
  sfx(mine && result.kind === 'win' ? 'levelup' : 'select');
  renderHand();
  renderTable();
}

function begin() {
  paid = 0;
  round = game.newRound();
  // In a party the round is keyed off the room so everybody rolls into the same
  // one; alone it is just a number. Either way the dice themselves are rolled
  // locally — there is nothing here worth cheating at, and a server that had to
  // arbitrate a friendly game would be a server nobody could play without.
  if (mode === game.SOLO) game.playRen(round);
  renderHand();
  renderTable();
}

export function openDice(asMode) {
  mode = asMode;
  begin();
  note(mode === game.SOLO
    ? 'Old Ren sits down opposite you.'
    : 'Everyone at the table throws. Highest total takes it.');
}

export function closeDice() {
  round = null;
}

export function initDice(elements, callbacks = {}) {
  el = elements;
  hooks = callbacks;
  if (!el.diceScreen) return;

  el.diceRollBtn.addEventListener('click', () => {
    sfx('select');
    game.roll(round, 'me', 'You');
    renderHand();
  });

  el.diceRerollBtn.addEventListener('click', () => {
    sfx('select');
    game.reroll(round, 'me');
    renderHand();
  });

  el.diceStandBtn.addEventListener('click', () => {
    sfx('select');
    const hand = game.stand(round, 'me');
    if (mode === game.TABLE) net.relay({ t: GAME.DICE, k: 'hand', hand: game.handToWire(hand) });
    renderHand();
    renderTable();
    maybeSettle();
  });

  el.diceAgainBtn.addEventListener('click', () => {
    sfx('select');
    if (mode === game.TABLE) net.relay({ t: GAME.DICE, k: 'again' });
    begin();
  });

  // Somebody else at the table threw, or called for another round.
  off = net.on('relay', (msg) => {
    if (!round || mode !== game.TABLE) return;
    const p = msg?.payload;
    if (p?.t !== GAME.DICE) return;
    if (p.k === 'hand') {
      game.handFromWire(round, msg.from, p.hand);
      renderTable();
      maybeSettle();
    } else if (p.k === 'again') {
      begin();
    }
  });
}

export function disposeDice() { off?.(); off = null; }
