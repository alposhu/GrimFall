// ---------------------------------------------------------------------------
// coop.js — the lobby screen.
//
// This is the only part of the interface that knows multiplayer exists. It
// talks to src/net/connection.js in verbs and events and never touches a
// socket, so the wire format can change underneath it without this file
// noticing.
//
// The screen has three states and one element per state, toggled with `hidden`:
// choosing (host or join), and waiting in a room. Connecting is not a state of
// its own — it is a disabled button and a line of text, because a spinner that
// replaces the whole screen loses the code someone has half typed.
// ---------------------------------------------------------------------------

import * as net from '../net/connection.js';
import * as voice from '../net/voice.js';
import { multiplayerAvailable } from '../net/config.js';
import { normaliseCode, MAX_PLAYERS } from '../net/protocol.js';

let el = null;
let hooks = {};
let unsubscribe = [];
let enteredRoom = false;

const NAME_KEY = 'grimfallName';

function note(text, kind = '') {
  el.coopNote.textContent = text;
  el.coopNote.className = `coop-note${kind ? ' ' + kind : ''}`;
}

function rememberedName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; }
}

function rememberName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* private window */ }
}

/**
 * Draw the player list. Rebuilt wholesale on every lobby message rather than
 * diffed: it is at most four rows, and a list this small is not worth the class
 * of bug that reconciliation invites.
 */
function renderLobby(state) {
  el.coopSetup.hidden = true;
  el.coopRoom.hidden = false;
  el.coopCodeOut.textContent = state.code;

  // The first lobby message is the moment this stopped being a form and became
  // a room with people in it, so that is when the camp opens. Once only: every
  // later update would otherwise throw the player back outside whatever they
  // had opened.
  if (!enteredRoom) {
    enteredRoom = true;
    hooks.onCoopRoom?.();
  }

  const talking = voice.speaking();
  el.coopPlayers.replaceChildren(...state.players.map((p) => {
    const li = document.createElement('li');
    li.className = 'coop-player';
    if (p.id === net.selfPlayerId()) li.classList.add('is-self');

    const name = document.createElement('span');
    name.className = 'coop-player-name';
    name.textContent = p.name;

    // A microphone that is on but silent looks exactly like one that failed to
    // connect, so the dot reports both: present when the mic is live, lit while
    // that person is actually making sound.
    if (p.voice) {
      const mic = document.createElement('span');
      mic.className = 'coop-mic' + (talking.has(p.id) ? ' is-talking' : '');
      mic.title = talking.has(p.id) ? `${p.name} is talking` : `${p.name} has a microphone on`;
      li.append(mic);
    }

    const tag = document.createElement('span');
    tag.className = 'coop-tag';
    // The host is never shown as "waiting": they are the one being waited FOR,
    // and a host reading "waiting" next to their own name reasonably concludes
    // the button is broken.
    if (p.id === state.hostId) { tag.textContent = 'host'; tag.classList.add('is-host'); }
    else if (p.ready) { tag.textContent = 'ready'; tag.classList.add('is-ready'); }
    else tag.textContent = 'waiting';

    li.append(name, tag);
    return li;
  }));

  const me = state.players.find((p) => p.id === net.selfPlayerId());
  const host = net.isHost();
  el.coopRecodeBtn.hidden = !host;
  el.coopReadyBtn.hidden = host;
  el.coopReadyBtn.querySelector('span').textContent = me?.ready ? 'Not ready' : "I'm ready";
  el.coopStartBtn.hidden = !host;

  // The call follows the room: someone who joins is dialled, someone who leaves
  // is hung up on. Doing it here means there is one place where "who is in this
  // game" is decided, rather than a second list that can disagree with the
  // first.
  if (voice.voiceSupported()) voice.syncPeers(state.players);

  const others = state.players.filter((p) => p.id !== state.hostId);
  const waiting = others.filter((p) => !p.ready).length;
  el.coopStartBtn.disabled = others.length === 0 || waiting > 0;

  if (host) {
    if (others.length === 0) note(`Waiting for someone to join. Up to ${MAX_PLAYERS} can play.`);
    else if (waiting > 0) note(`Waiting for ${waiting} player${waiting > 1 ? 's' : ''} to be ready.`);
    else note('Everyone is ready.', 'good');
  } else {
    note(me?.ready ? 'Waiting for the host to start.' : 'Mark yourself ready when you are.');
  }
}

/**
 * Add one line to the log.
 *
 * Appended rather than re-rendered from a list: chat only ever grows at the
 * bottom, and rebuilding it would throw away the scroll position of anyone
 * reading back through it.
 */
function addLine(line) {
  const li = document.createElement('li');
  const system = !line.from;
  li.className = 'coop-line' + (system ? ' is-system' : '');

  if (!system) {
    const who = document.createElement('span');
    who.className = 'coop-line-who';
    if (line.from === net.selfPlayerId()) who.classList.add('is-self');
    who.textContent = line.name;
    li.append(who);
  }
  const what = document.createElement('span');
  what.className = 'coop-line-text';
  // textContent, never innerHTML. This is the one string in the game that
  // arrives from another person, and it is displayed as the characters they
  // typed rather than as markup.
  what.textContent = line.text;
  li.append(what);

  // Follow the newest line only for someone already at the bottom. Yanking the
  // view down while they are reading older messages is worse than missing one.
  const atEnd = el.coopLog.scrollHeight - el.coopLog.scrollTop - el.coopLog.clientHeight < 40;
  el.coopLog.append(li);
  while (el.coopLog.children.length > 60) el.coopLog.firstElementChild.remove();
  if (atEnd) el.coopLog.scrollTop = el.coopLog.scrollHeight;
}

function clearLog() { el.coopLog.replaceChildren(); }

/** Reflect the mic button's state — it is a toggle, so it must read as one. */
function renderMic(text) {
  const on = voice.voiceOn();
  el.coopMicBtn.setAttribute('aria-pressed', String(on));
  el.coopMicBtn.classList.toggle('is-on', on);
  el.coopMicBtn.querySelector('span').textContent = text || (on ? 'Mic on' : 'Mic off');
}

async function toggleMic() {
  if (!voice.voiceSupported()) { note('This browser cannot do voice chat.', 'bad'); return; }
  el.coopMicBtn.disabled = true;
  try {
    if (voice.voiceOn()) voice.stopVoice();
    else { renderMic('Asking…'); await voice.startVoice(); }
    note('');
  } catch (e) {
    note(e.message, 'bad');
  } finally {
    el.coopMicBtn.disabled = false;
    renderMic();
  }
}

function toSetup() {
  el.coopRoom.hidden = true;
  el.coopSetup.hidden = false;
}

/** Connect if we are not already, reporting failure in the one place. */
async function ensure(action) {
  el.coopHostBtn.disabled = true;
  el.coopJoinBtn.disabled = true;
  note('Connecting…');
  try {
    await net.connect();
    action();
  } catch (e) {
    note(e.message, 'bad');
  } finally {
    el.coopHostBtn.disabled = false;
    el.coopJoinBtn.disabled = false;
  }
}

export function initCoop(elements, callbacks = {}) {
  el = elements;
  hooks = callbacks;
  if (!el.coopScreen) return;

  // The entry point only appears where it can actually work. A build with no
  // server configured hides it rather than offering a button that can only
  // ever apologise.
  if (el.coopBtn) el.coopBtn.hidden = !multiplayerAvailable();

  el.coopName.value = rememberedName();

  el.coopHostBtn.addEventListener('click', () => {
    rememberName(el.coopName.value);
    ensure(() => net.createGame(el.coopName.value));
  });

  el.coopJoinBtn.addEventListener('click', () => {
    const code = normaliseCode(el.coopCode.value);
    if (code.length !== 4) { note('A game code is four characters.', 'bad'); return; }
    rememberName(el.coopName.value);
    ensure(() => net.joinGame(code, el.coopName.value));
  });

  // Typing a code should feel like filling in a form on a machine that only
  // accepts valid codes, so the field corrects as you go rather than rejecting
  // you afterwards.
  el.coopCode.addEventListener('input', () => {
    const at = el.coopCode.selectionStart;
    const clean = normaliseCode(el.coopCode.value);
    if (clean !== el.coopCode.value) {
      el.coopCode.value = clean;
      el.coopCode.setSelectionRange(at, at);
    }
  });
  el.coopCode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.coopJoinBtn.click();
  });

  el.coopReadyBtn.addEventListener('click', () => {
    const me = net.lobbyState()?.players.find((p) => p.id === net.selfPlayerId());
    net.setReady(!me?.ready);
  });

  el.coopStartBtn.addEventListener('click', () => net.startGame());

  // A new code for when the old one has been read out to the wrong person, or
  // left on a stream. Confirmed first: the people already here keep playing,
  // but anyone still trying to type the old code is locked out by it.
  el.coopRecodeBtn.addEventListener('click', () => {
    const n = (net.lobbyState()?.players.length || 1) - 1;
    const warn = n > 0
      ? `Change the code? The ${n === 1 ? 'player' : `${n} players`} already here stay in, but anyone you gave the old code to will not be able to join.`
      : 'Change the code? Anyone you gave the old one to will not be able to join.';
    if (!confirm(warn)) return;
    net.newCode();
  });

  el.coopMicBtn.addEventListener('click', toggleMic);

  el.coopSayForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = el.coopSay.value.trim();
    if (!text) return;
    net.sendChat(text);
    el.coopSay.value = '';
  });

  // The dot next to a name lights while that person is talking, which is the
  // only visible proof the call is working at all.
  voice.setVoiceListener(() => {
    const state = net.lobbyState();
    if (state && !el.coopRoom.hidden) renderLobby(state);
  });

  unsubscribe = [
    net.on('lobby', renderLobby),
    net.on('denied', (m) => note(m.reason, 'bad')),
    net.on('lost', () => { voice.endVoice(); toSetup(); note('The connection dropped.', 'bad'); }),
    net.on('started', (m) => hooks.onCoopStart?.({ ...m, selfId: net.selfPlayerId() })),
    net.on('said', addLine),
    net.on('history', (m) => { clearLog(); m.lines.forEach(addLine); }),
    net.on('signal', voice.handleSignal),
  ];
}

/** Opening the screen never connects — that waits for a deliberate button. */
export function openCoopScreen() {
  renderMic();
  if (net.lobbyState()) renderLobby(net.lobbyState());
  else { toSetup(); note(''); }
}

/**
 * Leaving the screen leaves the game — with one exception. Starting a run also
 * navigates away from this screen, and tearing down the connection at the exact
 * moment the run needs it would be a spectacular way to fail.
 */
export function closeCoopScreen() {
  if (net.lobbyState()?.started) return;
  enteredRoom = false;
  voice.endVoice();
  net.disconnect();
  clearLog();
  toSetup();
  note('');
}

export function disposeCoop() {
  unsubscribe.forEach((off) => off());
  unsubscribe = [];
}
