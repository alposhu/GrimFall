// ---------------------------------------------------------------------------
// shop.js — what the three vendors sell, and what buying it does.
//
// Every purchase is expressed in terms the run already understands: a weapon
// level, a passive level, or one of the `meta*` multipliers the player carries
// from the Sanctuary. Nothing here adds a new stat to the pipeline, which is
// why a bought upgrade behaves exactly like an earned one — and why a saved run
// restores its purchases for free.
//
// Gold spent here is gold that never reaches the Sanctuary, so the market is a
// standing choice between this run and the next one.
// ---------------------------------------------------------------------------

import { makeRng, clamp } from '../core/util.js';
import { WEAPONS, WEAPON_IDS, WEAPON_MAX_LEVEL, PASSIVES, MAX_WEAPONS } from './config.js';
import { S, maxHp, healPlayer, showToast } from './state.js';

/** Consumables sit in a three-slot belt and are drunk with 1, 2 and 3. */
export const FLASKS = {
  flask_heal:  { name: 'Lesser Draught', icon: 'draught', color: '#7fe05a', key: '1', desc: 'Restores 55% of your health.' },
  flask_stone: { name: 'Phial of Stone', icon: 'phial',   color: '#9ad4ff', key: '2', desc: 'Five seconds of invulnerability.' },
  flask_swift: { name: 'Oil of Swiftness', icon: 'oilcan', color: '#ffd75e', key: '3', desc: 'Eighteen seconds of +35% move speed.' },
};

export const FLASK_IDS = Object.keys(FLASKS);
const MAX_FLASKS = 3;             // per type

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
// `stock` is how many a single visit may sell. `apply` mutates the run.
export const VENDORS = {
  marta: {
    id: 'marta', name: 'Marta', trade: 'Apothecary',
    stall: 'herbs',
    greeting: [
      'You are bleeding on my step. Come in, then.',
      'Still upright. That is more than most manage.',
      'I keep the good bottles behind the counter. For you, perhaps.',
    ],
    goods: [
      { id: 'mend', name: 'Draught of Waking', price: 55, stock: 1,
        desc: 'Drink it here. Restores you to full health.',
        avail: () => S.player.hp < maxHp() - 1,
        apply: () => { healPlayer(maxHp()); } },
      { id: 'feast', name: 'A Hot Meal', price: 120, stock: 1,
        desc: 'Sit a while. Permanently raises your maximum health by 25.',
        apply: (p) => { p.metaHp += 25; healPlayer(25); } },
      { id: 'tonic', name: 'Root Tonic', price: 140, stock: 1,
        desc: 'Your wounds close on their own. One level of Regeneration.',
        avail: (p) => (p.passives.regen || 0) < PASSIVES.regen.max,
        apply: (p) => { p.passives.regen = (p.passives.regen || 0) + 1; } },
      { id: 'flask_heal', name: 'Lesser Draught', price: 70, stock: 2, flask: true,
        desc: 'Carried. Restores 55% of your health when you drink it.' },
      { id: 'flask_stone', name: 'Phial of Stone', price: 95, stock: 1, flask: true,
        desc: 'Carried. Five seconds where nothing can touch you.' },
      { id: 'flask_swift', name: 'Oil of Swiftness', price: 80, stock: 1, flask: true,
        desc: 'Carried. Eighteen seconds of +35% move speed.' },
    ],
  },

  oswin: {
    id: 'oswin', name: 'Oswin', trade: 'Ironmonger',
    stall: 'arms',
    greeting: [
      'Mind the edges. Everything here is sharper than it looks.',
      'You have been swinging that thing wrong. Give it here.',
      'Steel is patient. You are not. Buy something.',
    ],
    goods: [
      { id: 'whet', name: 'Whetstone', price: 110, stock: 2,
        desc: 'Oswin works on your least-developed weapon. One level.',
        avail: (p) => p.weapons.some((w) => !w.evolved && w.level < WEAPON_MAX_LEVEL),
        apply: (p) => {
          const cands = p.weapons.filter((w) => !w.evolved && w.level < WEAPON_MAX_LEVEL);
          cands.sort((a, b) => a.level - b.level);
          if (cands[0]) {
            cands[0].level++;
            showToast(`${WEAPONS[cands[0].id].name} to level ${cands[0].level}`, '#ffd75e', 2);
          }
        } },
      { id: 'commission', name: 'Commission', price: 175, stock: 1,
        desc: 'A weapon you do not own yet, made to order.',
        avail: (p) => p.weapons.length < MAX_WEAPONS && WEAPON_IDS.some((id) => !p.weapons.find((w) => w.id === id)),
        apply: (p, rng) => {
          const open = WEAPON_IDS.filter((id) => !p.weapons.find((w) => w.id === id));
          const id = open[(rng() * open.length) | 0];
          p.weapons.push({ id, level: 1, cd: 0.2, evolved: false });
          showToast(`${WEAPONS[id].name} acquired`, '#9ad4ff', 2.4);
        } },
      { id: 'temper', name: 'Tempered Plate', price: 130, stock: 2,
        desc: 'One more point of armour, for the rest of the run.',
        apply: (p) => { p.metaArmor += 1; } },
      { id: 'oil', name: 'Bladeoil', price: 125, stock: 2,
        desc: 'Everything you own hits 8% harder.',
        apply: (p) => { p.metaMight *= 1.08; } },
      { id: 'spring', name: 'Clockwork Spring', price: 135, stock: 2,
        desc: 'Every weapon comes round 5% sooner.',
        apply: (p) => { p.metaHaste *= 0.95; } },
      { id: 'boots', name: 'Roadworn Boots', price: 100, stock: 2,
        desc: 'Six per cent more speed. It adds up.',
        apply: (p) => { p.metaSpeed *= 1.06; } },
    ],
  },

  coinweigher: {
    id: 'coinweigher', name: 'The Coinweigher', trade: 'Fortunes',
    stall: 'coin',
    greeting: [
      'Everything has a price. You have arrived at yours.',
      'I weigh what you carry, not what you claim.',
      'Luck is only arithmetic you have not done yet.',
    ],
    goods: [
      { id: 'reroll', name: 'Second Thoughts', price: 65, stock: 2,
        desc: 'Two more rerolls at the next level-up.',
        apply: () => { S.rerolls += 2; } },
      { id: 'banish', name: 'Struck From The Ledger', price: 65, stock: 2,
        desc: 'Two more banishes. Refuse what you never want to see.',
        apply: () => { S.banishes += 2; } },
      { id: 'charm', name: 'Weighted Charm', price: 115, stock: 2,
        desc: 'Twelve per cent more luck: better drops, better draws.',
        apply: (p) => { p.metaLuck *= 1.12; } },
      { id: 'lodestone', name: 'Lodestone', price: 85, stock: 2,
        desc: 'A quarter more reach on everything you pick up.',
        apply: (p) => { p.metaMagnet *= 1.25; } },
      { id: 'tithe', name: 'Favourable Tithe', price: 95, stock: 2,
        desc: 'Twenty per cent more gold for the rest of the run.',
        apply: (p) => { p.metaGreed *= 1.2; } },
      { id: 'effigy', name: 'Wax Effigy', price: 260, stock: 1,
        desc: 'Death happens to it instead of you. Once.',
        apply: () => { S.revives += 1; } },
    ],
  },
};

export const VENDOR_ORDER = ['oswin', 'marta', 'coinweigher'];

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------
/** Prices climb as the run does, so late gold is not late-game trivial. */
export function priceOf(good, visit) {
  return Math.round(good.price * (1 + visit * 0.34));
}

/**
 * Four of a vendor's six, chosen by a seed derived from the run and the visit
 * number — so the same save reloaded offers the same shelf, and two markets in
 * one run never look identical.
 */
export function rollStock(vendorId, seed, visit) {
  const v = VENDORS[vendorId];
  const rng = makeRng((seed ^ (visit * 7919)) + vendorId.length * 31);
  const pool = v.goods.slice();
  // Fisher-Yates on a copy: deterministic given the seed.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 4).map((g) => ({
    id: g.id,
    price: priceOf(g, visit),
    left: g.stock,
  }));
}

export const goodById = (vendorId, id) => VENDORS[vendorId].goods.find((g) => g.id === id);

/** Can this be bought right now? Returns null when fine, else why not. */
export function purchaseBlocked(vendorId, entry) {
  const good = goodById(vendorId, entry.id);
  if (!good) return 'gone';
  if (entry.left <= 0) return 'sold out';
  if (S.gold < entry.price) return 'not enough gold';
  if (good.flask && (S.inventory[good.id] || 0) >= MAX_FLASKS) return 'belt is full';
  if (good.avail && !good.avail(S.player)) return 'no use for it';
  return null;
}

/**
 * Buy one. Returns true if it went through; the caller plays the sound and
 * updates the shelf, because the market UI and the tests both call this.
 */
export function buy(vendorId, entry) {
  if (purchaseBlocked(vendorId, entry)) return false;
  const good = goodById(vendorId, entry.id);
  S.gold -= entry.price;
  entry.left--;
  if (good.flask) {
    S.inventory[good.id] = (S.inventory[good.id] || 0) + 1;
  } else {
    good.apply(S.player, makeRng((S.seed ^ entry.price) + S.marketVisits * 13));
  }
  S.purchases.push(good.id);
  return true;
}

// ---------------------------------------------------------------------------
// Using what you bought
// ---------------------------------------------------------------------------
/** Drink a flask. Returns true if one was actually used. */
export function useFlask(id) {
  const p = S.player;
  if (!p || !S.running || (S.inventory[id] || 0) <= 0) return false;
  S.inventory[id]--;
  switch (id) {
    case 'flask_heal':
      healPlayer(maxHp() * 0.55);
      break;
    case 'flask_stone':
      p.invuln = Math.max(p.invuln, 5);
      break;
    case 'flask_swift':
      p.swiftT = Math.max(p.swiftT || 0, 18);
      break;
    default:
      return false;
  }
  showToast(FLASKS[id].name, FLASKS[id].color, 1.3);
  return true;
}

export const flaskCount = (id) => S.inventory?.[id] || 0;
export const beltIsEmpty = () => FLASK_IDS.every((id) => !flaskCount(id));

/** Cap the market can pay out on: keeps a rich run from buying the whole shelf. */
export const affordable = (price) => clamp(S.gold - price, 0, Infinity) >= 0 && S.gold >= price;
