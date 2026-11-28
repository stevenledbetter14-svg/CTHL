#!/usr/bin/env node
// 2026-11-28: the SEED2026 rows themselves (not only POOL_OVERRIDES.team) carry the new clubs of
// the four players who changed teams after the 11/20 pool build, and none of them is struck.
//   node tools/test-seed-clubs-1128.mjs
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
let fails = 0;
const ok = (c, msg, extra = '') => { if(!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${msg}${extra ? '  — ' + extra : ''}`); };
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'data', 'seed-2027.js'), 'utf8') + '\nglobalThis.__S = SEED2026;', ctx);
const by = Object.fromEntries(ctx.__S.players.map(p => [p.id, p]));
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ov = html.slice(html.indexOf('const POOL_OVERRIDES = {'), html.indexOf('END POOL OVERRIDES'));
const status = ov.slice(ov.indexOf('"status": {'));
const WANT = { p7bdc968: ['Kris Bubic', 'CLE'], p2db3997: ['Luis Gil', 'DET'], pfc2e6a5: ['Kevin Gausman', 'DET'], pd39630d: ['Jazz Chisholm Jr.', 'TOR'] };
for(const [id, [name, team]] of Object.entries(WANT)){
  const p = by[id];
  ok(!!p && p.name === name && p.team === team, `${name} (${id}): seed row team ${team}`, p ? p.team : 'missing');
  const m = ov.match(new RegExp(`"${id}":\\s*"([A-Z]+)"`));
  ok(!m || m[1] === team, `${name}: POOL_OVERRIDES team agrees (${m ? m[1] : 'none'})`);
  ok(!new RegExp(`"${id}":`).test(status), `${name}: no POOL_OVERRIDES status (not struck)`);
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
