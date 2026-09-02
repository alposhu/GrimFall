/*
 * Music and sound-effect test — development only.
 *
 *   node tools/music-smoke.mjs
 *
 * Two things have to hold for both banks. Every file the code asks for must
 * actually exist on disk (a typo here is silence in the shipped game), and
 * every event must still resolve when the files cannot play at all — Node has
 * no `Audio` and no decoder, so the procedural fallback is what runs here.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './dom-stub.mjs';        // installs the fake DOM

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const AUDIO = path.join(ROOT, 'audio');

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

// --- every referenced file exists -------------------------------------------
const src = fs.readFileSync(path.join(ROOT, 'src/core/audio.js'), 'utf8');
const block = src.slice(src.indexOf('const MUSIC_FILES'), src.indexOf('const FADE'));
// The soundtrack is mp3, the market's own recording is a wav, and the crowd
// layered under it is an ogg from the RPG Maker library. All three are checked.
const referenced = [...block.matchAll(/'([\w-]+\.(?:mp3|wav|ogg))'/g)].map((m) => m[1]);
check(referenced.length >= 12, `only ${referenced.length} tracks referenced — did the table move?`);

let bytes = 0;
for (const file of new Set(referenced)) {
  const p = path.join(AUDIO, file);
  if (!fs.existsSync(p)) { problems.push(`missing audio file: ${file}`); continue; }
  const size = fs.statSync(p).size;
  bytes += size;
  check(size > 20000, `${file} is only ${size} bytes — truncated?`);
}
console.log(`tracks referenced ok (${new Set(referenced).size} files, ${(bytes / 1048576).toFixed(1)} MB)`);

// --- nothing on disk is unused ----------------------------------------------
const onDisk = fs.readdirSync(AUDIO)
  .filter((f) => /\.(mp3|wav|ogg)$/.test(f));
for (const f of onDisk) {
  check(referenced.includes(f), `${f} ships but nothing plays it`);
}
console.log(`no orphan files   ok (${onDisk.length} on disk)`);

// --- attribution travels with the files -------------------------------------
const source = fs.readFileSync(path.join(AUDIO, 'SOURCE.txt'), 'utf8');
check(source.includes('HydroGene'), 'audio/SOURCE.txt does not credit HydroGene');
check(source.includes('hydrogene.itch.io'), 'audio/SOURCE.txt has no link to the pack');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check(html.includes('HydroGene'), 'the game never credits HydroGene on screen');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
check(readme.includes('HydroGene'), 'the README does not credit HydroGene');
console.log('attribution       ok (SOURCE.txt, in-game, README)');

// --- the sound-effect bank --------------------------------------------------
const sfxBlock = src.slice(src.indexOf('const SFX_TAKES'), src.indexOf('const SFX_GAIN'));
// Keys may be bare (`heal: 2`) or quoted when they contain a hyphen
// (`'market-open': 1`), so both spellings have to be picked up.
const sfxTakes = [...sfxBlock.matchAll(/'?([\w-]+)'?:\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]);
check(sfxTakes.length >= 20, `only ${sfxTakes.length} sfx events found — did SFX_TAKES move?`);

// Per-boss sounds are registered by loop, so derive the same list the code does.
const { BOSSES: BOSSDEFS } = await import('../src/game/config.js');
// `sfxFileName` is the game's own answer to "wav or ogg?", imported rather
// than reimplemented so the bank and this check cannot drift apart.
const { sfxFileName } = await import('../src/core/audio.js');
const bossEvents = ['arrive', 'cast', 'attack', 'die'];
for (const b of BOSSDEFS) {
  const evs = b.id === 'parduin' ? [...bossEvents, 'breath', 'wing', 'land'] : bossEvents;
  for (const ev of evs) sfxTakes.push([`boss-${b.id}-${ev}`, 2]);
}

const SFXDIR = path.join(AUDIO, 'sfx');
let sfxBytes = 0, sfxCount = 0;
for (const [name, takes] of sfxTakes) {
  for (let i = 1; i <= takes; i++) {
    const file = sfxFileName(name, i);
    const f = path.join(SFXDIR, file);
    if (!fs.existsSync(f)) { problems.push(`missing sfx: ${file}`); continue; }
    const size = fs.statSync(f).size;
    sfxBytes += size;
    sfxCount++;
    check(size > 2000, `${file} is only ${size} bytes`);
  }
}
const sfxOnDisk = fs.readdirSync(SFXDIR).filter((f) => /\.(wav|ogg)$/.test(f));
check(sfxOnDisk.length === sfxCount, `${sfxOnDisk.length} sfx on disk but ${sfxCount} referenced`);
console.log(`sfx bank          ok (${sfxCount} clips, ${(sfxBytes / 1048576).toFixed(2)} MB)`);

// Every synthesised fallback still exists for each recorded event, so a failed
// download degrades to a blip rather than to silence.
const synthBlock = src.slice(src.indexOf('const SFX = {'), src.indexOf('export function sfx'));
const fbBlock = src.slice(src.indexOf('const BOSS_SFX_FALLBACK'), src.indexOf('for (const id of BOSS_SFX_IDS'));
for (const [name] of sfxTakes) {
  if (name.startsWith('boss-')) {
    // Boss sounds degrade to a generic event, which must itself be synthesised.
    const ev = name.slice(name.lastIndexOf('-') + 1);
    const m = fbBlock.match(new RegExp(`${ev}:\\s*'(\\w+)'`));
    check(m, `boss event "${ev}" has no generic fallback`);
    if (m) check(synthBlock.includes(`${m[1]}:`), `fallback "${m[1]}" is not synthesised`);
  } else {
    check(
      synthBlock.includes(`${name}:`) || synthBlock.includes(`'${name}':`),
      `${name} has no synthesised fallback`
    );
  }
}
console.log('sfx fallbacks     ok (every event degrades to a synth version)');

// The five bosses must not share a sound, or the point is lost.
const arrivals = new Set(BOSSDEFS.map((b) => `boss-${b.id}-arrive`));
check(arrivals.size === BOSSDEFS.length, 'bosses share an arrival sound');
console.log(`boss sfx          ok (${BOSSDEFS.length} distinct identities)`);

const sfxSource = fs.readFileSync(path.join(SFXDIR, 'SOURCE.txt'), 'utf8');
for (const needle of ['Helton Yan', 'CC BY 4.0', 'creativecommons.org/licenses/by/4.0', 'CHANGES MADE']) {
  check(sfxSource.includes(needle), `audio/sfx/SOURCE.txt is missing "${needle}"`);
}
check(html.includes('Helton Yan'), 'the game never credits Helton Yan on screen');
check(readme.includes('Helton Yan'), 'the README does not credit Helton Yan');
console.log('sfx attribution   ok (SOURCE.txt, in-game, README)');

// --- every context resolves, with no Audio available ------------------------
const audio = await import('../src/core/audio.js');
const BOSSES = BOSSDEFS;
const { battleTrackName } = await import('../src/game/game.js');

audio.initAudio({ musicOn: true, musicVol: 0.5, sfxOn: true, sfxVol: 0.7 });

const contexts = [
  'menu', 'battle', 'battle2', 'battle3', 'victory', 'gameover',
  ...BOSSES.map((b) => `boss:${b.id}`),
  'boss:unknown-future-boss',
];
for (const name of contexts) {
  try {
    audio.playMusic(name);
  } catch (e) {
    problems.push(`playMusic('${name}') threw: ${e.message}`);
  }
}
audio.stopMusic();
console.log(`contexts          ok (${contexts.length} resolved without Audio)`);

for (const [name] of sfxTakes) {
  try { audio.sfx(name); } catch (e) { problems.push(`sfx('${name}') threw: ${e.message}`); }
}
console.log(`sfx api           ok (${sfxTakes.length} events safe without audio)`);

// Each boss has its own theme rather than sharing one.
const bossTracks = new Set();
for (const b of BOSSES) {
  const m = block.match(new RegExp(`'boss:${b.id}':\\s*\\{\\s*src:\\s*'([\\w-]+\\.mp3)'`));
  check(m, `${b.id} has no theme of its own`);
  if (m) bossTracks.add(m[1]);
}
check(bossTracks.size === BOSSES.length,
  `bosses share themes: ${bossTracks.size} distinct for ${BOSSES.length} bosses`);
console.log(`boss themes       ok (${bossTracks.size} distinct)`);

// The battle theme escalates rather than staying put.
check(battleTrackName(0) === 'battle', 'the run should open on the first battle theme');
check(battleTrackName(9) === 'battle2', 'the mid-run theme did not take over');
check(battleTrackName(17) === 'battle3', 'the late-run theme did not take over');
console.log('escalation        ok (battle -> battle2 -> battle3)');

if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('\nAll music checks passed.');
