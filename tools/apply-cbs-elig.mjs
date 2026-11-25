#!/usr/bin/env node
// Copy CBS 2027 eligibility onto SEED2026 hitters.
// data/elig-2027.js is the source (emit_elig_2027.py). The app reads
// SEED2026.players[].elig, so this is the step that changes what Projections,
// the Draft List, the cards and slotting show.
//
// Rules: kind 'H' only. Pitchers are not touched. An empty elig in
// elig-2027.js is not written; the seed value stays and the player is listed.
// The SEED2026 const stays one line. SEED_VER is not changed.
//
//   node tools/apply-cbs-elig.mjs            # report only
//   node tools/apply-cbs-elig.mjs --write    # rewrite data/seed-2027.js
//   node tools/apply-cbs-elig.mjs --write --audit reports/elig_audit_2026-11-24.csv
import fs from 'fs';
import path from 'path';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const auditIdx = argv.indexOf('--audit');
const AUDIT = auditIdx >= 0 ? argv[auditIdx + 1] : '';
if (auditIdx >= 0 && !AUDIT) {
  console.error('--audit needs a path');
  process.exit(1);
}

const AL = new Set('BAL,BOS,CHW,CLE,DET,HOU,KCR,LAA,MIN,NYY,ATH,OAK,SEA,TBR,TEX,TOR'.split(','));
const DLSEC = { P: 'Pitchers', C: 'Catchers', IF: 'Infielders', OF: 'Outfielders', DH: 'DH' };

function loadConst(file, name) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  return { src, value: new Function(src + `\nreturn ${name};`)() };
}

function loadOverrides() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/const POOL_OVERRIDES = (\{[\s\S]*?\});\n\/\* ================= END POOL OVERRIDES/);
  if (!m) throw new Error('no POOL_OVERRIDES in index.html');
  const raw = m[1].replace(/\/\/.*$/gm, '');
  return JSON.parse(raw);
}

function poolStatus(id, ov) {
  const st = (ov.status || {})[id];
  if (!st) return null;
  const t = (ov.team || {})[id];
  if (t && AL.has(String(t).toUpperCase())) return null;
  return String(st);
}

function dlSection(p, sectionOv) {
  const ov = sectionOv[p.id];
  if (ov && DLSEC[ov]) return DLSEC[ov];
  if (p.kind === 'P') return 'Pitchers';
  const parts = (p.elig || '').split('/').filter(x => x && !['MI', 'CI', 'Util'].includes(x));
  if (parts.includes('C')) return 'Catchers';
  if (parts.some(x => ['1B', '2B', '3B', 'SS'].includes(x))) return 'Infielders';
  if (parts.includes('OF')) return 'Outfielders';
  return 'DH';
}

function csvCell(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const seedFile = loadConst('data/seed-2027.js', 'SEED2026');
const eligFile = loadConst('data/elig-2027.js', 'ELIG2027');
const SEED = seedFile.value;
const ELIG = eligFile.value.players;
const ov = loadOverrides();
const teamOv = ov.team || {};
const sectionOv = ov.section || {};

const draft = [];
for (const p of SEED.players) {
  if (p.kind !== 'H') continue;
  const team = teamOv[p.id] || p.team;
  if (poolStatus(p.id, ov) || !AL.has(team)) continue;
  draft.push({ p, team });
}

const missing = draft.filter(d => !ELIG[d.p.id]);
if (missing.length) {
  console.error('draft-list hitters missing from elig-2027.js:');
  for (const d of missing) console.error(`  ${d.p.id} ${d.p.name} ${d.team}`);
  process.exit(1);
}

const changes = [];
const keptEmpty = [];
for (const { p, team } of draft) {
  const rec = ELIG[p.id];
  const next = rec.elig || '';
  if (!next) {
    keptEmpty.push({ p, team, rec });
    continue;
  }
  if (next !== (p.elig || '')) changes.push({ p, team, rec, before: p.elig || '', after: next });
}

const pitchers = SEED.players.filter(p => p.kind === 'P').length;
const hittersOffList = SEED.players.filter(p => p.kind === 'H' && !draft.some(d => d.p.id === p.id)).length;

console.log(`draft-list hitters ${draft.length}`);
console.log(`CHANGED ${changes.length}`);
for (const c of changes) {
  console.log(`  ${c.p.id} ${c.p.name} ${c.team} ${c.before} -> ${c.after} ${c.rec.source}`);
}
console.log(`KEPT (elig-2027 empty; seed left as-is) ${keptEmpty.length}`);
for (const k of keptEmpty) {
  console.log(`  ${k.p.id} ${k.p.name} ${k.team} seed ${k.p.elig || '(blank)'} source ${k.rec.source}`);
}
console.log(`pitchers untouched ${pitchers}`);
console.log(`hitters not on the draft list, not rewritten ${hittersOffList}`);

if (AUDIT) {
  const rows = [];
  for (const c of changes) {
    const beforeP = { id: c.p.id, kind: 'H', elig: c.before };
    const afterP = { id: c.p.id, kind: 'H', elig: c.after };
    rows.push({
      name: c.p.name,
      pool_id: c.p.id,
      team: c.team,
      elig_before: c.before,
      elig_after: c.after,
      source: c.rec.source,
      draft_list_section_before: dlSection(beforeP, sectionOv),
      draft_list_section_after: dlSection(afterP, sectionOv),
    });
  }
  const changedIds = new Set(changes.map(c => c.p.id));
  for (const k of keptEmpty) {
    if (changedIds.has(k.p.id)) continue;
    const same = { id: k.p.id, kind: 'H', elig: k.p.elig || '' };
    rows.push({
      name: k.p.name,
      pool_id: k.p.id,
      team: k.team,
      elig_before: k.p.elig || '',
      elig_after: k.p.elig || '',
      source: k.rec.source,
      draft_list_section_before: dlSection(same, sectionOv),
      draft_list_section_after: dlSection(same, sectionOv),
    });
  }
  // No-CBS hitters whose backup string already matched the seed.
  for (const { p, team } of draft) {
    const rec = ELIG[p.id];
    if (rec.source !== 'statsapi') continue;
    if (changedIds.has(p.id) || keptEmpty.some(k => k.p.id === p.id)) continue;
    const same = { id: p.id, kind: 'H', elig: p.elig || '' };
    rows.push({
      name: p.name,
      pool_id: p.id,
      team,
      elig_before: p.elig || '',
      elig_after: rec.elig || '',
      source: rec.source,
      draft_list_section_before: dlSection(same, sectionOv),
      draft_list_section_after: dlSection({ id: p.id, kind: 'H', elig: rec.elig || '' }, sectionOv),
    });
  }
  rows.sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name));
  const cols = ['name', 'pool_id', 'team', 'elig_before', 'elig_after', 'source', 'draft_list_section_before', 'draft_list_section_after'];
  const out = [cols.join(',')].concat(rows.map(r => cols.map(c => csvCell(r[c])).join(','))).join('\n') + '\n';
  const dest = path.isAbsolute(AUDIT) ? AUDIT : path.join(ROOT, AUDIT);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out);
  console.log(`audit ${rows.length} rows -> ${dest}`);
}

if (!WRITE) {
  console.log('dry run (pass --write to update data/seed-2027.js)');
  process.exit(0);
}

let text = seedFile.src;
const constLines = text.split('\n').filter(l => l.startsWith('const SEED2026'));
if (constLines.length !== 1) {
  console.error(`SEED2026 const lines ${constLines.length}, expected 1`);
  process.exit(1);
}
for (const c of changes) {
  const name = JSON.stringify(c.p.name);
  const needle = `"id":${JSON.stringify(c.p.id)},"name":${name},"team":${JSON.stringify(c.p.team)},"kind":"H","elig":${JSON.stringify(c.before)}`;
  const repl = `"id":${JSON.stringify(c.p.id)},"name":${name},"team":${JSON.stringify(c.p.team)},"kind":"H","elig":${JSON.stringify(c.after)}`;
  const n = text.split(needle).length - 1;
  if (n !== 1) {
    console.error(`elig pattern for ${c.p.name} matched ${n} times`);
    process.exit(1);
  }
  text = text.replace(needle, repl);
}

const seedPath = path.join(ROOT, 'data/seed-2027.js');
const prefix = (s) => s.split('\n').filter(l => !l.startsWith('const SEED2026')).join('\n');
if (prefix(text) !== prefix(seedFile.src)) {
  console.error('refusing to write: header comments would change');
  process.exit(1);
}
fs.writeFileSync(seedPath, text);

const after = new Function(fs.readFileSync(seedPath, 'utf8') + '\nreturn SEED2026;')();
const beforeById = new Map(SEED.players.map(p => [p.id, p]));
let bad = 0;
if (after.players.length !== SEED.players.length) bad++;
for (const p of after.players) {
  const was = beforeById.get(p.id);
  const want = changes.find(c => c.p.id === p.id);
  const expect = want ? want.after : (was.elig || '');
  if ((p.elig || '') !== expect) {
    console.error(`verify elig ${p.name}: ${p.elig} !== ${expect}`);
    bad++;
  }
  if (p.kind === 'P' && (p.elig || '') !== (was.elig || '')) {
    console.error(`pitcher elig changed ${p.name}`);
    bad++;
  }
  const { elig: _a, ...restA } = p;
  const { elig: _b, ...restB } = was;
  if (JSON.stringify(restA) !== JSON.stringify(restB)) {
    console.error(`non-elig field changed ${p.name}`);
    bad++;
  }
}
const again = text.split('\n').filter(l => l.startsWith('const SEED2026'));
if (again.length !== 1) bad++;
if (bad) {
  console.error(`${bad} verify failures`);
  process.exit(1);
}
console.log(`wrote data/seed-2027.js (${changes.length} hitter elig fields). SEED2026 is still one line.`);
