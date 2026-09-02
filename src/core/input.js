// ---------------------------------------------------------------------------
// input.js — unified movement input from keyboard, gamepad and touch.
// Exposes a single analog vector so gameplay code never branches on device.
// ---------------------------------------------------------------------------

import { clamp } from './util.js';

const keys = new Set();
const justPressed = new Set();

export const input = {
  x: 0,            // analog move vector, |(x,y)| <= 1
  y: 0,
  usingTouch: false,
  joystickMode: 'fixed',
};

let zone = null, base = null, thumb = null;
let touchId = null;
let originX = 0, originY = 0;
const RADIUS = 58;

const KEY_MAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

export function initInput({ zoneEl, baseEl, thumbEl } = {}) {
  zone = zoneEl || null; base = baseEl || null; thumb = thumbEl || null;

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const a = KEY_MAP[e.code];
    if (a) { keys.add(a); e.preventDefault(); }
    justPressed.add(e.code);
  });
  addEventListener('keyup', (e) => {
    const a = KEY_MAP[e.code];
    if (a) keys.delete(a);
  });
  addEventListener('blur', () => { keys.clear(); releaseStick(); });

  // The on-screen stick is optional. Keyboard and gamepad are wired above and
  // work without it, so a caller with no stick to offer — a preview page, an
  // embed, a keyboard-only build — gets input rather than a thrown error that
  // takes the whole module down with it.
  if (!zone) return;

  zone.addEventListener('pointerdown', onDown, { passive: false });
  zone.addEventListener('pointermove', onMove, { passive: false });
  zone.addEventListener('pointerup', onUp);
  zone.addEventListener('pointercancel', onUp);
  zone.addEventListener('contextmenu', (e) => e.preventDefault());
}

function onDown(e) {
  if (touchId !== null) return;
  input.usingTouch = true;
  touchId = e.pointerId;
  zone.setPointerCapture(e.pointerId);
  if (input.joystickMode === 'dynamic') {
    originX = e.clientX; originY = e.clientY;
    placeBase(originX, originY);
  } else {
    const r = base.getBoundingClientRect();
    originX = r.left + r.width / 2;
    originY = r.top + r.height / 2;
  }
  base.classList.add('active');
  onMove(e);
  e.preventDefault();
}

function onMove(e) {
  if (e.pointerId !== touchId) return;
  let dx = e.clientX - originX;
  let dy = e.clientY - originY;
  const len = Math.hypot(dx, dy);
  const cl = Math.min(len, RADIUS);
  const nx = len > 0 ? dx / len : 0;
  const ny = len > 0 ? dy / len : 0;
  // Small dead-zone so a resting thumb does not drift the character.
  const mag = cl < 8 ? 0 : clamp((cl - 8) / (RADIUS - 8), 0, 1);
  input.x = nx * mag;
  input.y = ny * mag;
  thumb.style.transform = `translate(${nx * cl}px, ${ny * cl}px)`;
  e.preventDefault();
}

function onUp(e) {
  if (e.pointerId !== touchId) return;
  releaseStick();
}

function releaseStick() {
  touchId = null;
  input.x = 0; input.y = 0;
  if (thumb) thumb.style.transform = 'translate(0,0)';
  if (base) base.classList.remove('active');
}

function placeBase(x, y) {
  const host = zone.getBoundingClientRect();
  base.style.left = `${x - host.left}px`;
  base.style.top = `${y - host.top}px`;
}

export function setJoystickMode(mode) {
  input.joystickMode = mode;
  if (zone) zone.classList.toggle('dynamic', mode === 'dynamic');
  if (base && mode === 'fixed') { base.style.left = ''; base.style.top = ''; }
  releaseStick();
}

/**
 * Drop any held stick. Called when the game takes control away mid-drag (a
 * pause, a level-up); without it the character keeps the last direction when
 * play resumes because the finger never produced a pointerup we saw.
 */
export function resetStick() { releaseStick(); }

export function showJoystick(on) {
  if (zone) zone.style.display = on ? 'block' : 'none';
  if (!on) releaseStick();
}

/** Called once per frame: folds keyboard + gamepad into the analog vector. */
export function pollInput() {
  let kx = 0, ky = 0;
  if (keys.has('left')) kx -= 1;
  if (keys.has('right')) kx += 1;
  if (keys.has('up')) ky -= 1;
  if (keys.has('down')) ky += 1;

  if (kx || ky) {
    const l = Math.hypot(kx, ky);
    input.x = kx / l; input.y = ky / l;
    input.usingTouch = false;
    return;
  }

  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    let ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    if (p.buttons[14]?.pressed) ax = -1;
    if (p.buttons[15]?.pressed) ax = 1;
    if (p.buttons[12]?.pressed) ay = -1;
    if (p.buttons[13]?.pressed) ay = 1;
    const mag = Math.hypot(ax, ay);
    if (mag > 0.18) {
      const scale = Math.min(1, (mag - 0.18) / 0.62) / mag;
      input.x = ax * scale; input.y = ay * scale;
      input.usingTouch = false;
      return;
    }
    if (p.buttons[9]?.pressed) justPressed.add('Escape');
  }

  if (touchId === null) { input.x = 0; input.y = 0; }
}

export function consumePressed(code) {
  if (justPressed.has(code)) { justPressed.delete(code); return true; }
  return false;
}

export function clearPressed() { justPressed.clear(); }

export const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
