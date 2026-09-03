// ---------------------------------------------------------------------------
// cursor.js — the click animation on the pointer.
//
// `cursor` is not an animatable CSS property: there is no transition, no
// keyframes, nothing that will step a cursor through a set of images. The only
// way to move it is to keep changing what it points at, which is what this
// does — three frames on `pointerdown`, then out of the way.
//
// The frames come off the book kit's animation sheet, are cut by
// tools/assets/build-ui-art.py onto the same canvas as the two still cursors,
// and are addressed here by nothing more than a custom property.
//
// This file knows about exactly one name, `--tap`. It does not know what a
// button is, or a link, or a disabled control. css/style.css feeds `--tap`
// into the three inherited properties every cursor in the interface is drawn
// from, so the burst reaches all of them and neither file has to keep a list
// of the other's elements.
// ---------------------------------------------------------------------------

const FRAMES = 3;
const HOLD = 55;          // ms per frame — the whole burst is under a fifth of a second

let timer = null;
let frame = 0;

function stop() {
  clearTimeout(timer);
  timer = null;
  frame = 0;
  document.documentElement.classList.remove('tapping');
}

// A relative `url()` in a custom property is resolved against the STYLESHEET
// that reads it, not against the page - so `img/ui/...` set from here comes out
// as /css/img/ui/... , because the rule using it lives in css/style.css. Every
// frame 404s and the pointer vanishes for a fifth of a second on every click.
//
// Resolved against the document instead, which is also the only form that
// survives being served from a subdirectory - a hard-coded `/img/...` would
// break the moment this is hosted anywhere but the root of a domain.
const url = (n) => `url("${new URL(`img/ui/cursor-tap${n}.png`, document.baseURI).href}")`;

function step() {
  frame++;
  if (frame > FRAMES) { stop(); return; }
  document.documentElement.style.setProperty('--tap', url(frame));
  timer = setTimeout(step, HOLD);
}

export function initCursor() {
  // Same test the stylesheet uses. A finger has no cursor to animate, and a
  // stylus fires `pointerdown` just as happily, so this is a real guard and not
  // an optimisation.
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    clearTimeout(timer);
    frame = 0;
    // The frame goes on before the class does. Both land in the same tick, so
    // nothing could paint between them either way, but a `.tapping` with no
    // `--tap` behind it is a state where the pointer is defined in terms of a
    // property that does not exist yet, and that is not a state worth having.
    step();
    document.documentElement.classList.add('tapping');
  });

  // A click that opens a native dialog, or drags focus out of the window, can
  // leave the last frame on screen with no `pointerup` to follow it. Cheap
  // insurance against a pointer stuck mid-spark.
  addEventListener('blur', stop);
  addEventListener('pointercancel', stop);
}
