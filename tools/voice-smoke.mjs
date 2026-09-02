/*
 * Voice test — development only.
 *
 *   node tools/voice-smoke.mjs
 *
 * The barks are the one part of the game a silent test cannot hear, so this
 * checks everything around them: every hero is cast, every clip the code can
 * ask for exists and is a valid WAV of the expected shape, nothing ships
 * unused, and the CC BY attribution — including the statement of changes the
 * licence requires — is where it should be.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './dom-stub.mjs';        // installs the fake DOM

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const VOICE = path.join(ROOT, 'audio/voice');

const problems = [];
const check = (c, m) => { if (!c) problems.push(m); };

/** Parse a RIFF header far enough to confirm format, channels and rate. */
function wavInfo(file) {
  const b = fs.readFileSync(file);
  if (b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WAVE') return null;
  let pos = 12, fmt = null, dataLen = 0;
  while (pos + 8 <= b.length) {
    const id = b.toString('latin1', pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    if (id === 'fmt ') {
      fmt = {
        tag: b.readUInt16LE(pos + 8),
        channels: b.readUInt16LE(pos + 10),
        rate: b.readUInt32LE(pos + 12),
        bits: b.readUInt16LE(pos + 22),
      };
    } else if (id === 'data') dataLen = size;
    pos += 8 + size + (size & 1);
  }
  if (!fmt) return null;
  return { ...fmt, seconds: dataLen / (fmt.rate * fmt.channels * (fmt.bits / 8)) };
}

// --- casting ----------------------------------------------------------------
// A cast entry is { who, rate }: the pack ships five actors and the game has
// more speaking parts than that, so two characters may share an actor as long
// as they are held apart by playback rate. What must never happen is two of
// them ending up on the same actor at the same rate.
const { CASTING, VENDOR_CASTING } = await import('../src/core/voice.js');
const { CHARACTERS } = await import('../src/art/hero.js');

for (const ch of CHARACTERS) {
  const c = CASTING[ch.id];
  check(c && typeof c.who === 'string', `${ch.id} has no voice actor cast`);
  check(c && typeof c.rate === 'number' && c.rate > 0.5 && c.rate < 2,
    `${ch.id} has an implausible voice rate (${c?.rate})`);
}

const voiceKey = (c) => `${c.who}@${c.rate.toFixed(3)}`;
const heroVoices = CHARACTERS.map((ch) => voiceKey(CASTING[ch.id]));
check(new Set(heroVoices).size === heroVoices.length,
  `two heroes have an identical voice: ${heroVoices.join(', ')}`);

const vendorVoices = Object.entries(VENDOR_CASTING).map(([id, c]) => {
  check(typeof c.who === 'string' && typeof c.rate === 'number', `vendor ${id} is miscast`);
  return voiceKey(c);
});
check(new Set(vendorVoices).size === vendorVoices.length, 'two vendors sound identical');
// A vendor must not be indistinguishable from a hero either, or the merchant
// sounds like the person standing in front of him.
for (const v of vendorVoices) {
  check(!heroVoices.includes(v), `a vendor shares a voice with a hero (${v})`);
}

const cast = [...Object.values(CASTING), ...Object.values(VENDOR_CASTING)].map((c) => c.who);
console.log(`casting           ok (${CHARACTERS.length} heroes + ${vendorVoices.length} vendors, ` +
  `${new Set([...heroVoices, ...vendorVoices]).size} distinct voices from ${new Set(cast).size} actors)`);

// --- every clip the code can ask for exists ---------------------------------
const src = fs.readFileSync(path.join(ROOT, 'src/core/voice.js'), 'utf8');
const takesBlock = src.slice(src.indexOf('const TAKES'), src.indexOf('// Per-event pacing'));
const takes = [...takesBlock.matchAll(/(\w+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]);
check(takes.length >= 10, `only ${takes.length} bark events found — did TAKES move?`);

let expected = 0, bytes = 0, shortest = 99, longest = 0;
for (const who of new Set(cast)) {
  for (const [event, n] of takes) {
    for (let i = 1; i <= n; i++) {
      expected++;
      const f = path.join(VOICE, who, `${event}-${i}.wav`);
      if (!fs.existsSync(f)) { problems.push(`missing clip: ${who}/${event}-${i}.wav`); continue; }
      bytes += fs.statSync(f).size;
      const info = wavInfo(f);
      if (!info) { problems.push(`${who}/${event}-${i}.wav is not a readable WAV`); continue; }
      check(info.channels === 1, `${who}/${event}-${i}.wav is not mono (${info.channels}ch)`);
      check(info.rate === 22050, `${who}/${event}-${i}.wav is ${info.rate} Hz, expected 22050`);
      check(info.bits === 16, `${who}/${event}-${i}.wav is ${info.bits}-bit, expected 16`);
      check(info.seconds > 0.08 && info.seconds < 12,
        `${who}/${event}-${i}.wav is ${info.seconds.toFixed(2)}s — trimmed wrong?`);
      shortest = Math.min(shortest, info.seconds);
      longest = Math.max(longest, info.seconds);
    }
  }
}
console.log(`clips             ok (${expected} referenced, ${(bytes / 1048576).toFixed(2)} MB, ${shortest.toFixed(2)}s–${longest.toFixed(2)}s)`);

// --- nothing ships unused ---------------------------------------------------
let onDisk = 0;
for (const who of fs.readdirSync(VOICE)) {
  const dir = path.join(VOICE, who);
  if (!fs.statSync(dir).isDirectory()) continue;
  check(new Set(cast).has(who), `audio/voice/${who}/ is not cast to any hero`);
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.wav')) continue;
    onDisk++;
    const m = f.match(/^([a-z]+)-(\d+)\.wav$/);
    if (!m) { problems.push(`unexpected file name: ${who}/${f}`); continue; }
    const take = takes.find((t) => t[0] === m[1]);
    check(take && Number(m[2]) <= take[1], `${who}/${f} ships but nothing plays it`);
  }
}
check(onDisk === expected, `${onDisk} clips on disk but ${expected} referenced`);
console.log(`no orphans        ok (${onDisk} on disk)`);

// --- attribution, including the statement of changes CC BY requires ---------
const source = fs.readFileSync(path.join(VOICE, 'SOURCE.txt'), 'utf8');
for (const needle of ['Dillon Becker', 'CC BY 4.0', 'creativecommons.org/licenses/by/4.0', 'CHANGES MADE']) {
  check(source.includes(needle), `audio/voice/SOURCE.txt is missing "${needle}"`);
}
for (const actor of ['Alex Brodie', 'Ian Lampert', 'Karen Cenon', 'Meghan Christian', 'Sean Lenhart']) {
  check(source.includes(actor), `SOURCE.txt does not name ${actor}`);
}
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
check(html.includes('Dillon Becker'), 'the game never credits Dillon Becker on screen');
check(html.includes('creativecommons.org/licenses/by/4.0'), 'no CC BY licence link in-game');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
check(readme.includes('Dillon Becker'), 'the README does not credit Dillon Becker');
check(readme.includes('Changes made') || readme.includes('CHANGES MADE'),
  'the README does not state what was changed');
console.log('attribution       ok (SOURCE.txt, in-game, README, changes stated)');

// --- the API is safe with no audio available --------------------------------
const voice = await import('../src/core/voice.js');
for (const ch of CHARACTERS) voice.setVoiceActor(ch.id);
for (const [event] of takes) {
  try { voice.say(event); voice.say(event, { force: true }); }
  catch (e) { problems.push(`say('${event}') threw: ${e.message}`); }
}
voice.stopVoice();
voice.setVoiceEnabled(false);
voice.say('hurt');
console.log(`api               ok (${takes.length} events safe without audio)`);

if (problems.length) {
  console.error('\nFAILED:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('\nAll voice checks passed.');
