#!/usr/bin/env node
// Admin only. Copy keepers from a room into the baked keeper block of
// data/seed-2027.js (SEED2026.picks, keeper entries with t 0), then re-read the
// file and verify every keeper (player, team, salary) matches the room exactly.
// (SEED2026 moved out of index.html into data/seed-2027.js on 2026-11-16.)
//   node tools/sync-keepers.mjs --check              # report only (no write)
//   node tools/sync-keepers.mjs --write              # write + verify (Steven's command only)
//   --room <id>   default steven-keepers-b442410a
//   --seed <path> default ../data/seed-2027.js
//   --html <path> old flag: an index.html path, uses data/seed-2027.js beside it
// Exits 1 on any mismatch (in --check: any difference between room and file).
// Writing the block does NOT reach browsers that already hold a save: that
// also needs BAKED_KEEPER_SET bumped (and CLEARED_BAKED_KEEPERS for drops).
import fs from 'fs';
import path from 'path';
import { args, getRoom, KEEPERS_ROOM } from './room-lib.mjs';

const a = args();
const room = String(a.room || KEEPERS_ROOM);
const seedFile = a.seed ? String(a.seed)
  : a.html ? path.join(path.dirname(String(a.html)), 'data', 'seed-2027.js')
  : new URL('../data/seed-2027.js', import.meta.url).pathname;
const seedLabel = path.basename(path.dirname(seedFile)) + '/' + path.basename(seedFile);
const write = a.write === true;
if(!write && a.check !== true) console.log('(no --write given: running as --check)');

const RE = /^const SEED2026 = (.*);$/m;
const readSeed = () => { const m = fs.readFileSync(seedFile, 'utf8').match(RE); if(!m) throw new Error('SEED2026 line not found in '+seedFile); return JSON.parse(m[1]); };
const d = await getRoom(room);
if(!d || !d.picks){ console.error(`Room ${room} has no picks. Nothing to compare.`); process.exit(2); }
const roomK = Object.values(d.picks).filter(k => k.keeper);
if(roomK.length !== Object.values(d.picks).length) console.log(`note: room also has ${Object.values(d.picks).length - roomK.length} non-keeper picks (ignored)`);

function compare(seed){
  const baked = (seed.picks || []).filter(k => k.keeper);
  const B = new Map(baked.map(k => [String(k.pid), k])), R = new Map(roomK.map(k => [String(k.pid), k]));
  const out = [];
  for(const [pid, r] of R){
    const b = B.get(pid);
    if(!b) out.push(`+ in room, not in file: ${r.name} (${r.team} $${r.price})`);
    else if(b.team !== r.team || +b.price !== +r.price || b.name !== r.name)
      out.push(`~ ${r.name}: file ${b.name} ${b.team} $${b.price}  room ${r.team} $${r.price}`);
  }
  for(const [pid, b] of B) if(!R.has(pid)) out.push(`- in file, not in room: ${b.name} (${b.team} $${b.price})`);
  const sum = arr => arr.reduce((s, k) => s + (+k.price || 0), 0);
  return {out, nFile: baked.length, nRoom: roomK.length, $file: sum(baked), $room: sum(roomK)};
}
const report = (c, label) => {
  console.log(`${label}: room ${room} ${c.nRoom} keepers / $${c.$room} · ${seedLabel} ${c.nFile} keepers / $${c.$file}`);
  c.out.forEach(l => console.log('  ' + l));
  console.log(c.out.length ? `  ${c.out.length} difference(s)` : '  MATCH: every keeper (player, team, salary) agrees');
};

const before = compare(readSeed());
report(before, write ? 'before' : 'check');
if(!write) process.exit(before.out.length ? 1 : 0);

// ---- write: replace keeper picks, keep any non-keeper seed picks, refresh players[].pick
const text = fs.readFileSync(seedFile, 'utf8');
const seed = JSON.parse(text.match(RE)[1]);
const order = (seed.settings && seed.settings.teams) || [];
const keepers = roomK.map(k => ({pid:String(k.pid), name:k.name, team:k.team, price:+k.price, keeper:true, taxi:false, t:0}))
  .sort((x, y) => (order.indexOf(x.team) - order.indexOf(y.team)) || x.team.localeCompare(y.team) || y.price - x.price || x.name.localeCompare(y.name));
seed.picks = [...keepers, ...(seed.picks || []).filter(k => !k.keeper)];
const byPid = new Map(seed.picks.map(k => [k.pid, k]));
(seed.players || []).forEach(p => { const k = byPid.get(String(p.id)); p.pick = k ? {team:k.team, price:k.price, keeper:!!k.keeper, taxi:!!k.taxi} : null; });
const missing = keepers.filter(k => !(seed.players || []).some(p => String(p.id) === k.pid));
if(missing.length) console.log(`WARNING: ${missing.length} room keeper(s) not in the seed pool: ${missing.map(k => k.name).join(', ')}`);
fs.writeFileSync(seedFile, text.replace(RE, () => `const SEED2026 = ${JSON.stringify(seed)};`));
const after = compare(readSeed());
report(after, 'after write (re-read)');
process.exit(after.out.length ? 1 : 0);
