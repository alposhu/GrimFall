// ---------------------------------------------------------------------------
// ws.js — a minimal WebSocket server, RFC 6455, with no dependencies.
//
// This project has never had an npm dependency and serve.js already speaks
// HTTP and server-sent events by hand, so the co-op server speaks WebSocket by
// hand too. What is actually needed here is small: JSON text frames between a
// browser and one Node process, on a connection that stays open.
//
// What this deliberately DOES implement, because leaving any of it out produces
// a socket that works until it doesn't:
//   - the handshake, which is a SHA-1 of the client key and a fixed GUID
//   - all three payload length forms (7-bit, 16-bit, 64-bit)
//   - unmasking: every frame a browser sends is masked, and a server that
//     ignores the mask reads garbage the moment a payload is non-trivial
//   - continuation frames, since a browser may split a large message
//   - ping/pong and the closing handshake
//
// What it does NOT implement, on purpose: extensions (permessage-deflate),
// binary frames, and subprotocol negotiation. None are needed for JSON, and
// each is a meaningful amount of code to get right.
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// A co-op message is a few hundred bytes. Anything approaching a megabyte is
// either a bug or someone poking at the server, and both end the connection.
const MAX_MESSAGE = 1 << 20;

const OP = { CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa };

/**
 * Complete the HTTP upgrade and return a live connection, or null if the
 * request was not a WebSocket handshake.
 */
export function accept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  const upgrade = String(req.headers.upgrade || '').toLowerCase();
  if (upgrade !== 'websocket' || !key || req.headers['sec-websocket-version'] !== '13') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  const digest = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n'
    + 'Upgrade: websocket\r\n'
    + 'Connection: Upgrade\r\n'
    + `Sec-WebSocket-Accept: ${digest}\r\n\r\n`,
  );
  return new Conn(socket);
}

function frame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) {
    head = Buffer.alloc(2);
    head[1] = len;
  } else if (len < 65536) {
    head = Buffer.alloc(4);
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  head[0] = 0x80 | opcode;            // FIN set: this server never fragments
  return Buffer.concat([head, payload]);
}

class Conn {
  constructor(socket) {
    this.socket = socket;
    this.open = true;
    this.buf = Buffer.alloc(0);
    this.fragOp = 0;
    this.frags = [];
    this.fragLen = 0;
    this.handlers = { message: [], close: [] };
    this.alive = true;

    socket.setNoDelay(true);          // co-op updates are small and latency-bound
    socket.on('data', (chunk) => {
      this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
      try {
        this.#drain();
      } catch (e) {
        this.close(1002, 'protocol error');
      }
    });
    socket.on('error', () => this.#dead());
    socket.on('close', () => this.#dead());
    // `end` matters as much as `close` here, and it is the one that actually
    // fires. A socket taken over from an HTTP upgrade is half-open by nature:
    // when the peer goes away Node reports `end` and then waits for THIS side
    // to end too, so a connection that only watches `close` never learns the
    // player has gone and leaves them standing in the lobby forever.
    socket.on('end', () => { this.#dead(); socket.end(); });
  }

  on(event, fn) { this.handlers[event]?.push(fn); return this; }

  send(obj) {
    if (!this.open) return;
    try {
      this.socket.write(frame(OP.TEXT, Buffer.from(JSON.stringify(obj), 'utf8')));
    } catch (e) { this.#dead(); }
  }

  ping() {
    if (!this.open) return;
    try { this.socket.write(frame(OP.PING, Buffer.alloc(0))); } catch (e) { this.#dead(); }
  }

  close(code = 1000, reason = '') {
    if (!this.open) return;
    const body = Buffer.alloc(2 + Buffer.byteLength(reason));
    body.writeUInt16BE(code, 0);
    body.write(reason, 2);
    try {
      this.socket.write(frame(OP.CLOSE, body));
      this.socket.end();
    } catch (e) { /* already gone */ }
    this.#dead();
  }

  #dead() {
    if (!this.open) return;
    this.open = false;
    this.handlers.close.forEach((f) => f());
  }

  #drain() {
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;

      const fin = (b[0] & 0x80) !== 0;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;

      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) { this.close(1009, 'too large'); return; }
        len = Number(big);
        off = 10;
      }

      // A client that sends unmasked frames is not a browser. Per the RFC this
      // is a protocol error and the connection must fail rather than be read.
      if (!masked) { this.close(1002, 'unmasked'); return; }
      if (b.length < off + 4 + len) return;          // frame not fully arrived

      const mask = b.subarray(off, off + 4);
      const data = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);

      this.#frame(fin, opcode, data);
      if (!this.open) return;
    }
  }

  #frame(fin, opcode, data) {
    switch (opcode) {
      case OP.PING:
        try { this.socket.write(frame(OP.PONG, data)); } catch (e) { this.#dead(); }
        return;
      case OP.PONG:
        this.alive = true;
        return;
      case OP.CLOSE:
        this.close(1000, '');
        return;
      case OP.BINARY:
        this.close(1003, 'text only');
        return;
      case OP.TEXT:
      case OP.CONT: {
        if (opcode === OP.TEXT) { this.frags = []; this.fragLen = 0; }
        this.fragLen += data.length;
        if (this.fragLen > MAX_MESSAGE) { this.close(1009, 'too large'); return; }
        this.frags.push(data);
        if (!fin) return;
        const text = Buffer.concat(this.frags).toString('utf8');
        this.frags = [];
        this.fragLen = 0;
        let msg;
        try { msg = JSON.parse(text); } catch (e) { return; }   // ignore junk
        this.handlers.message.forEach((f) => f(msg));
        return;
      }
      default:
        this.close(1002, 'bad opcode');
    }
  }
}
