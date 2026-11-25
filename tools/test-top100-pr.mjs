#!/usr/bin/env node
// AL Top 100 players in the pool carry p.pr (2026-11-25). Pure node: seed +
// values CSV + index.html. No Chrome, no Firebase.
//   1. every AL pool player whose values row has top100=Y has a p.pr array
//      (values: /workspace/db2027/steamer/values_2027_steamer.csv; skip rows
//      not in the pool);
//   2. the 9 ids missed by the 11/3 import have the listed pr values;
//   3. Array.isArray(p.pr) is 38 hitters and 13 pitchers;
//   4. those 9 still have their original src (not "MLB Top 100 #N...");
//   5. PROSPECT_FLOOR_IDS in index.html is still the existing 10 ids.
//   node tools/test-top100-pr.mjs
import fs from 'fs';
import path from 'path';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const VALUES = '/workspace/db2027/steamer/values_2027_steamer.csv';
const AL = new Set('BAL,BOS,CHW,CLE,DET,HOU,KCR,LAA,MIN,NYY,ATH,OAK,SEA,TBR,TEX,TOR'.split(','));
const FLOOR_IDS = ['pdc823df','p6587b4a','p6ccee2a','p96f7374','p8985064','p5b997e0','p9c8df46','p4da2d2a','p5d22ea3','pec92b6a'];
const NINE = {
  p218e0b7: {name:'Leo De Vries',        pr:[3,0],  src:'no 2026 MLB stats'},
  p8604871: {name:'Kade Anderson',       pr:[5,0],  src:'CBS (full-season MLB)'},
  pb8dee08: {name:'Sebastian Walcott',   pr:[8,0],  src:'no 2026 MLB stats'},
  p6377140: {name:'Walker Jenkins',      pr:[13,0], src:'CBS (full-season MLB)'},
  pe8c1474: {name:'Kaelen Culpepper',    pr:[31,0], src:'CBS (full-season MLB)'},
  p3f9d52f: {name:'Michael Arroyo',      pr:[41,0], src:'CBS (full-season MLB)'},
  p9e1a8ef: {name:'Bryce Rainer',        pr:[44,0], src:'no 2026 MLB stats'},
  pf92e233: {name:'Lazaro Montes',       pr:[53,0], src:'CBS (full-season MLB)'},
  p64ab4f3: {name:'River Ryan',          pr:[64,0], src:'CBS (full-season MLB)'}
};
let fails = 0;
const ok = (c, msg, extra = '') => { if(!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${msg}${extra ? '  — ' + extra : ''}`); };

function loadConst(file, name){
  return new Function(fs.readFileSync(path.join(ROOT, file), 'utf8') + `\nreturn ${name};`)();
}
function parseCsv(text){
  const rows = [];
  let row = [], field = '', q = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for(let i = 0; i < s.length; i++){
    const c = s[i];
    if(q){
      if(c === '"'){
        if(s[i+1] === '"'){ field += '"'; i++; }
        else q = false;
      }else field += c;
    }else if(c === '"') q = true;
    else if(c === ','){ row.push(field); field = ''; }
    else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  const header = rows[0];
  return rows.slice(1).filter(r => r.some(x => x !== '')).map(r => {
    const o = {};
    header.forEach((h, j) => { o[h] = r[j] ?? ''; });
    return o;
  });
}

const SEED = loadConst('data/seed-2027.js', 'SEED2026');
const byId = new Map(SEED.players.map(p => [p.id, p]));
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

ok(fs.existsSync(VALUES), `values file exists (${VALUES})`);
const values = parseCsv(fs.readFileSync(VALUES, 'utf8'));
const missing = [];
let nTop = 0, skipped = 0;
for(const row of values){
  if(row.top100 !== 'Y') continue;
  const p = byId.get(row.pool_id);
  if(!p){ skipped++; continue; }
  if(!AL.has(p.team)) continue;
  nTop++;
  if(!Array.isArray(p.pr)) missing.push(`${p.name} (${p.id})`);
}
ok(missing.length === 0, `every AL pool player with values top100=Y has p.pr (${nTop})`,
  missing.length ? missing.join(', ') : `skipped ${skipped} values rows not in the pool`);

for(const [id, w] of Object.entries(NINE)){
  const p = byId.get(id);
  ok(!!p && p.name === w.name && Array.isArray(p.pr) && p.pr[0] === w.pr[0] && p.pr[1] === w.pr[1] && p.pr.length === 2,
    `${w.name} (${id}) pr=[${w.pr}]`, p ? JSON.stringify(p.pr) : 'missing');
}

const withPr = SEED.players.filter(p => Array.isArray(p.pr));
const nH = withPr.filter(p => p.kind === 'H').length;
const nP = withPr.filter(p => p.kind === 'P').length;
ok(nH === 38 && nP === 13, `isProspect count is 38 hitters and 13 pitchers`, `${nH} H / ${nP} P`);

for(const [id, w] of Object.entries(NINE)){
  const p = byId.get(id);
  ok(p && p.src === w.src && !/MLB Top 100/.test(p.src || ''),
    `${w.name} src unchanged (${w.src})`, p ? p.src : 'missing');
}

const m = html.match(/const PROSPECT_FLOOR_IDS = \[([^\]]+)\]/);
const floor = m ? m[1].match(/p[0-9a-f]+/g) : null;
ok(!!floor && floor.length === 10 && FLOOR_IDS.every((id, i) => floor[i] === id),
  'PROSPECT_FLOOR_IDS unchanged (10 ids starting pdc823df, p6587b4a, ...)',
  floor ? floor.join(',') : 'not found');

if(fails) process.exit(1);
console.log('OK');
