// ---------------------------------------------------------------------------
// supper.js (ui) — Marta's kitchen, on screen.
//
// The rules are in src/game/supper.js and have no DOM in them. This is the
// rail, the stations, and the clock.
//
// A FRAME LOOP, BECAUSE EVERY TICKET IS ITS OWN CLOCK.
//
// Cups is driven by a schedule and the board by the wall clock; this needs the
// actual elapsed time, because five countdown bars are draining at once and a
// dropped frame must shorten none of them. The model is ticked with the REAL
// delta and the bars are drawn from it, so a phone that stutters loses smooth
// motion and not tickets.
//
// THE RAIL IS REBUILT, NOT DIFFED.
//
// Five to eight tickets, twice a second-ish. Reconciling that by hand is a
// class of bug — a stale key, a bar bound to a ticket that has gone — for no
// gain anybody could measure. The countdown bars are the exception: those are
// written every frame by width alone, which touches no layout.
// ---------------------------------------------------------------------------

import * as game from '../game/supper.js';
import * as purse from '../game/purse.js';
import * as net from '../net/connection.js';
import { GAME } from '../net/protocol.js';
import { sfx } from '../core/audio.js';
import { rtpProp } from '../art/rtp.js';

let el = null;
let shift = null;
let mode = 'solo';
let raf = 0;
let last = 0;
let selected = null;
let off = null;
let paid = 0;

const me = () => net.selfPlayerId() || 'me';

function note(text) { el.supperNote.textContent = text; }

/** A station button, with the inn's own art on it where the atlas has it. */
function buildStations() {
  el.supperStations.replaceChildren(...game.STATIONS.map((st) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'station';
    b.dataset.station = st.id;

    const art = rtpProp(st.prop, 0.66);
    if (art) {
      const holder = document.createElement('span');
      holder.className = 'station-art';
      holder.append(art);
      b.append(holder);
    }
    const label = document.createElement('span');
    label.className = 'station-name';
    label.textContent = st.name;
    b.append(label);

    b.addEventListener('click', () => useStation(st.id));
    return b;
  }));
}

function ticketEl(t) {
  const li = document.createElement('li');
  li.className = 'ticket';
  li.dataset.key = t.key;
  const mine = t.claimedBy === me();
  if (selected === t.key) li.classList.add('is-mine');
  if (t.claimedBy && !mine) li.classList.add('is-taken');

  const name = document.createElement('span');
  name.className = 'ticket-name';
  name.textContent = t.name;

  const steps = document.createElement('span');
  steps.className = 'ticket-steps';
  t.steps.forEach((id, i) => {
    const chip = document.createElement('span');
    chip.className = 'step' + (i < t.done ? ' is-done' : '') + (i === t.done ? ' is-next' : '');
    chip.textContent = game.STATIONS.find((s) => s.id === id)?.name || id;
    steps.append(chip);
  });

  const bar = document.createElement('span');
  bar.className = 'ticket-bar';
  const fill = document.createElement('span');
  fill.className = 'ticket-fill';
  bar.append(fill);

  li.append(name, steps, bar);
  if (t.claimedBy && !mine) {
    const who = document.createElement('span');
    who.className = 'ticket-who';
    who.textContent = net.lobbyState()?.players.find((p) => p.id === t.claimedBy)?.name || 'taken';
    li.append(who);
  }

  li.addEventListener('click', () => selectTicket(t.key));
  return li;
}

function renderRail() {
  el.supperRail.replaceChildren(...shift.tickets.map(ticketEl));
  paintBars();
}

/** Only the widths, every frame. Cheap, and it touches no layout. */
function paintBars() {
  for (const li of el.supperRail.children) {
    const t = game.ticketAt(shift, li.dataset.key);
    if (!t) continue;
    const frac = Math.max(0, Math.min(1, t.left / t.life));
    const fill = li.querySelector('.ticket-fill');
    if (fill) {
      fill.style.width = `${frac * 100}%`;
      fill.classList.toggle('is-urgent', frac < 0.3);
    }
  }
}

function renderStats() {
  el.supperScore.textContent = shift.score;
  el.supperServed.textContent = shift.served;
  el.supperLives.textContent = Math.max(0, game.LIVES - shift.lost);
  el.supperClock.textContent = Math.ceil(Math.max(0, shift.left));
}

function selectTicket(key) {
  if (!shift || shift.over) return;
  const t = game.ticketAt(shift, key);
  if (!t || (t.claimedBy && t.claimedBy !== me())) return;
  selected = key;
  if (mode === 'table') net.relay({ t: GAME.SUPPER, ...game.toWire('claim', key) });
  game.claim(shift, key, me());
  renderRail();
}

function useStation(stationId) {
  if (!shift || shift.over) return;
  // Nothing selected: take the ticket that needs this ingredient next and is
  // closest to expiring. It is what a cook would do, and it keeps the game
  // playable one-handed rather than making you aim at a ticket first.
  if (!selected || !game.ticketAt(shift, selected)) {
    const candidate = shift.tickets
      .filter((t) => !t.claimedBy || t.claimedBy === me())
      .filter((t) => t.steps[t.done] === stationId)
      .sort((a, b) => a.left - b.left)[0];
    if (!candidate) { sfx('nofunds'); return; }
    selected = candidate.key;
    game.claim(shift, selected, me());
    if (mode === 'table') net.relay({ t: GAME.SUPPER, ...game.toWire('claim', selected) });
  }

  const key = selected;
  const outcome = game.useStation(shift, key, stationId, me());
  if (!outcome) return;

  if (mode === 'table') {
    net.relay({ t: GAME.SUPPER, ...game.toWire('use', key, { station: stationId }) });
  }

  if (outcome === 'served') {
    sfx('coin');
    selected = null;
    note('Away!');
  } else if (outcome === 'spoiled') {
    sfx('hurt');
    note('Wrong thing. Start that one again.');
  } else {
    sfx('select');
  }
  renderRail();
  renderStats();
}

function frame(now) {
  if (!shift || shift.over) { raf = 0; return; }
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;

  const before = shift.tickets.length;
  const { wrote, expired } = game.tick(shift, dt);

  if (expired.length) {
    sfx('back');
    if (selected && !game.ticketAt(shift, selected)) selected = null;
  }
  if (wrote || expired.length || shift.tickets.length !== before) renderRail();
  else paintBars();

  renderStats();
  if (shift.over) { finish(); return; }
  raf = requestAnimationFrame(frame);
}

function finish() {
  raf = 0;
  const want = game.prize(shift);
  paid = want ? purse.payOut(want) : 0;
  renderStats();
  el.supperStations.classList.add('is-closed');
  el.supperAgainBtn.hidden = false;

  const how = shift.ended === 'lost'
    ? `Three gone cold. ${shift.served} served.`
    : `Service over. ${shift.served} served.`;
  if (paid > 0) {
    sfx('levelup');
    note(`${how} Marta pays you ${paid} gold.`);
  } else if (want > 0) {
    note(`${how} Worth ${want}, but the house is out of coin.`);
  } else {
    note(`${how} Marta says nothing.`);
  }
  if (mode === 'table') net.relay({ t: GAME.SUPPER, ...game.toWire('over', null, { score: shift.score }) });
}

function begin() {
  if (raf) cancelAnimationFrame(raf);
  const lobby = net.lobbyState();
  const cooks = mode === 'table' && lobby ? Math.max(1, lobby.players.length) : 1;
  shift = game.newShift(Date.now(), cooks);
  selected = null;
  paid = 0;
  el.supperStations.classList.remove('is-closed');
  el.supperAgainBtn.hidden = true;
  // One ticket to start with, so the kitchen is never staring at an empty rail.
  game.writeTicket(shift);
  renderRail();
  renderStats();
  note(cooks > 1
    ? `${cooks} in the kitchen. Take a ticket each — you cannot both cook the same one.`
    : 'Tickets come in. Build each one in order, before it goes cold.');
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

export function openSupper(asMode) {
  mode = asMode;
  el.supperPurse.textContent = purse.purseCoin();
  begin();
}

export function closeSupper() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  shift = null;
}

export function initSupper(elements) {
  el = elements;
  if (!el.supperScreen) return;
  buildStations();
  el.supperAgainBtn.addEventListener('click', () => {
    el.supperPurse.textContent = purse.purseCoin();
    begin();
  });

  // Another cook's hands. Applied to the same shared shift, so the rail on
  // every screen agrees about who is holding what.
  off = net.on('relay', (msg) => {
    if (!shift || mode !== 'table') return;
    const p = msg?.payload;
    if (p?.t !== GAME.SUPPER) return;
    if (p.k === 'claim') game.claim(shift, p.key, msg.from);
    else if (p.k === 'use') game.useStation(shift, p.key, p.station, msg.from);
    else if (p.k === 'over') return;
    renderRail();
    renderStats();
  });
}

export function disposeSupper() { off?.(); off = null; }
