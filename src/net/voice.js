// ---------------------------------------------------------------------------
// voice.js — talking to the others, over WebRTC.
//
// WHY THIS DOES NOT GO THROUGH THE SERVER.
//
// Audio is the one thing in this game that would be expensive to relay. Four
// people talking is four continuous streams the server would have to receive,
// copy three times and send back out, forever, on a free instance that also
// has a game to run. WebRTC lets the browsers send it to each other directly,
// so the server's only job is to introduce them: it forwards a handful of
// small setup messages (server/index.js, MSG.SIGNAL) and then has nothing more
// to do with the call. It never carries or hears the audio.
//
// A mesh — everyone connected to everyone — rather than a mixer, because at
// four people that is three connections each and the arithmetic never gets
// worse. Above about six it would, and then this file would need a different
// shape; it does not need one now.
//
// WHAT CAN GO WRONG, HONESTLY.
//
// Two browsers behind unusual home routers sometimes cannot find a direct path
// to each other at all. The usual fix is a TURN server, which relays the audio
// and therefore costs money and bandwidth to run. There is none here, so a
// small number of pairs will fail to connect: they will see the others listed
// but hear nothing from one of them. Text chat always works, which is why it
// is not built on any of this.
// ---------------------------------------------------------------------------

import * as net from './connection.js';

// Public STUN only. A STUN server is asked one question — "what does my address
// look like from outside?" — and carries no audio, which is why it is safe to
// use somebody else's and why several are listed: if one is unreachable the
// browser simply tries the next.
const ICE = [{
  urls: [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
  ],
}];

const peers = new Map();            // playerId -> { pc, audio, level }
let local = null;                   // MediaStream, or null when the mic is off
let live = false;
let onChange = () => {};

let audioCtx = null;
const meters = new Map();           // playerId -> { analyser, data }
let meterTimer = 0;

export const voiceOn = () => live;
export const voiceSupported = () => typeof RTCPeerConnection !== 'undefined'
  && !!navigator.mediaDevices?.getUserMedia;

export function setVoiceListener(fn) { onChange = fn || (() => {}); }

/**
 * Turn the microphone on.
 *
 * Rejects with something worth showing a player. The browser's own errors are
 * accurate and unreadable — `NotAllowedError` is what you get both for "the
 * person said no" and for "this page is not allowed to ask", which are
 * different problems with different fixes.
 */
export async function startVoice() {
  if (live) return;
  if (!voiceSupported()) throw new Error('this browser cannot do voice chat');
  try {
    local = await navigator.mediaDevices.getUserMedia({
      // The three that matter in a room where several people are playing the
      // same game out loud: without cancellation everyone hears the game twice,
      // once from their own speakers and once through somebody else's mic.
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  } catch (e) {
    const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
    throw new Error(denied
      ? 'the microphone was blocked — allow it in the address bar'
      : 'no microphone was found');
  }
  live = true;
  net.setVoice(true);
  meter(net.selfPlayerId(), local);
  // Anyone already here needs the new track; anyone arriving later picks it up
  // when their peer connection is built.
  for (const [id, p] of peers) {
    for (const track of local.getTracks()) p.pc.addTrack(track, local);
    if (initiates(id)) negotiate(id);
  }
  onChange();
}

export function stopVoice() {
  if (!live) return;
  live = false;
  net.setVoice(false);
  local?.getTracks().forEach((t) => t.stop());
  local = null;
  meters.delete(net.selfPlayerId());
  // The peer connections stay up. Muting is not leaving: the others are still
  // talking and we are still listening to them.
  for (const p of peers.values()) {
    p.pc.getSenders().forEach((s) => { if (s.track) p.pc.removeTrack(s); });
  }
  onChange();
}

/**
 * Who is in the room now. Called on every lobby update.
 *
 * The connection to each teammate is made by exactly one of the two, chosen by
 * comparing ids — otherwise both offer at once, each rejects the other's offer
 * as out of turn, and the call silently never forms. This is the oldest trap in
 * WebRTC and the cheapest to avoid.
 */
export function syncPeers(players) {
  const self = net.selfPlayerId();
  const here = new Set(players.map((p) => p.id).filter((id) => id !== self));

  for (const id of here) if (!peers.has(id)) {
    open(id);
    if (initiates(id)) negotiate(id);
  }
  for (const id of [...peers.keys()]) if (!here.has(id)) close(id);
}

/** Ids are 'p1', 'p2'…; the lower number offers. */
function initiates(other) {
  const n = (id) => Number(String(id).slice(1)) || 0;
  return n(net.selfPlayerId()) < n(other);
}

function open(id) {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const audio = new Audio();
  audio.autoplay = true;
  // Not attached to the document: an <audio> element plays perfectly well
  // detached, and putting four of them in the page would mean four sets of
  // browser controls appearing in the middle of the lobby.
  const entry = { pc, audio, level: 0 };
  peers.set(id, entry);

  if (local) for (const track of local.getTracks()) pc.addTrack(track, local);

  pc.onicecandidate = (e) => {
    if (e.candidate) net.signal(id, { candidate: e.candidate });
  };
  pc.ontrack = (e) => {
    const [stream] = e.streams;
    audio.srcObject = stream;
    // Autoplay of an inbound stream is allowed once the page has been
    // interacted with, and getting here always involved clicking a button.
    audio.play().catch(() => {});
    meter(id, stream);
    onChange();
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') {
      // One dead pair must not take the rest of the call down. Rebuild it, and
      // let it stay broken if it breaks again.
      close(id);
      open(id);
      if (initiates(id)) negotiate(id);
    }
    onChange();
  };
  return entry;
}

function close(id) {
  const p = peers.get(id);
  if (!p) return;
  try { p.pc.close(); } catch (e) { /* already closed */ }
  p.audio.srcObject = null;
  peers.delete(id);
  meters.delete(id);
  onChange();
}

async function negotiate(id) {
  const p = peers.get(id);
  if (!p) return;
  try {
    const offer = await p.pc.createOffer();
    await p.pc.setLocalDescription(offer);
    net.signal(id, { sdp: p.pc.localDescription });
  } catch (e) { /* the state changed underneath us; the retry comes from above */ }
}

/** An offer, an answer or a candidate has arrived from `from`. */
export async function handleSignal({ from, data }) {
  if (!from || !data) return;
  const entry = peers.get(from) || open(from);
  const { pc } = entry;
  try {
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        if (local) for (const track of local.getTracks()) {
          if (!pc.getSenders().some((s) => s.track === track)) pc.addTrack(track, local);
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        net.signal(from, { sdp: pc.localDescription });
      }
    } else if (data.candidate) {
      await pc.addIceCandidate(data.candidate);
    }
  } catch (e) { /* a candidate arriving before its description is normal */ }
}

/** Tear the whole call down — leaving the room, or losing the connection. */
export function endVoice() {
  for (const id of [...peers.keys()]) close(id);
  stopVoice();
  if (meterTimer) { clearInterval(meterTimer); meterTimer = 0; }
  meters.clear();
  try { audioCtx?.close(); } catch (e) { /* nothing open */ }
  audioCtx = null;
}

/**
 * Watch how loud a stream is, so the lobby can show who is talking.
 *
 * A name that lights up when its owner speaks is what tells you the call is
 * working. Without it, silence is ambiguous: nobody talking and nothing
 * connected look identical.
 */
function meter(id, stream) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    meters.set(id, { analyser, data: new Uint8Array(analyser.frequencyBinCount) });
  } catch (e) { return; }

  // One timer for every meter, at a rate that reads as immediate without
  // costing anything. Per-stream animation frames would be four times the work
  // for a dot that is either lit or not.
  if (!meterTimer) meterTimer = setInterval(tick, 120);
}

function tick() {
  let changed = false;
  for (const [id, m] of meters) {
    m.analyser.getByteFrequencyData(m.data);
    let sum = 0;
    for (const v of m.data) sum += v;
    const level = sum / m.data.length;
    const speaking = level > 12;         // above room noise, below a whisper
    const was = id === net.selfPlayerId() ? selfSpeaking : peers.get(id)?.speaking;
    if (id === net.selfPlayerId()) selfSpeaking = speaking;
    else if (peers.has(id)) peers.get(id).speaking = speaking;
    if (was !== speaking) changed = true;
  }
  if (changed) onChange();
}

let selfSpeaking = false;

/** Who is audibly talking right now, as a set of player ids. */
export function speaking() {
  const out = new Set();
  if (live && selfSpeaking) out.add(net.selfPlayerId());
  for (const [id, p] of peers) if (p.speaking) out.add(id);
  return out;
}

/** Whether we have a working audio path to this player. */
export function connectedTo(id) {
  const p = peers.get(id);
  return !!p && (p.pc.connectionState === 'connected' || p.pc.iceConnectionState === 'connected');
}
