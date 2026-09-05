// ---------------------------------------------------------------------------
// preload.js — fetch the interface before showing it.
//
// THE PROBLEM. The boot bar waited for the things the GAME needs — character
// sheets, market art, every sprite rasterised — and then handed over to a menu
// whose own artwork had not been asked for yet. CSS only requests a background
// image when something that uses it is first painted, so the panel frames, the
// button faces and the display font all began downloading at the moment the
// menu appeared. On a desktop connection that gap is invisible. On a phone it
// is a second or two of hollow rectangles filling in one at a time, which reads
// as a game that is broken rather than one that is loading — the loading screen
// has already finished and promised it was ready.
//
// So the interface is fetched here, before the boot screen is dismissed, and
// the bar covers the whole wait instead of most of it.
//
// A missing file must never hold the game hostage. Every wait below resolves
// rather than rejects, and there is a hard time limit on the lot: a slow CDN or
// one blocked file costs that piece its polish for a few seconds, not the
// player their game.
// ---------------------------------------------------------------------------

/**
 * The interface artwork, as referenced by css/style.css.
 *
 * Kept as a list rather than discovered by parsing the stylesheet at runtime,
 * which would mean shipping a CSS parser to do at load time what is already
 * known at build time. tools/ui-smoke.mjs checks this list against the
 * stylesheet, so the two cannot drift apart quietly.
 */
export const INTERFACE_IMAGES = [
  'img/ui/panel.png',
  'img/ui/panel-2x.png',
  'img/ui/head.png',
  'img/ui/bar.png',
  'img/ui/slot.png',
  'img/ui/button.png',
  'img/ui/button-hover.png',
  'img/ui/button-down.png',
  'img/ui/button-off.png',
  'img/ui/close.png',
  'img/ui/dropdown.png',
  'img/ui/icons.png',
  'img/ui/pause.png',
  'img/ui/market-card.png',
  'img/ui/market-card-on.png',
  'img/ui/cursor.png',
  'img/ui/cursor-press.png',
];

/** Nothing here is worth more than this much of somebody's time. */
const BUDGET_MS = 6000;

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((r) => setTimeout(r, ms))]);
}

/**
 * Pull one image into the cache.
 *
 * `decode()` rather than the load event, because a decoded image is the thing
 * that can be painted without a stall — an image that has arrived but not been
 * decoded still costs a frame the first time it is drawn, which on a phone is
 * exactly the hitch this is meant to remove. Older engines without it fall back
 * to the load event, and either way this resolves on failure.
 */
function pull(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => (img.decode ? img.decode().then(resolve, resolve) : resolve());
    img.onerror = resolve;
    img.src = src;
  });
}

/**
 * Fetch the interface. Calls `onStep()` once per item so the boot bar moves.
 *
 * The font wait is the one that matters most on a phone: a display face that
 * arrives late does not just restyle the menu, it re-lays it out, and buttons
 * visibly change size after the game has said it is ready.
 */
export async function preloadInterface(onStep = () => {}) {
  const started = Date.now();
  const jobs = INTERFACE_IMAGES.map((src) => pull(src).then(() => onStep()));

  // `document.fonts.ready` waits for faces already requested, and nothing has
  // requested the display face yet at this point — so ask for the two the menu
  // is built from, then wait.
  if (document.fonts?.load) {
    try {
      await withTimeout(Promise.all([
        document.fonts.load('400 16px "Pixelify Sans"'),
        document.fonts.load('700 16px "Pixelify Sans"'),
        document.fonts.load('400 16px "Chakra Petch"'),
      ]), BUDGET_MS);
    } catch (e) { /* a face that will not load is a face the fallback covers */ }
  }
  jobs.push(withTimeout(document.fonts?.ready || Promise.resolve(), BUDGET_MS));

  await withTimeout(Promise.all(jobs), Math.max(0, BUDGET_MS - (Date.now() - started)));
}

/** How many steps `preloadInterface` will report, for sizing the bar. */
export const PRELOAD_STEPS = INTERFACE_IMAGES.length;
