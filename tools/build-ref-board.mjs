#!/usr/bin/env node
/* Rebuild the reference board that tests/single_pass_test.mjs checks the app against.
   Reads the committed data files (data/seed-2027.js pool + baked keeper picks,
   data/aav-2027.js AAV_2027 block; SEED_VER from index.html, read only) and writes
   tests/fixtures/ref_board_<date>.csv, <date> = date of the last commit that touched
   the inputs. Deterministic: same inputs -> byte-identical file (no clock, no env).
   The test reads the fixture, never data/ live, so the fixture is an independent
   snapshot: rebuild it on every pool refresh, after sign-off and before merge.
     node tools/build-ref-board.mjs            write (or rewrite) the fixture
     node tools/build-ref-board.mjs --check    exit 1 if the fixture is missing or stale */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const INPUTS = ['data/seed-2027.js', 'data/aav-2027.js'];
const OUTDIR = join(ROOT, 'tests/fixtures');

const load = (f, name) => {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, f), 'utf8') + `\n;globalThis.__v = ${name};`, ctx);
  return ctx.__v;
};
const SEED = load('data/seed-2027.js', 'SEED2026'), AAV = load('data/aav-2027.js', 'AAV_2027');
const seedVer = (readFileSync(join(ROOT, 'index.html'), 'utf8').match(/^const SEED_VER = '([^']+)'/m) || [])[1];
if (!seedVer) { console.error('SEED_VER not found in index.html'); process.exit(2); }

const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
const [srcHash, srcDate] = git('log', '-1', '--format=%h %cs', '--', ...INPUTS).split(' ');
const dirty = git('status', '--porcelain', '--', ...INPUTS) !== '';
const sha = f => createHash('sha256').update(readFileSync(join(ROOT, f))).digest('hex').slice(0, 16);

/* board rows: every AAV_2027 entry, seed name/team/side, keeper from SEED2026.picks */
const seedBy = new Map(SEED.players.map(p => [p.id, p]));
const keep = new Map(SEED.picks.filter(k => k.keeper).map(k => [k.pid, k]));
const rows = [];
for (const id of Object.keys(AAV)) {
  const p = seedBy.get(id), b = AAV[id], k = keep.get(id);
  if (!p) { console.error(`AAV_2027 id ${id} not in SEED2026.players`); process.exit(2); }
  if (!!k !== (b.k != null)) { console.error(`${p.name} (${id}): keeper pick and AAV k disagree`); process.exit(2); }
  rows.push({ id, name: p.name, team: p.team, side: p.kind, aav: k ? '' : String(b.a || 0),
    kept: k ? 'Y' : '', sal: k ? String(Number(k.price)) : '', kd: k ? String(b.k) : '', stash: b.s ? 'Y' : '' });
}
const val = r => Number(r.kd || r.aav);
rows.sort((x, y) => val(y) - val(x) || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0) || (x.id < y.id ? -1 : 1));
/* the test matches by name (team breaks ties): a priced name must be unique */
const priced = rows.filter(r => val(r) > 0), seen = new Set();
for (const r of priced) { const key = r.name + '|' + r.team; if (seen.has(key)) { console.error(`duplicate priced name/team ${key}`); process.exit(2); } seen.add(key); }

const q = s => /[",]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
const nk = rows.filter(r => !r.kept && Number(r.aav) > 0), kr = rows.filter(r => r.kept);
const out = [
  `# CTHL 2027 reference board, built by tools/build-ref-board.mjs (do not edit by hand)`,
  `# source commit ${srcHash}${dirty ? '+uncommitted' : ''} (${srcDate}), SEED_VER ${seedVer}`,
  ...INPUTS.map(f => `# ${f} sha256 ${sha(f)}`),
  `# ${rows.length} rows; ${nk.length} priced non-keepers ($${nk.reduce((s, r) => s + Number(r.aav), 0)}), ` +
    `${kr.length} keepers ($${kr.reduce((s, r) => s + Number(r.sal), 0)} salary)`,
  'pool_id,player,team,side,CTHL AAV,kept,keeper salary,keeper display $,stash',
  ...rows.map(r => [r.id, r.name, r.team, r.side, r.aav, r.kept, r.sal, r.kd, r.stash].map(q).join(',')),
].join('\n') + '\n';

const file = join(OUTDIR, `ref_board_${srcDate}.csv`), rel = relative(ROOT, file);
if (CHECK) {
  const latest = existsSync(OUTDIR) ? readdirSync(OUTDIR).filter(f => /^ref_board_.*\.csv$/.test(f)).sort().at(-1) : null;
  const okFile = existsSync(file) && readFileSync(file, 'utf8') === out;
  const okLatest = latest === `ref_board_${srcDate}.csv`;
  if (okFile && okLatest && !dirty) { console.log(`OK  ${rel} is current (${srcHash}, SEED_VER ${seedVer}, ${nk.length} non-keepers / ${kr.length} keepers)`); process.exit(0); }
  console.error(`STALE  ${!existsSync(file) ? rel + ' missing' : !okFile ? rel + ' differs from the data' : !okLatest ? `latest fixture is ${latest}, not ${rel}` : 'data/ inputs have uncommitted changes'}` +
    `\n  rebuild: node tools/build-ref-board.mjs (then update the compared count in tests/single_pass_test.mjs)`);
  process.exit(1);
}
mkdirSync(OUTDIR, { recursive: true });
writeFileSync(file, out);
console.log(`wrote ${rel}: ${rows.length} rows, ${nk.length} priced non-keepers, ${kr.length} keepers (source ${srcHash}${dirty ? '+uncommitted' : ''}, SEED_VER ${seedVer})`);
