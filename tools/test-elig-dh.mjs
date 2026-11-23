#!/usr/bin/env node
// CBS DH eligibility in data/elig-2027.js (elig-dh-fix). No browser.
// The five DH-only names ship as DH / multi false. Romy, Jung and Valencia
// ship the CBS string, not the statsapi backup. The backup rule stays
// testable from the statsapi CSV and the CBS diff: Romy DH, Jung DH,
// Valencia C/DH.
//   node tools/test-elig-dh.mjs
import fs from 'fs';
import path from 'path';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const ELIG_DIR = '/workspace/db2027/eligibility';
let fails = 0;
const ok = (c, msg, extra = '') => { if(!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${msg}${extra ? '  — ' + extra : ''}`); };

const src = fs.readFileSync(path.join(ROOT, 'data/elig-2027.js'), 'utf8');
const ELIG2027 = new Function(src + '\nreturn ELIG2027;')();
const P = ELIG2027.players;

const hasGames = (r, g) => r && r.g && Object.entries(g).every(([k, v]) => r.g[k] === v);

const dh = [
  ['pd3bf6d0', 'Brent Rooker', { OF: 4, DH: 42 }],
  ['pcc4169a', 'Jahmai Jones', { OF: 11, DH: 65 }],
  ['p57ee05c', 'Masataka Yoshida', { OF: 7, DH: 65 }],
  ['p795e822', 'Andrew Benintendi', { OF: 11, DH: 121 }],
  ['p4cbd87a', 'Mickey Gasper', { C: 15, '1B': 10, DH: 33 }],
];
for(const [id, name, g] of dh){
  const r = P[id];
  const bits = Object.entries(g).map(([k, v]) => k + ' ' + v).join(', ');
  ok(r && r.name === name && r.elig === 'DH' && r.multi === false && r.source === 'CBS' && r.fallback === false && hasGames(r, g),
    `${name}: elig DH, multi false, ${bits}`,
    JSON.stringify(r && { elig: r.elig, multi: r.multi, source: r.source, g: r.g }));
}

const romy = P.p2e05319;
ok(romy && romy.name === 'Romy Gonzalez' && romy.elig === '1B/CI' && romy.multi === false
  && romy.g['1B'] === 5 && romy.g['2B'] === 5 && romy.g.DH === 8,
  'Romy Gonzalez: elig 1B/CI, multi false, 1B 5, 2B 5, DH 8',
  JSON.stringify(romy && { elig: romy.elig, multi: romy.multi, g: romy.g }));

const jung = P.pf341e07;
ok(jung && jung.name === 'Jace Jung' && jung.elig === '2B/MI' && jung.multi === false
  && jung.g['1B'] === 1 && jung.g['2B'] === 2 && jung.g.DH === 3 && jung.cbsTeam === 'DET',
  'Jace Jung: elig 2B/MI, multi false, 1B 1, 2B 2, DH 3, cbsTeam DET',
  JSON.stringify(jung && { elig: jung.elig, multi: jung.multi, cbsTeam: jung.cbsTeam, g: jung.g }));

const val = P.p9c1caaf;
ok(val && val.name === 'Eduardo Valencia' && val.elig === 'C' && val.g.C === 19 && val.g.DH === 19,
  'Eduardo Valencia: elig C (not C/DH), C 19, DH 19',
  JSON.stringify(val && { elig: val.elig, g: val.g }));

const rice = P.p988af3f;
ok(rice && rice.name === 'Ben Rice' && rice.elig === '1B/CI' && rice.multi === false
  && rice.g.C === 0 && rice.g['1B'] === 56 && rice.g.DH === 95,
  'Ben Rice: elig 1B/CI, multi false, C 0, 1B 56, DH 95',
  JSON.stringify(rice && { elig: rice.elig, multi: rice.multi, g: rice.g }));

function parseCsv(text){
  const rows = [];
  let row = [], cur = '', q = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(q){
      if(c === '"' && text[i + 1] === '"'){ cur += '"'; i++; }
      else if(c === '"') q = false;
      else cur += c;
    } else if(c === '"') q = true;
    else if(c === ','){ row.push(cur); cur = ''; }
    else if(c === '\n'){ row.push(cur); rows.push(row); row = []; cur = ''; }
    else if(c !== '\r') cur += c;
  }
  if(cur.length || row.length){ row.push(cur); rows.push(row); }
  return rows;
}
function col(rows, id, key){
  const head = rows[0];
  const iId = head.indexOf('pool_id'), iKey = head.indexOf(key);
  const hit = rows.slice(1).find(r => r[iId] === id);
  return hit ? hit[iKey] : undefined;
}

const backup = { p2e05319: 'DH', pf341e07: 'DH', p9c1caaf: 'C/DH' };
const diffPath = path.join(ELIG_DIR, 'cbs_vs_statsapi_diff_2026-11-23.csv');
const apiPath = path.join(ELIG_DIR, 'elig_2027_statsapi.csv');
ok(fs.existsSync(diffPath) && fs.existsSync(apiPath), 'statsapi CSV and CBS diff CSV are present');
if(fs.existsSync(diffPath) && fs.existsSync(apiPath)){
  const diff = parseCsv(fs.readFileSync(diffPath, 'utf8'));
  const api = parseCsv(fs.readFileSync(apiPath, 'utf8'));
  for(const [id, elig] of Object.entries(backup)){
    const fromDiff = col(diff, id, 'statsapi_elig');
    const fromApi = col(api, id, 'derived_elig');
    ok(fromDiff === elig && fromApi === elig && P[id].elig !== elig,
      `${P[id].name}: backup rule would give ${elig}; shipped elig is ${P[id].elig}`,
      JSON.stringify({ diff: fromDiff, statsapi: fromApi, shipped: P[id].elig }));
  }
}

console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
process.exit(fails ? 1 : 0);
