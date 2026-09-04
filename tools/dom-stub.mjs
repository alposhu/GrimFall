/*
 * dom-stub.mjs — development only.
 *
 * Just enough DOM to load the real UI and boot code in Node: elements are
 * created for every id that appears in index.html, so a typo in a lookup shows
 * up here as a null reference instead of in the browser.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

// ------------------------------------------------------------------ mini DOM
class ClassList {
  constructor(el) { this.el = el; this.set = new Set(); }
  add(...c) { c.forEach((x) => x && this.set.add(x)); this.sync(); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); this.sync(); }
  toggle(c, force) {
    const on = force === undefined ? !this.set.has(c) : !!force;
    if (on) this.set.add(c); else this.set.delete(c);
    this.sync();
  }
  contains(c) { return this.set.has(c); }
  sync() { this.el._className = [...this.set].join(' '); }
}

let ALL = [];

class El {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.style = {
      _p: {},
      setProperty(k, v) { this._p[k] = v; },
      getPropertyValue(k) { return this._p[k] || ''; },
      removeProperty(k) { delete this._p[k]; },
    };
    this.dataset = {};
    this.classList = new ClassList(this);
    this._className = '';
    this._handlers = {};
    this._html = '';
    this._text = '';
    this.hidden = false;
    this.disabled = false;
    this.id = '';
    ALL.push(this);
  }
  get className() { return this._className; }
  set className(v) {
    this._className = v || '';
    this.classList.set = new Set(String(v || '').split(/\s+/).filter(Boolean));
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this._text = ''; this.children.length = 0; }

  // Aggregates the way the real thing does — own text, plus any text inside
  // markup this element was given, plus everything its children hold. Without
  // this a test that reads a built list back sees an empty string and passes
  // for the wrong reason.
  get textContent() {
    return this._text
      + this._html.replace(/<[^>]*>/g, ' ')
      + this.children.map((c) => c.textContent).join(' ');
  }
  set textContent(v) { this._text = v == null ? '' : String(v); this._html = ''; this.children.length = 0; }
  appendChild(c) { this.children.push(c); return c; }
  prepend(...cs) { this.children.unshift(...cs); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 320, height: 128, right: 320, bottom: 128 }; }
  append(...cs) { cs.forEach((c) => this.children.push(c)); }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); }
  setAttribute(k, v) { this[k] = v; }
  getAttribute(k) { return this[k]; }
  addEventListener(type, fn) { (this._handlers[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    const a = this._handlers[type];
    if (!a) return;
    const i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  }
  dispatch(type, ev = {}) { (this._handlers[type] || []).forEach((fn) => fn({ preventDefault() {}, stopPropagation() {}, ...ev })); }
  click() { this.dispatch('click'); }
  querySelector() { return new El(); }
  querySelectorAll(sel) {
    if (sel === '#cards .card') return byId.cards ? byId.cards.children : [];
    return [];
  }
}

const byId = Object.create(null);

// Create an element for every id that actually exists in index.html, so a typo
// in ui.js shows up here as a null-reference instead of in the browser.
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const canvasIds = new Set([...html.matchAll(/<canvas[^>]*\sid="([\w-]+)"/g)].map((m) => m[1]));
for (const m of html.matchAll(/\sid="([\w-]+)"/g)) {
  const el = canvasIds.has(m[1]) ? makeCanvas() : new El();
  el.id = m[1];
  byId[m[1]] = el;
}

const dataActionEls = [];
for (const m of html.matchAll(/data-action="([\w-]+)"/g)) {
  const el = new El('button');
  el.dataset.action = m[1];
  dataActionEls.push(el);
}

const dataDemoEls = [];
for (const m of html.matchAll(/data-demo="([\w-]+)"/g)) {
  const el = new El('div');
  el.dataset.demo = m[1];
  dataDemoEls.push(el);
}

globalThis.document = {
  getElementById: (id) => byId[id] || null,
  createElement: (tag) => (tag === 'canvas' ? makeCanvas() : new El(tag)),
  querySelectorAll: (sel) => (sel === '[data-action]' ? dataActionEls
    : sel === '[data-demo]' ? dataDemoEls : []),
  // Returns null, not an element: callers use this to ask whether a tag is
  // PRESENT (the co-op server address is read from a <meta> the build writes),
  // and a stub that hands back a blank element answers "yes" to every such
  // question, which is the opposite of what a headless run should say.
  querySelector: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  hidden: false,
};

function makeCanvas() {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const c = new El('canvas');
  Object.assign(c, {
    width: 1, height: 1,
    toDataURL: () => 'data:image/png;base64,',
    getContext: () => ({
      canvas: c, imageSmoothingEnabled: false,
      save: noop, restore: noop, translate: noop, scale: noop, rotate: noop, setTransform: noop,
      beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop, ellipse: noop, rect: noop,
      quadraticCurveTo: noop, bezierCurveTo: noop, arcTo: noop, roundRect: noop,
      setLineDash: noop, getLineDash: () => [],
      shadowColor: '', shadowBlur: 0, letterSpacing: '0px',

      fill: noop, stroke: noop, fillRect: noop, strokeRect: noop, clearRect: noop, fillText: noop, strokeText: noop,
      measureText: () => ({ width: 10 }), drawImage: noop,
      createPattern: () => ({}), createLinearGradient: () => gradient, createRadialGradient: () => gradient,
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: noop,
    }),
  });
  return c;
}

// Node has no image decoder, so a stubbed Image reports failure on the next
// tick rather than staying silent. Code that awaits one must not hang here —
// and if it does, that is a real bug worth catching, not a stub artefact.
globalThis.Image = class {
  constructor(w, h) {
    this.width = w || 0; this.height = h || 0;
    this.naturalWidth = 0; this.naturalHeight = 0;
    this.complete = false;
    this.alt = '';
    this._src = '';
  }
  get src() { return this._src; }
  set src(v) {
    this._src = v;
    setTimeout(() => { this.onerror?.({ type: 'error' }); }, 0);
  }
};

const storeData = new Map();
globalThis.localStorage = {
  getItem: (k) => (storeData.has(k) ? storeData.get(k) : null),
  setItem: (k, v) => storeData.set(k, String(v)),
  removeItem: (k) => storeData.delete(k),
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { maxTouchPoints: 0, getGamepads: () => [] },
});
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.devicePixelRatio = 1;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.confirm = () => true;

// The machine this stub is pretending to be: a desktop with a mouse, no touch,
// no reduced-motion preference — which is the same machine the rest of the stub
// already describes (1280x720, zero touch points, devicePixelRatio 1).
//
// Answering these matters rather than returning false to everything, because
// several modules take a genuinely different path on a coarse pointer, and a
// stub that says "no" to every question tests only the branch nobody is on.
const MEDIA = {
  '(hover: hover)': true,
  '(pointer: fine)': true,
  '(pointer: coarse)': false,
  '(prefers-reduced-motion: reduce)': false,
};
globalThis.matchMedia = (q) => ({
  media: q,
  // `and` is the only combinator the game uses, and every clause has to hold.
  matches: q.split(' and ').every((part) => {
    const hit = MEDIA[part.trim()];
    if (hit === undefined) throw new Error(`dom-stub: no answer for media query \`${part.trim()}\``);
    return hit;
  }),
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
});
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 8);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);


export { byId, dataActionEls, dataDemoEls, El, makeCanvas };
