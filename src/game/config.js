// ---------------------------------------------------------------------------
// config.js — every tuning number in one place.
//
// Weapons are described declaratively: a base stat block, a per-level delta and
// optional jumps at specific levels. Anything the combat code needs is derived
// from these, so balancing never means touching gameplay code.
// ---------------------------------------------------------------------------

export const RUN_LENGTH = 20 * 60;          // seconds until the run is won
export const MAX_WEAPONS = 6;
export const MAX_PASSIVES = 6;

export const DIFFICULTIES = {
  easy:      { label: 'Calm',      hp: 0.75, dmg: 0.7,  spawn: 0.8,  xp: 1.1,  gold: 0.9 },
  normal:    { label: 'Standard',  hp: 1.0,  dmg: 1.0,  spawn: 1.0,  xp: 1.0,  gold: 1.0 },
  hard:      { label: 'Harrowing', hp: 1.35, dmg: 1.3,  spawn: 1.25, xp: 1.0,  gold: 1.25 },
  nightmare: { label: 'Nightmare', hp: 1.8,  dmg: 1.65, spawn: 1.5,  xp: 1.05, gold: 1.6 },
};
export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard', 'nightmare'];

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------
// stat keys: damage, cooldown, count, speed, pierce, area, duration, knockback
export const WEAPONS = {
  bolt: {
    name: 'Bolt', icon: 'bolt', tag: 'Auto-aim',
    desc: 'Looses a bolt at the nearest foe.',
    base: { damage: 11, cooldown: 0.55, count: 1, speed: 460, pierce: 1, area: 1, knockback: 70 },
    perLevel: { damage: 4.5, cooldown: -0.028 },
    atLevel: { 3: { count: 1 }, 5: { count: 1, pierce: 1 }, 7: { count: 1, pierce: 1 } },
    evolution: {
      id: 'stormvolley', name: 'Storm Volley', icon: 'bolt_evo', requires: 'amount',
      desc: 'A fan of piercing bolts, every time.',
      base: { damage: 34, cooldown: 0.42, count: 7, speed: 560, pierce: 4, area: 1.2, knockback: 90 },
    },
  },
  slash: {
    name: 'Slash', icon: 'slash', tag: 'Melee arc',
    desc: 'Cleaves the air in front of you.',
    base: { damage: 18, cooldown: 0.85, count: 1, area: 1, duration: 0.22, knockback: 150 },
    perLevel: { damage: 7, cooldown: -0.04, area: 0.09 },
    atLevel: { 2: { count: 1 }, 4: { area: 0.2 }, 6: { count: 1 }, 8: { area: 0.3 } },
    evolution: {
      id: 'ruinarc', name: 'Ruin Arc', icon: 'slash_evo', requires: 'might',
      desc: 'A full sweep on both sides that shreds armour.',
      base: { damage: 58, cooldown: 0.6, count: 2, area: 2.1, duration: 0.26, knockback: 260 },
    },
  },
  orb: {
    name: 'Arcane Orb', icon: 'orb', tag: 'Homing',
    desc: 'Slow orbs that chase whatever is closest.',
    base: { damage: 16, cooldown: 1.1, count: 1, speed: 210, pierce: 1, area: 1, knockback: 40 },
    perLevel: { damage: 6, cooldown: -0.055, speed: 8 },
    atLevel: { 3: { count: 1 }, 5: { count: 1 }, 7: { count: 1, pierce: 1 } },
    evolution: {
      id: 'astralswarm', name: 'Astral Swarm', icon: 'orb_evo', requires: 'cooldown',
      desc: 'A relentless swarm that never loses the scent.',
      base: { damage: 40, cooldown: 0.5, count: 4, speed: 300, pierce: 3, area: 1.3, knockback: 55 },
    },
  },
  firebomb: {
    name: 'Firebomb', icon: 'firebomb', tag: 'Explosive',
    desc: 'Lobbed charges that burst on landing.',
    base: { damage: 26, cooldown: 1.5, count: 1, speed: 260, area: 1, knockback: 120 },
    perLevel: { damage: 10, cooldown: -0.07, area: 0.1 },
    atLevel: { 4: { count: 1 }, 6: { count: 1 }, 8: { area: 0.4 } },
    evolution: {
      id: 'meteorrain', name: 'Meteor Rain', icon: 'firebomb_evo', requires: 'area',
      desc: 'The sky opens. Fire falls where the enemies are thickest.',
      base: { damage: 70, cooldown: 1.15, count: 4, speed: 300, area: 1.9, knockback: 180 },
    },
  },
  aura: {
    name: 'Ember Aura', icon: 'aura', tag: 'Persistent',
    desc: 'A ring of heat that sears anything close.',
    base: { damage: 7, cooldown: 0.42, area: 1, knockback: 10 },
    perLevel: { damage: 3.2, area: 0.13, cooldown: -0.012 },
    atLevel: { 5: { area: 0.25 }, 8: { area: 0.35 } },
    evolution: {
      id: 'infernohalo', name: 'Inferno Halo', icon: 'aura_evo', requires: 'area',
      desc: 'A wider halo that sets everything it touches alight.',
      base: { damage: 22, cooldown: 0.3, area: 2.3, knockback: 30, burn: 1 },
    },
  },
  lightning: {
    name: 'Chain Lightning', icon: 'lightning', tag: 'Chaining',
    desc: 'Leaps between enemies from a struck target.',
    base: { damage: 24, cooldown: 1.6, count: 3, area: 1, range: 240 },
    perLevel: { damage: 9, cooldown: -0.09, range: 14 },
    atLevel: { 3: { count: 2 }, 5: { count: 2 }, 7: { count: 3 } },
    evolution: {
      id: 'tempest', name: 'Tempest', icon: 'lightning_evo', requires: 'velocity',
      desc: 'A storm that arcs through the whole crowd and stuns.',
      base: { damage: 56, cooldown: 1.0, count: 14, area: 1.4, range: 340, stun: 0.4 },
    },
  },
  nova: {
    name: 'Frost Nova', icon: 'nova', tag: 'Crowd control',
    desc: 'A ring of ice that slows what it touches.',
    base: { damage: 14, cooldown: 2.3, area: 1, slow: 0.35, slowTime: 1.6 },
    perLevel: { damage: 6, cooldown: -0.11, area: 0.14, slow: 0.02 },
    atLevel: { 4: { area: 0.3 }, 8: { slowTime: 0.8 } },
    evolution: {
      id: 'absolutezero', name: 'Absolute Zero', icon: 'nova_evo', requires: 'caliber',
      desc: 'The cold stops them outright, then shatters them.',
      base: { damage: 46, cooldown: 1.7, area: 2.2, slow: 0.85, slowTime: 2.6, shatter: 1.6 },
    },
  },
  orbit: {
    name: 'Warding Orbit', icon: 'orbit', tag: 'Defensive',
    desc: 'Orbs circle you, breaking anything that closes in.',
    base: { damage: 13, cooldown: 0, count: 2, area: 1, speed: 2.2, radius: 78 },
    perLevel: { damage: 5, radius: 5, speed: 0.08 },
    atLevel: { 3: { count: 1 }, 5: { count: 1 }, 7: { count: 2 } },
    evolution: {
      id: 'judgement', name: 'Halo of Judgement', icon: 'orbit_evo', requires: 'amount',
      desc: 'A crown of blades that grinds everything down.',
      base: { damage: 38, count: 8, area: 1.6, speed: 3.0, radius: 108 },
    },
  },
  glaive: {
    name: 'Glaive', icon: 'glaive', tag: 'Returning',
    desc: 'Thrown out and back, cutting the whole way.',
    base: { damage: 20, cooldown: 1.35, count: 1, speed: 400, pierce: 99, area: 1, range: 300 },
    perLevel: { damage: 7.5, cooldown: -0.06, range: 12 },
    atLevel: { 3: { count: 1 }, 6: { count: 1 }, 8: { count: 1 } },
    evolution: {
      id: 'cyclone', name: 'Cyclone', icon: 'glaive_evo', requires: 'velocity',
      desc: 'Glaives that circle back again and again.',
      base: { damage: 52, cooldown: 0.95, count: 4, speed: 520, pierce: 99, area: 1.5, range: 420, loops: 2 },
    },
  },
  brambles: {
    name: 'Brambles', icon: 'brambles', tag: 'Zone',
    desc: 'Thorn patches erupt around you and linger.',
    base: { damage: 9, cooldown: 2.6, count: 2, area: 1, duration: 3.4 },
    perLevel: { damage: 4, cooldown: -0.11, area: 0.1, duration: 0.2 },
    atLevel: { 3: { count: 1 }, 5: { count: 1 }, 7: { count: 2 } },
    evolution: {
      id: 'thornwood', name: 'Thornwood', icon: 'brambles_evo', requires: 'might',
      desc: 'A living thicket that roots anything caught inside.',
      base: { damage: 26, cooldown: 1.9, count: 7, area: 1.8, duration: 5.0, root: 0.9 },
    },
  },
  // --- the familiars -------------------------------------------------------
  // Four budgies, and they are weapons in every sense the rest of this table
  // means it: they draw from the same level-up pool, take the same passives,
  // and resolve through the same `weaponStats`. What makes them familiars is
  // that they persist — the bird is on screen between attacks, not only during
  // one — and their flight is described separately in FAMILIARS below.
  //
  // Each one's four named upgrades land at levels 2, 3, 4 and 5, which is the
  // curve asked for; `perLevel` carries them to the table-wide cap of 8.
  storm: {
    name: 'Storm Budgie', icon: 'budgie_storm', tag: 'Familiar',
    desc: 'A blue budgie rings you close and drops lightning on whatever stands nearest.',
    familiar: 'storm',
    base: { damage: 15, cooldown: 1.25, birds: 1, area: 1, chain: 0, stun: 0, range: 300 },
    perLevel: { damage: 6.5, cooldown: -0.055, range: 12 },
    atLevel: {
      2: { cooldown: -0.14 },            // strikes faster
      3: { chain: 1 },                   // it starts bouncing
      4: { stun: 0.22 },                 // and briefly pins what it hits
      5: { birds: 1, chain: 1 },         // a second bird
      7: { chain: 1, cooldown: -0.1 },
    },
    evolution: {
      id: 'thunderhead', name: 'Thunderhead Budgie', icon: 'budgie_storm_evo', requires: 'cooldown',
      desc: 'Three of them, ringing you, and the lightning does not stop.',
      base: { damage: 44, cooldown: 0.5, birds: 3, area: 1.4, chain: 3, stun: 0.34, range: 380 },
    },
  },

  chime: {
    name: 'Chime Budgie', icon: 'budgie_chime', tag: 'Familiar',
    desc: 'Rides your shoulder and sings. What the song touches slows, and keeps slowing.',
    familiar: 'chime',
    base: { damage: 9, cooldown: 2.2, birds: 1, area: 1, radius: 132, slow: 0.18, shred: 0 },
    perLevel: { damage: 3.6, cooldown: -0.1, radius: 9, slow: 0.03 },
    atLevel: {
      2: { radius: 26 },                 // wider song
      3: { cooldown: -0.28 },            // sung more often
      4: { slow: 0.1 },                  // and it bites deeper
      5: { shred: 0.18 },                // armour comes apart
      7: { radius: 30, shred: 0.1 },
    },
    evolution: {
      id: 'knell', name: 'Knell Budgie', icon: 'budgie_chime_evo', requires: 'area',
      desc: 'A ring that reaches the edge of sight, and nothing inside it keeps its armour.',
      base: { damage: 30, cooldown: 1.05, birds: 1, area: 1.9, radius: 270, slow: 0.52, shred: 0.5 },
    },
  },

  ember: {
    name: 'Ember Budgie', icon: 'budgie_ember', tag: 'Familiar',
    desc: 'Flies at your back and lobs fire into whichever crowd is thickest.',
    familiar: 'ember',
    base: { damage: 22, cooldown: 2.0, birds: 1, count: 1, speed: 300, area: 1, puddle: 0, range: 460 },
    perLevel: { damage: 9, cooldown: -0.09, speed: 16 },
    atLevel: {
      2: { speed: 90 },                  // the shot travels
      3: { cooldown: -0.3 },             // and comes more often
      4: { area: 0.45 },                 // the blast widens
      5: { puddle: 2.6 },                // and leaves fire behind
      7: { area: 0.3, puddle: 1.2 },
    },
    evolution: {
      id: 'wildfire', name: 'Wildfire Budgie', icon: 'budgie_ember_evo', requires: 'area',
      desc: 'Three shells at a time, and the ground burns for a long while after.',
      base: { damage: 66, cooldown: 1.15, birds: 1, count: 3, speed: 460, area: 1.9, puddle: 5.0, range: 560 },
    },
  },

  wraith: {
    name: 'Wraith Budgie', icon: 'budgie_wraith', tag: 'Familiar',
    desc: 'The white one does not stay with you. It hunts, and what it touches simply stops.',
    familiar: 'wraith',
    // `execute` is the health fraction below which ordinary enemies are taken
    // outright; `bossMult` is what it does to anything too big to execute;
    // `rehit` is how soon it may touch the same enemy again, which is the real
    // rate limit on a weapon whose pacing is its flight.
    //
    // It needs a damage curve as well as an execute curve. Execution is worth
    // nothing against a boss, and a familiar that scaled only by threshold
    // would stop contributing at exactly the moment a run gets hard.
    base: { damage: 44, cooldown: 0, birds: 1, speed: 250, area: 1, execute: 0.35, bossMult: 1.0, uptime: 5.0, rest: 3.4, rehit: 0.26 },
    perLevel: { damage: 24, speed: 14, execute: 0.035, bossMult: 0.16, uptime: 0.3, rehit: -0.011 },
    atLevel: {
      2: { speed: 60 },                  // it moves like it means it
      3: { uptime: 1.4, rest: -0.7 },    // and is out far more of the time
      4: { bossMult: 0.6 },              // champions start to feel it
      5: { execute: 0.14 },              // and the trash barely registers
      7: { bossMult: 0.7, uptime: 1.0 },
    },
    evolution: {
      id: 'reaper', name: 'Reaper Budgie', icon: 'budgie_wraith_evo', requires: 'might',
      desc: 'It never rests, and very little survives being noticed by it.',
      base: { damage: 240, cooldown: 0, birds: 2, speed: 430, area: 1.5, execute: 0.6, bossMult: 3.4, uptime: 999, rest: 0, rehit: 0.16 },
    },
  },
  mjolnir: {
    name: 'Mjolnir', icon: 'mjolnir', tag: 'Seeking',
    desc: 'Thrown, and it does not come straight back. It hunts, and it storms.',
    // `duration` is how long it stays out hunting; `arcRate` is seconds between
    // the lightning it throws while it flies; `arcs` is how many at a time.
    base: {
      damage: 34, cooldown: 2.4, count: 1, speed: 520, area: 1,
      knockback: 300, stun: 0.18, duration: 3.6, turn: 5.2, arcRate: 0.62, arcs: 1,
    },
    perLevel: { damage: 14, cooldown: -0.11, duration: 0.22, turn: 0.28, arcRate: -0.03 },
    atLevel: { 3: { arcs: 1 }, 5: { count: 1 }, 7: { arcs: 1, duration: 0.6 } },
    evolution: {
      id: 'stormbreaker', name: 'Stormbreaker', icon: 'mjolnir_evo', requires: 'armor',
      desc: 'Three hammers, and the sky comes down with them.',
      base: {
        damage: 96, cooldown: 1.6, count: 3, speed: 540, area: 1.6,
        knockback: 430, stun: 0.5, duration: 5.4, turn: 7.4, arcRate: 0.3, arcs: 3,
        chain: 1,
      },
    },
  },
  censer: {
    name: 'Censer', icon: 'censer', tag: 'Burning ground',
    desc: 'A swung vial that bursts and leaves the ground alight.',
    base: { damage: 16, cooldown: 1.9, count: 1, speed: 250, area: 1, duration: 3.0 },
    perLevel: { damage: 6.5, cooldown: -0.08, area: 0.11, duration: 0.18 },
    atLevel: { 4: { count: 1 }, 6: { area: 0.25 }, 8: { count: 1 } },
    evolution: {
      id: 'pyre', name: 'Pyre', icon: 'censer_evo', requires: 'regen',
      desc: 'Four vials, and the fire stays where it lands.',
      base: { damage: 40, cooldown: 1.3, count: 4, speed: 280, area: 1.7, duration: 5.2 },
    },
  },
  pike: {
    name: 'Pike', icon: 'pike', tag: 'Line',
    desc: 'Thrust the way you are facing. Everything in the line is hit.',
    base: { damage: 26, cooldown: 1.15, count: 1, speed: 660, pierce: 99, area: 1, knockback: 80 },
    perLevel: { damage: 10, cooldown: -0.055, speed: 12 },
    atLevel: { 3: { count: 1 }, 6: { count: 1 }, 8: { count: 1 } },
    evolution: {
      id: 'skewer', name: 'Skewer', icon: 'pike_evo', requires: 'fortune',
      desc: 'A wall of iron, thrown the moment the last one lands.',
      base: { damage: 66, cooldown: 0.72, count: 5, speed: 780, pierce: 99, area: 1.5, knockback: 130 },
    },
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS);

/** Resolve a weapon's stats at a given level, applying base + growth + jumps. */
export function weaponStats(id, level, evolved = false) {
  const def = WEAPONS[id];
  if (!def) return null;
  if (evolved) return { ...def.evolution.base };
  const s = { ...def.base };
  for (const k of Object.keys(def.perLevel || {})) {
    s[k] = (s[k] || 0) + def.perLevel[k] * (level - 1);
  }
  for (let l = 2; l <= level; l++) {
    const jump = def.atLevel?.[l];
    if (!jump) continue;
    for (const k of Object.keys(jump)) s[k] = (s[k] || 0) + jump[k];
  }
  return s;
}

export const WEAPON_MAX_LEVEL = 8;

// ---------------------------------------------------------------------------
// Familiars
// ---------------------------------------------------------------------------
// Everything about how a budgie MOVES lives here, separately from what it does
// for damage. The split is deliberate: damage numbers get rebalanced often and
// flight almost never, and mixing them means every balance pass risks making a
// bird fly wrong.
//
// `station` is what the bird is doing when it has nothing else to do:
//   ring      circles the player at `radius`
//   shoulder  holds a fixed offset and bobs
//   trail     hangs behind the direction of travel
//   roam      goes where the enemies are and ignores the player entirely
//
// The ids match `WEAPONS[id].familiar` and `BUDGIES` in art/familiars.js.
export const FAMILIARS = {
  storm: {
    station: 'ring',
    radius: 62, spin: 1.9,             // px, and radians/sec around you
    bob: 5, bobRate: 3.1,              // vertical float, px and Hz
    flap: 11,                          // animation frames per second
    ease: 9,                           // how hard it corrects toward station
  },
  chime: {
    station: 'shoulder',
    offset: { x: 20, y: -30 },
    bob: 7, bobRate: 2.3,
    flap: 7,
    ease: 7,
  },
  ember: {
    station: 'trail',
    distance: 40, lift: -22,           // behind you, and above your head
    bob: 4, bobRate: 2.7,
    flap: 9,
    ease: 5.5,
    recoil: 90,                        // px/s kicked back when it fires
  },
  wraith: {
    station: 'roam',
    hunt: 520,                         // how far it will look for a crowd
    leash: 900,                        // beyond this it gives up and comes back
    bob: 3, bobRate: 4.4,
    flap: 15,
    ease: 4,
    restEase: 6,                       // it returns to your shoulder to rest
    restOffset: { x: -24, y: -34 },
  },
};

export const FAMILIAR_IDS = Object.keys(FAMILIARS);

/** Weapon ids that spawn a bird, in table order. */
export const FAMILIAR_WEAPONS = WEAPON_IDS.filter((id) => WEAPONS[id].familiar);

// ---------------------------------------------------------------------------
// Passives
// ---------------------------------------------------------------------------
// `max` is how many times a passive can be taken. Most cap at five, because a
// sixth would only be a rounding error on a multiplier. Health and armour are
// the exception and go to twenty-five, the same as they did in the game this
// one grew out of: they are the two you keep wanting more of at minute
// eighteen, and a build that spends most of its levels on staying alive should
// be allowed to.
export const PASSIVES = {
  might:     { name: 'Might',      icon: 'might',     max: 5, step: 0.12, fmt: (v) => `+${Math.round(v * 100)}% damage`, desc: 'Everything you do hits harder.' },
  wrath:     { name: 'Wrath',      icon: 'wrath',     max: 5, step: 0.07, fmt: (v) => `+${Math.round(v * 100)}% crit chance`, desc: 'Critical hits deal double damage.' },
  area:      { name: 'Reach',      icon: 'area',      max: 5, step: 0.16, fmt: (v) => `+${Math.round(v * 100)}% area`, desc: 'Wider arcs, bigger blasts.' },
  velocity:  { name: 'Velocity',   icon: 'velocity',  max: 5, step: 0.2,  fmt: (v) => `+${Math.round(v * 100)}% projectile speed`, desc: 'Shots travel faster and further.' },
  caliber:   { name: 'Caliber',    icon: 'caliber',   max: 5, step: 0.14, fmt: (v) => `+${Math.round(v * 100)}% projectile size`, desc: 'Fatter projectiles, easier hits.' },
  cooldown:  { name: 'Haste',      icon: 'cooldown',  max: 5, step: 0.1,  fmt: (v) => `-${Math.round(v * 100)}% cooldown`, desc: 'Every weapon fires more often.' },
  amount:    { name: 'Multitude',  icon: 'amount',    max: 3, step: 1,    fmt: (v) => `+${v} projectile${v > 1 ? 's' : ''}`, desc: 'One more of almost everything.' },
  swiftness: { name: 'Swiftness',  icon: 'swiftness', max: 5, step: 0.09, fmt: (v) => `+${Math.round(v * 100)}% move speed`, desc: 'Outrun the crowd.' },
  magnet:    { name: 'Lodestone',  icon: 'magnet',    max: 5, step: 0.35, fmt: (v) => `+${Math.round(v * 100)}% pickup range`, desc: 'Drops come to you.' },
  vitality:  { name: 'Vitality',   icon: 'vitality',  max: 25, step: 20,   fmt: (v) => `+${v} max health`, desc: 'A deeper pool to spend.' },
  armor:     { name: 'Armour',     icon: 'armor',     max: 25, step: 1,    fmt: (v) => `-${v.toFixed(0)} damage taken`, desc: 'Blunts every incoming hit.' },
  regen:     { name: 'Regrowth',   icon: 'regen',     max: 5, step: 0.45, fmt: (v) => `+${v.toFixed(2)} health per second`, desc: 'Slowly knits you back together.' },
  fortune:   { name: 'Fortune',    icon: 'fortune',   max: 4, step: 0.15, fmt: (v) => `+${Math.round(v * 100)}% gold and luck`, desc: 'Better drops, richer pockets.' },
};

export const PASSIVE_IDS = Object.keys(PASSIVES);

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------
// `from`/`to` are minutes; `weight` is the relative spawn share in that window.
export const ENEMY_TYPES = [
  { id: 'slime',    sprite: 'slime',    from: 0,  to: 8,  weight: 30, hp: 10,  speed: 42,  dmg: 8,  xp: 1, size: 15, scale: 2.0 },
  { id: 'bat',      sprite: 'bat',      from: 1,  to: 12, weight: 24, hp: 7,   speed: 78,  dmg: 6,  xp: 1, size: 13, scale: 1.8, erratic: 1 },
  { id: 'skeleton', sprite: 'skeleton', from: 2,  to: 14, weight: 22, hp: 18,  speed: 50,  dmg: 11, xp: 2, size: 15, scale: 2.0 },
  { id: 'hound',    sprite: 'hound',    from: 3,  to: 16, weight: 18, hp: 14,  speed: 104, dmg: 10, xp: 2, size: 14, scale: 1.9, lunge: 1 },
  { id: 'imp',      sprite: 'imp',      from: 4,  to: 20, weight: 16, hp: 22,  speed: 62,  dmg: 13, xp: 3, size: 15, scale: 2.0, ranged: { cd: 2.6, speed: 170, dmg: 9 } },
  { id: 'brute',    sprite: 'brute',    from: 6,  to: 20, weight: 14, hp: 60,  speed: 38,  dmg: 20, xp: 5, size: 20, scale: 2.4, knockResist: 0.6 },
  { id: 'wisp',     sprite: 'wisp',     from: 7,  to: 20, weight: 12, hp: 30,  speed: 88,  dmg: 14, xp: 4, size: 14, scale: 1.9, drift: 1 },
  { id: 'spider',   sprite: 'spider',   from: 9,  to: 20, weight: 13, hp: 44,  speed: 70,  dmg: 16, xp: 5, size: 17, scale: 2.1, web: 1 },
  { id: 'shade',    sprite: 'shade',    from: 11, to: 20, weight: 14, hp: 78,  speed: 58,  dmg: 22, xp: 7, size: 18, scale: 2.2, phase: 1 },
];

/** Elites are ordinary enemies wearing a modifier. */
export const ELITE_MODS = [
  { id: 'armored',  name: 'Armoured',  color: '#9ad2ff', hp: 4.5, dmg: 1.2, speed: 0.85, gold: 2 },
  { id: 'swift',    name: 'Swift',     color: '#9dff8f', hp: 2.4, dmg: 1.1, speed: 1.7,  gold: 2 },
  { id: 'volatile', name: 'Volatile',  color: '#ff8a2a', hp: 3.0, dmg: 1.4, speed: 1.0,  gold: 3, explodes: 1 },
  { id: 'vampiric', name: 'Vampiric',  color: '#ff5a6e', hp: 3.6, dmg: 1.3, speed: 1.1,  gold: 3, leech: 1 },
];

export const CHAMPIONS = [
  { id: 'golem',       sprite: 'golem',       name: 'Stone Warden',  hp: 620,  speed: 44, dmg: 26, xp: 40, size: 34, scale: 2.6, ai: 'slam' },
  { id: 'slimeking',   sprite: 'slimeking',   name: 'Slime Sovereign', hp: 720, speed: 52, dmg: 22, xp: 44, size: 34, scale: 2.6, ai: 'split' },
  { id: 'skullmage',   sprite: 'skullmage',   name: 'Bone Cantor',   hp: 640,  speed: 46, dmg: 24, xp: 46, size: 32, scale: 2.5, ai: 'caster' },
  { id: 'broodmother', sprite: 'broodmother', name: 'Broodmother',   hp: 780,  speed: 62, dmg: 25, xp: 50, size: 34, scale: 2.6, ai: 'weaver' },
  { id: 'treant',      sprite: 'treant',      name: 'Elder Treant',  hp: 980,  speed: 34, dmg: 30, xp: 56, size: 36, scale: 2.8, ai: 'root' },
  { id: 'wraithlord',  sprite: 'wraithlord',  name: 'Wraith Lord',   hp: 860,  speed: 70, dmg: 28, xp: 54, size: 32, scale: 2.6, ai: 'blink' },
];

export const BOSSES = [
  {
    id: 'magus', sprite: 'magus', name: 'The Hollow Magus', at: 4,
    hp: 2600, speed: 52, dmg: 34, xp: 300, size: 46, scale: 3.4,
    ai: 'magus', color: '#b76bff', cutscene: 'sigil',
    title: 'Weaver of the Empty Sign',
  },
  {
    id: 'demon', sprite: 'demon', name: 'Cinder Tyrant', at: 8,
    hp: 6000, speed: 66, dmg: 42, xp: 600, size: 50, scale: 3.6,
    ai: 'demon', color: '#ff6a3c', cutscene: 'fissure',
    title: 'Cast Inside the Bell That Killed Him',
  },
  {
    id: 'frosttitan', sprite: 'frosttitan', name: 'Rime Colossus', at: 12,
    hp: 11000, speed: 48, dmg: 50, xp: 900, size: 54, scale: 3.8,
    ai: 'frost', color: '#8fd8ff', cutscene: 'ice',
    title: 'The Effigy That Stood Up',
  },
  {
    id: 'sovereign', sprite: 'sovereign', name: 'Void Sovereign', at: 16,
    hp: 19000, speed: 60, dmg: 58, xp: 1500, size: 58, scale: 4.0,
    ai: 'void', color: '#c05bff', cutscene: 'rift',
    title: 'Crowned, Headless, and Carrying It',
  },
  {
    id: 'parduin', sprite: 'parduin', name: 'Parduin', at: 20,
    cutsceneName: 'Parduin, the Drake God',
    hp: 46000, speed: 54, dmg: 66, xp: 3000, size: 88, scale: 1,
    renderScale: 1.05,
    ai: 'parduin', color: '#ff7a2a', cutscene: 'descent',
    title: 'Ruin on Wings — the Last Thing the Sky Remembers',
  },
];

export const CHAMPION_FIRST = 75;      // seconds until the first champion
export const CHAMPION_EVERY = 85;

// ---------------------------------------------------------------------------
// Meta progression (the Sanctuary)
// ---------------------------------------------------------------------------
export const META_UPGRADES = [
  { id: 'm_might',   name: 'Whetstone',   icon: 'might',     max: 5, cost: [80, 160, 300, 520, 850],  fmt: (l) => `+${l * 5}% damage` },
  { id: 'm_hp',      name: 'Endurance',   icon: 'vitality',  max: 5, cost: [60, 130, 240, 420, 700],  fmt: (l) => `+${l * 10} max health` },
  { id: 'm_armor',   name: 'Hardening',   icon: 'armor',     max: 3, cost: [140, 320, 640],           fmt: (l) => `-${l} damage taken` },
  { id: 'm_speed',   name: 'Light Step',  icon: 'swiftness', max: 4, cost: [70, 150, 280, 480],       fmt: (l) => `+${l * 4}% move speed` },
  { id: 'm_magnet',  name: 'Lodestone',   icon: 'magnet',    max: 4, cost: [50, 110, 210, 360],       fmt: (l) => `+${l * 15}% pickup range` },
  { id: 'm_haste',   name: 'Quickening',  icon: 'cooldown',  max: 4, cost: [120, 260, 480, 820],      fmt: (l) => `-${l * 3}% cooldown` },
  { id: 'm_growth',  name: 'Insight',     icon: 'area',      max: 4, cost: [90, 190, 350, 600],       fmt: (l) => `+${l * 6}% experience` },
  { id: 'm_greed',   name: 'Greed',       icon: 'fortune',   max: 5, cost: [70, 140, 260, 450, 760],  fmt: (l) => `+${l * 12}% gold` },
  { id: 'm_luck',    name: 'Fortune',     icon: 'luck',      max: 4, cost: [110, 240, 440, 760],      fmt: (l) => `+${l * 8}% luck` },
  { id: 'm_reroll',  name: 'Rerolls',     icon: 'amount',    max: 3, cost: [150, 350, 700],           fmt: (l) => `+${l} reroll per run` },
  { id: 'm_banish',  name: 'Banishes',    icon: 'wrath',     max: 3, cost: [150, 350, 700],           fmt: (l) => `+${l} banish per run` },
  { id: 'm_revive',  name: 'Second Wind', icon: 'regen',     max: 2, cost: [600, 1600],               fmt: (l) => `+${l} revive per run` },
];

// ---------------------------------------------------------------------------
// Curves
// ---------------------------------------------------------------------------
/** XP needed to go from `level` to the next one. */
export function xpForLevel(level) {
  if (level <= 20) return 5 + level * 11;
  if (level <= 40) return 225 + (level - 20) * 26;
  return 745 + (level - 40) * 48;
}

/** Global enemy scaling over the run. */
export function hpScale(minutes) { return 1 + minutes * 0.42 + Math.pow(minutes, 1.9) * 0.028; }
export function dmgScale(minutes) { return 1 + minutes * 0.14; }
export function spawnRate(minutes) { return 1.1 + minutes * 0.66 + Math.pow(minutes, 1.7) * 0.045; }
export function maxAlive(minutes) { return Math.min(300, 70 + minutes * 14); }
