#!/usr/bin/env node
// Admin only. Export a room's full JSON to backups/<room>-<timestamp>.json.
//   node tools/room-backup.mjs                      # official 2027 draft room
//   node tools/room-backup.mjs --room steven-keepers-b442410a
//   node tools/room-backup.mjs --room X --out /some/dir
// Read-only: never writes to Firebase.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { args, getRoom, stamp, counts, OFFICIAL_ROOM, DB } from './room-lib.mjs';

const a = args();
const room = String(a.room || OFFICIAL_ROOM);
const dir = a.out ? String(a.out) : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'backups');

const data = await getRoom(room);
if(data == null){ console.error(`Room ${room} is empty or does not exist. Nothing written.`); process.exit(2); }
fs.mkdirSync(dir, {recursive:true});
const takenAt = new Date();
const file = path.join(dir, `${room}-${stamp(takenAt)}.json`);
fs.writeFileSync(file, JSON.stringify({room, db:DB, takenAt:takenAt.toISOString(), data}, null, 1));
const c = counts(data);
console.log(`Backed up ${room}`);
console.log(`  picks ${c.picks} (keepers ${c.keepers}, sales ${c.sales}) · taxi ${c.taxi} · $${c.dollars} · seedVer ${c.seedVer}`);
console.log(`  -> ${file}`);
