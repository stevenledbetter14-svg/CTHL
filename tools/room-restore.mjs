#!/usr/bin/env node
// Admin only. Write a backup file back into a room.
//   node tools/room-restore.mjs <backup.json> --room <id>             # dry run (default)
//   node tools/room-restore.mjs <backup.json> --room <id> --confirm   # writes
// Always prints a diff summary (pick counts, added / removed / changed) first.
// Writes ONLY with both --room and --confirm. Before writing it takes a fresh
// backup of the target room, then PUTs the whole room and re-reads to verify.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { args, getRoom, roomUrl, stamp, counts, DB } from './room-lib.mjs';

const a = args();
const file = a._[0];
if(!file){ console.error('usage: room-restore.mjs <backup.json> --room <id> [--confirm]'); process.exit(64); }
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const backup = raw && raw.data !== undefined && raw.room ? raw.data : raw;   // wrapper or bare room JSON
if(!backup || typeof backup !== 'object'){ console.error('Backup has no room data.'); process.exit(65); }
if(!a.room || a.room === true){ console.error('Refusing: --room <id> is required (no default target for a restore).'); process.exit(64); }
const room = String(a.room);
const write = a.confirm === true;

const cur = await getRoom(room);
const fmt = c => `picks ${c.picks} (keepers ${c.keepers}, sales ${c.sales}) · taxi ${c.taxi} · $${c.dollars} · seedVer ${c.seedVer}`;
console.log(`Restore ${path.basename(file)}${raw.room ? ` (taken from ${raw.room} at ${raw.takenAt})` : ''}`);
console.log(`  target room : ${room}`);
console.log(`  room now    : ${cur == null ? '(empty)' : fmt(counts(cur))}`);
console.log(`  backup      : ${fmt(counts(backup))}`);

function diffNode(name, now, then){
  const n = now || {}, t = then || {};
  const add = Object.keys(t).filter(k => !(k in n));
  const del = Object.keys(n).filter(k => !(k in t));
  const noT = x => JSON.stringify(Object.assign({}, x, {t:undefined}));   // sale identity ignores the timestamp
  const both = Object.keys(t).filter(k => k in n && JSON.stringify(n[k]) !== JSON.stringify(t[k]));
  const chg = both.filter(k => noT(n[k]) !== noT(t[k]));
  const tOnly = both.length - chg.length;
  const line = k => { const x = t[k] || n[k]; return `${x.name || k} (${x.team || '?'} $${x.price ?? x.round ?? ''})`; };
  console.log(`  ${name}: +${add.length} restored, -${del.length} removed, ~${chg.length} changed${tOnly ? `, ${tOnly} timestamp-only` : ''}`);
  add.slice(0, 20).forEach(k => console.log(`      + ${line(k)}`));
  del.slice(0, 20).forEach(k => console.log(`      - ${(n[k].name||k)} (${n[k].team||'?'} $${n[k].price ?? n[k].round ?? ''})`));
  chg.slice(0, 20).forEach(k => console.log(`      ~ ${n[k].name||k}: ${n[k].team} $${n[k].price ?? n[k].round} -> ${t[k].team} $${t[k].price ?? t[k].round}`));
  return add.length + del.length + both.length;
}
const nP = diffNode('picks', cur && cur.picks, backup.picks);
const nT = diffNode('taxi ', cur && cur.taxi, backup.taxi);
const hatSame = JSON.stringify((cur && cur.hat) ?? null) === JSON.stringify(backup.hat ?? null);
console.log(`  hat  : ${hatSame ? 'same' : 'differs'}`);
if(cur && backup.meta && cur.meta && cur.meta.seedVer !== backup.meta.seedVer)
  console.log(`  WARNING: seedVer differs (room ${cur.meta.seedVer}, backup ${backup.meta.seedVer}). Devices on the other build will go read-only.`);

if(!write){
  console.log(`\nDRY RUN: nothing written. Re-run with --room ${room} --confirm to write.`);
  process.exit(0);
}
const seedSame = ((cur&&cur.meta)||{}).seedVer === ((backup.meta)||{}).seedVer;
if(!nP && !nT && hatSame && seedSame){ console.log('\nRoom already matches the backup. Nothing written.'); process.exit(0); }

// safety copy of what is about to be overwritten
if(cur != null){
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'backups');
  fs.mkdirSync(dir, {recursive:true});
  const pre = path.join(dir, `${room}-${stamp()}-pre-restore.json`);
  fs.writeFileSync(pre, JSON.stringify({room, db:DB, takenAt:new Date().toISOString(), data:cur}, null, 1));
  console.log(`\nPre-restore backup -> ${pre}`);
}
const body = JSON.parse(JSON.stringify(backup));
body.meta = Object.assign({}, body.meta, {lastWriter:'admin-restore', t:Date.now()});
const r = await fetch(roomUrl(room) + '?print=silent', {method:'PUT', body:JSON.stringify(body)});
if(!r.ok){
  console.error(`WRITE FAILED: HTTP ${r.status} ${await r.text()}`);
  console.error('If this is "Permission denied", the database rules need an admin credential for whole-room PUTs (REST ?auth=<token> or a service account).');
  process.exit(1);
}
const after = await getRoom(room);
const ok = JSON.stringify(counts(after)) === JSON.stringify(Object.assign(counts(backup), {seedVer: counts(after).seedVer}))
  && JSON.stringify(after.picks || {}) === JSON.stringify(backup.picks || {})
  && JSON.stringify(after.taxi || {}) === JSON.stringify(backup.taxi || {});
console.log(`Written. Room now: ${fmt(counts(after))}  ${ok ? 'VERIFIED' : 'MISMATCH after write!'}`);
process.exit(ok ? 0 : 1);
