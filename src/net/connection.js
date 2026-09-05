// ---------------------------------------------------------------------------
// connection.js — the client half of the co-op link.
//
// Everything the rest of the game knows about the network goes through here.
// The game modules never see a WebSocket, a message type or a JSON payload;
// they subscribe to events with meaning ("lobby", "started", "denied") and call
// verbs ("create", "join", "ready"). That boundary is deliberate: it is what
// will let later phases change the wire format — batching, delta encoding,
// binary frames — without touching a single line of gameplay code.
//
// PHASE 1 handles connection and lobby only.
// ---------------------------------------------------------------------------

import { MSG, cleanName, MAX_CHAT } from './protocol.js';
import { serverUrl } from './config.js';

let socket = null;
let selfId = null;
let lobby = null;
const listeners = {};

/** 'offline' | 'connecting' | 'online' */
let status = 'offline';

function emit(event, payload) { (listeners[event] || []).forEach((f) => f(payload)); }

export function on(event, fn) {
  (listeners[event] ||= []).push(fn);
  return () => { listeners[event] = listeners[event].filter((f) => f !== fn); };
}

function setStatus(next, detail = '') {
  if (status === next) return;
  status = next;
  emit('status', { status, detail });
}

export const connectionStatus = () => status;
export const selfPlayerId = () => selfId;
export const lobbyState = () => lobby;
export const isHost = () => !!lobby && lobby.hostId === selfId;

function send(type, data = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify({ type, ...data }));
  return true;
}

/**
 * Open the link. Resolves once the server has said hello, or rejects with a
 * reason worth showing a player — "could not reach the server" is the whole
 * truth available to a browser, which cannot tell a wrong address from a
 * server that is down.
 */
export function connect() {
  const url = serverUrl();
  if (!url) return Promise.reject(new Error('this build has no multiplayer server configured'));
  if (socket && status === 'online') return Promise.resolve();

  // Every browser this game supports has WebSocket, so this is really a guard
  // for Node: the suites drive this module directly, and Node had no global
  // WebSocket before 22. Without the check the ReferenceError lands in the
  // catch below and is reported as "could not reach the server" — which sent a
  // CI failure looking for a network problem that was never there.
  if (typeof WebSocket === 'undefined') {
    setStatus('offline');
    return Promise.reject(new Error('this runtime has no WebSocket (Node 22+ is required)'));
  }

  setStatus('connecting');
  return new Promise((resolve, reject) => {
    let settled = false;
    try {
      socket = new WebSocket(url);
    } catch (e) {
      setStatus('offline');
      reject(new Error('could not reach the server'));
      return;
    }

    // A browser will happily sit in CONNECTING for a very long time against a
    // host that silently drops packets, which to a player is indistinguishable
    // from the game having frozen.
    const giveUp = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { socket.close(); } catch (e) { /* nothing to close */ }
      setStatus('offline');
      reject(new Error('could not reach the server'));
    }, 8000);

    socket.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      switch (msg.type) {
        case MSG.WELCOME:
          clearTimeout(giveUp);
          settled = true;
          setStatus('online');
          resolve();
          break;
        case MSG.LOBBY:
          lobby = msg;
          // The server assigns ids; the client learns its own by finding the
          // row that appeared when it joined. Simpler than a separate message,
          // and it stays correct if the list is ever reordered.
          if (!selfId) selfId = msg.players[msg.players.length - 1]?.id || null;
          emit('lobby', msg);
          break;
        case MSG.STARTED:
          lobby = { ...lobby, started: true };
          emit('started', msg);
          break;
        case MSG.DENIED:
          emit('denied', msg);
          break;
        case MSG.PING:
          send(MSG.PONG);
          break;
        case MSG.SAID:
          emit('said', msg);
          break;
        case MSG.HISTORY:
          emit('history', msg);
          break;
        case MSG.SIGNAL:
          // Voice call setup. Passed out untouched, exactly like RELAY — this
          // module introduces the two browsers and has no part in the call.
          emit('signal', msg);
          break;
        case MSG.RELAY:
          // Gameplay. Handed straight out; this module has no opinion on what
          // is inside and deliberately never grows one.
          emit('relay', msg);
          break;
        default:
          break;
      }
    };

    socket.onclose = () => {
      clearTimeout(giveUp);
      const wasOnline = status === 'online';
      socket = null;
      selfId = null;
      lobby = null;
      setStatus('offline');
      if (wasOnline) emit('lost', {});
      if (!settled) { settled = true; reject(new Error('could not reach the server')); }
    };

    // `onerror` carries no useful detail in any browser, by design — it is a
    // privacy boundary. `onclose` always follows it, so the reporting lives
    // there and this only exists to stop an unhandled event.
    socket.onerror = () => {};
  });
}

export function disconnect() {
  if (!socket) return;
  send(MSG.LEAVE);
  try { socket.close(1000, 'left'); } catch (e) { /* already closing */ }
  socket = null;
  selfId = null;
  lobby = null;
  setStatus('offline');
}

export const createGame = (name) => send(MSG.CREATE, { name: cleanName(name) });
export const joinGame = (code, name) => send(MSG.JOIN, { code, name: cleanName(name) });
export const setReady = (ready) => send(MSG.READY, { ready: !!ready });
export const startGame = () => send(MSG.START);
export const newCode = () => send(MSG.RECODE);
export const sendChat = (text) => send(MSG.CHAT, { text: String(text).slice(0, MAX_CHAT) });
export const setVoice = (on) => send(MSG.VOICE, { on: !!on });
export const signal = (to, data) => send(MSG.SIGNAL, { to, data });

/**
 * Send a gameplay payload to the room, or to one player.
 *
 * Addressed sends matter more than they look: a damage delta only concerns the
 * client that owns the creature, so broadcasting it would waste three messages
 * out of four in a full game — on the busiest message the protocol has.
 */
export const relay = (payload, to = null) => send(MSG.RELAY, to ? { to, payload } : { payload });
