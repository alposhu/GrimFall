// ---------------------------------------------------------------------------
// screenfit.js — filling the screen on a phone, and being honest when we can't.
//
// WHY AN IPAD GOES BORDERLESS AND AN IPHONE DOES NOT.
//
// Nothing in the page decides this. iPadOS Safari implements the Fullscreen API
// and iPhone Safari does not — `requestFullscreen` simply is not there on the
// phone, on any iOS version to date. So the same build, on the same account, on
// two devices from the same maker, behaves differently, and no amount of CSS
// changes it: a web page cannot hide Safari's address bar on an iPhone. There
// is no flag to set and no meta tag that does it.
//
// There is exactly one route to a borderless game on an iPhone, and it is Add
// to Home Screen. The manifest already asks for `display: fullscreen` and the
// page already carries `apple-mobile-web-app-capable`, so a home-screen icon
// launches with no browser interface at all. That is a thing the player has to
// do, which means the honest response is to tell them it exists — once — rather
// than pretend the difference is not there.
//
// Everywhere the API does exist (Android, desktop, iPad) this just asks for
// fullscreen on the first tap, which is the only moment a browser will grant it.
// ---------------------------------------------------------------------------

const TIP_KEY = 'grimfallHomeTip';

/** Already launched from a home-screen icon, or otherwise chrome-free. */
export function isStandalone() {
  if (typeof navigator !== 'undefined' && navigator.standalone) return true;
  try {
    return matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
  } catch (e) { return false; }
}

export function canFullscreen() {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

/**
 * An iPhone or iPod in Safari, where fullscreen is not offered at all.
 *
 * Deliberately narrow. iPads report as a Mac in modern iOS and DO have the
 * API, so they are excluded by the capability check rather than by sniffing —
 * a browser that grows fullscreen support tomorrow stops seeing the tip
 * without anyone editing this list.
 */
export function isPhoneWithoutFullscreen() {
  if (typeof navigator === 'undefined') return false;
  const iphone = /iPhone|iPod/.test(navigator.platform || navigator.userAgent || '');
  return iphone && !canFullscreen() && !isStandalone();
}

/**
 * Ask for the whole screen. Must be called from inside a real user gesture —
 * every browser refuses otherwise, silently.
 *
 * Never throws and never reports failure upwards: this is a nicety, and a
 * refusal is not a problem the player needs to hear about.
 */
export function goFullscreen() {
  if (!canFullscreen() || isStandalone()) return;
  const el = document.documentElement;
  try {
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' })
      : el.webkitRequestFullscreen();
    p?.catch?.(() => {});
  } catch (e) { /* denied, or already there */ }
}

/** Should the "add it to your home screen" line be shown? */
export function shouldOfferHomeScreen() {
  if (!isPhoneWithoutFullscreen()) return false;
  try { return localStorage.getItem(TIP_KEY) !== 'done'; } catch (e) { return true; }
}

export function dismissHomeScreenTip() {
  try { localStorage.setItem(TIP_KEY, 'done'); } catch (e) { /* private window */ }
}
