// ---------------------------------------------------------------------------
// backup.js — taking your progress off the browser and putting it back.
//
// Everything the game remembers lives in localStorage, which is a worse place
// to keep it than most players assume. Clearing site data wipes it. Private
// windows never keep it. On itch.io a game is served from a per-project
// subdomain, so the same game uploaded again under a different project has a
// different origin and cannot see it. And a phone is not the same device as a
// laptop.
//
// So: one file, holding the meta progression and all four run slots, that a
// player can download and feed back in anywhere. It is plain JSON — readable,
// editable, and possible to inspect before trusting it — with a magic string
// and a version so the importer can tell it apart from any other file that
// happens to be dropped on it.
//
// Nothing here trusts the file. Import validates the envelope, then hands each
// slot to the same reader the game uses at boot, which whitelists fields and
// tolerates rubbish. A hand-edited save can cheat the player's own game; that
// is their business. It must not be able to break it.
// ---------------------------------------------------------------------------

import * as store from './storage.js';
import { SLOTS, VERSION as SAVE_VERSION, readSlot, writeSlot, clearSlot } from './saves.js';

const MAGIC = 'grimfall.backup';
const FORMAT = 1;
export const FILE_EXT = '.grimsave';

/** Everything worth keeping, as a plain object. */
export function collect() {
  const slots = {};
  for (const slot of SLOTS) {
    const d = readSlot(slot);
    if (d) slots[slot] = d;
  }
  return {
    magic: MAGIC,
    format: FORMAT,
    saveVersion: SAVE_VERSION,
    exportedAt: new Date().toISOString(),
    game: 'Grimfall',
    meta: store.meta(),
    records: store.records(),
    settings: store.settings(),
    slots,
  };
}

/** A filename with the date in it, so a folder of these sorts sensibly. */
export function suggestedName(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
    + `-${p(now.getHours())}${p(now.getMinutes())}`;
  return `grimfall-${stamp}${FILE_EXT}`;
}

/**
 * Write the backup to the player's device.
 * @returns {{ ok: boolean, name?: string, error?: string }}
 */
export function exportToFile() {
  let url = null;
  try {
    const text = JSON.stringify(collect(), null, 2);
    const name = suggestedName();
    const blob = new Blob([text], { type: 'application/json' });
    url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    // Firefox needs the anchor in the document for a programmatic click.
    document.body.appendChild(a);
    a.click();
    a.remove();
    return { ok: true, name };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : 'could not write the file' };
  } finally {
    // Revoked on a timer rather than immediately: some browsers have not
    // finished reading the blob when click() returns.
    if (url) setTimeout(() => URL.revokeObjectURL(url), 20000);
  }
}

/**
 * Parse and sanity-check a backup. Returns what it holds, without applying it,
 * so the caller can describe it before overwriting anything.
 */
export function inspect(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: 'That is not a Grimfall save file.' };
  }
  if (!data || typeof data !== 'object' || data.magic !== MAGIC) {
    return { ok: false, error: 'That is not a Grimfall save file.' };
  }
  if (typeof data.format !== 'number' || data.format > FORMAT) {
    return { ok: false, error: 'That save was made by a newer version of the game.' };
  }
  const slots = (data.slots && typeof data.slots === 'object') ? data.slots : {};
  const names = SLOTS.filter((s) => slots[s] && typeof slots[s] === 'object');
  return {
    ok: true,
    data,
    slots: names,
    gold: Number(data.meta?.gold) || 0,
    unlocked: Array.isArray(data.meta?.unlocked) ? data.meta.unlocked.length : 0,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null,
  };
}

/**
 * Apply a backup. Replaces the run slots it carries and merges the meta
 * progression; slots the file does not mention are left alone rather than
 * deleted, so importing an older backup cannot silently destroy a newer run.
 *
 * @param {object} opts  { settings: boolean }  whether to take its settings too
 */
export function apply(data, opts = {}) {
  const found = inspect(typeof data === 'string' ? data : JSON.stringify(data));
  if (!found.ok) return found;

  const d = found.data;
  let slots = 0;
  for (const slot of SLOTS) {
    const entry = d.slots?.[slot];
    if (!entry || typeof entry !== 'object') continue;
    // Straight through to the slot store: `restoreRun` is what reads it back,
    // and that already whitelists every field it uses.
    if (writeSlot(slot, entry)) slots++;
  }

  store.importProgress({
    meta: d.meta,
    records: d.records,
    settings: opts.settings ? d.settings : undefined,
  });

  return { ok: true, slots, gold: found.gold, unlocked: found.unlocked };
}

/** Throw away every slot and the meta progression. Used by the reset button. */
export function wipe() {
  for (const slot of SLOTS) clearSlot(slot);
  store.resetAll();
}
