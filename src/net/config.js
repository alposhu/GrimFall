// ---------------------------------------------------------------------------
// config.js — where the co-op server lives.
//
// The game ships as static files to itch.io and GitHub Pages, so there is no
// environment to read at runtime and no bundler to substitute a constant. The
// address is therefore resolved from three places, most specific first:
//
//   1. `localStorage.grimfallServer` — a per-browser override. This is how you
//      point one tab at a laptop on the LAN while testing, without a rebuild.
//   2. <meta name="grimfall-server"> in index.html — written by the build from
//      the GRIMFALL_SERVER environment variable, which ALSO widens the CSP to
//      that exact origin. The two come from one variable on purpose: a build
//      that knows the address but forbids connecting to it is a build that
//      fails in the browser with no visible cause.
//   3. The page's own origin, when it was served over plain http. That is the
//      one-machine case: somebody is running the game at home and their friends
//      opened their address, so the co-op server is on that same machine.
//
// Multiplayer being OFF by default is the point. A build made without setting
// GRIMFALL_SERVER is byte-for-byte as locked down as the game was before any
// of this existed.
// ---------------------------------------------------------------------------

const DEV_PORT = 5174;

function fromStorage() {
  try { return localStorage.getItem('grimfallServer') || ''; } catch (e) { return ''; }
}

function fromMeta() {
  if (typeof document === 'undefined' || !document.querySelector) return '';
  const tag = document.querySelector('meta[name="grimfall-server"]');
  const v = tag?.getAttribute('content')?.trim() || '';
  // The build writes a placeholder when no address was configured; treat that
  // as absent rather than trying to connect to the literal word.
  return v && !v.startsWith('__') ? v : '';
}

/**
 * Whoever served this page is also running the game server.
 *
 * This is what makes playing on one network work with no hosting and no
 * configuration at all: one person runs the game on their machine, everyone
 * else opens THEIR address, and the page connects the co-op server back to the
 * same machine it was just downloaded from. Nobody types an address twice and
 * nobody has to know what a port is.
 *
 * Restricted to plain http on purpose, and it is not a limitation so much as a
 * statement of what is possible. A page served over https may only open a
 * `wss://` socket — browsers refuse the insecure one and barely say why — and
 * `wss://` needs a TLS certificate, which needs a domain name, which a machine
 * on somebody's living-room wifi does not have. So http means "someone is
 * hosting this locally, connect back to them", and https means "this is a real
 * deployment, use the address the build was given".
 */
function fromPageOrigin() {
  if (typeof location === 'undefined') return '';
  if (location.protocol !== 'http:') return '';
  const h = location.hostname;
  if (!h || h === '0.0.0.0') return '';
  return `ws://${h}:${DEV_PORT}`;
}

/** The server URL, or '' when this build has no multiplayer. */
export function serverUrl() {
  const raw = fromStorage() || fromMeta() || fromPageOrigin();
  if (!raw) return '';
  // Accept an https:// address and turn it into wss:// — that is the form
  // people paste, and getting the scheme wrong is a silent connection failure.
  return raw.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
}

export const multiplayerAvailable = () => serverUrl() !== '';
