#!/usr/bin/env node
// Self-test for the Rotoworld links (2026-11-20, spec zuck_2026-11-20_package.md section 2).
// Runs the app's own knorm() + rotoUrl() (lifted from index.html, not re-implemented) over
// data/seed-2027.js + data/rotoid.js and checks:
//   1. coverage: pool players with a direct /mlb/{slug}/{id}/news link (printed; --expect N/M asserts);
//   2. every matched row of the harvest csv still in the pool resolves to exactly its source_url;
//   3. every row of the unresolved csv stays on the generic player-news fallback (no auto-pick);
//   4. no ROTOID key is reached by two pool players (a knorm collision needs a seed rwId/rwSlug);
//   5. every ROTOID / seed rw id is numeric or UUID-style, every slug is lower-case-hyphen;
//   6. no ROTOID entry stored at --base (default f8aca68, live main) was changed or dropped;
//   7. index.html loads data/rotoid.js with ?v=APP_VER;
//   8. the 11/28 fixes (Jacob Wilson 242595, Julio Rodriguez 48480, Jose Ramirez 48521);
//   9. no seed rwId disagrees with ROTOID (allowlist aside) and every slug matches its player's name.
//   node tools/test-rotoworld-links.mjs [--expect 616/713] [--base <rev>]
//        [--csv reports/rotoid_harvest_2026-11-20.csv] [--unresolved reports/rotoworld_unresolved_2026-11-20.csv]
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import { execFileSync } from 'child_process';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const argv = process.argv.slice(2);
const arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const EXPECT = arg('--expect', '');
const BASE = arg('--base', 'f8aca68');
const CSV = arg('--csv', 'reports/rotoid_harvest_2026-11-20.csv');
const UNRES = arg('--unresolved', 'reports/rotoworld_unresolved_2026-11-20.csv');

let fails = 0;
const ok = (c, msg, extra = '') => { if(!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${msg}${extra ? '  — ' + extra : ''}`); };
const readCsv = f => { const [hd, ...rows] = fs.readFileSync(path.join(ROOT, f), 'utf8').trim().split('\n').map(l => l.split(','));
  return rows.map(r => Object.fromEntries(hd.map((h, i) => [h, r[i] ?? '']))); };

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const fn = name => (html.match(new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`)) || [''])[0];
const ctx = vm.createContext({});
for(const f of ['seed-2027.js', 'rotoid.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'), ctx, { filename: f });
ok(!!fn('knorm') && !!fn('rotoUrl'), 'index.html: knorm() and rotoUrl() found');
vm.runInContext(`${fn('knorm')}\n${fn('rotoUrl')}\nglobalThis.__k = knorm; globalThis.__r = rotoUrl; globalThis.__S = SEED2026; globalThis.__R = ROTOID;`, ctx);
const knorm = ctx.__k, rotoUrl = ctx.__r, P = ctx.__S.players, RO = ctx.__R;
const byId = Object.fromEntries(P.map(p => [p.id, p]));

/* 1 */
const direct = P.filter(p => rotoUrl(p).direct);
const viaRw = P.filter(p => p.rwId && p.rwSlug).length;
console.log(`coverage: ${direct.length} / ${P.length} direct (${viaRw} seed rwId/rwSlug, ${direct.length - viaRw} ROTOID); ROTOID ${Object.keys(RO).length} keys; ${P.length - direct.length} on the generic fallback`);
if(EXPECT){ const [a, b] = EXPECT.split('/').map(Number); ok(direct.length === a && P.length === b, `coverage ${direct.length}/${P.length} = expected ${EXPECT}`); }

/* 2 */
const rows = readCsv(CSV), matched = rows.filter(r => r.id), inPool = matched.filter(r => byId[r.pool_id]);
const wrong = inPool.filter(r => rotoUrl(byId[r.pool_id]).url !== r.source_url);
ok(wrong.length === 0, `${CSV}: ${inPool.length}/${matched.length} matched rows in the pool, each resolves to its source_url`, wrong.slice(0, 5).map(r => r.name).join(', '));
ok(matched.every(r => r.source_url === `https://www.nbcsports.com/mlb/${r.slug}/${r.id}/news`), `${CSV}: source_url = /mlb/{slug}/{id}/news on every matched row`);

/* 3 */
const unres = readCsv(UNRES), stillPool = unres.filter(r => byId[r.pool_id]);
const picked = stillPool.filter(r => rotoUrl(byId[r.pool_id]).direct);
ok(picked.length === 0, `${UNRES}: ${stillPool.length} unresolved rows all stay on the generic fallback (none auto-picked)`, picked.map(r => r.name).join(', '));
ok(new Set(unres.map(r => r.pool_id)).size === unres.length && unres.every(r => !matched.some(m => m.pool_id === r.pool_id)), `${UNRES}: no duplicate ids, disjoint from the matched rows`);

/* 4 */
const keyUsers = {};
for(const p of P) if(!(p.rwId && p.rwSlug) && RO[knorm(p.name)]) (keyUsers[knorm(p.name)] ??= []).push(`${p.name} ${p.team}`);
const shared = Object.entries(keyUsers).filter(([, v]) => v.length > 1);
ok(shared.length === 0, 'no ROTOID key reached by two pool players (knorm collisions need a seed rwId/rwSlug override)', shared.map(([k, v]) => `${k}: ${v.join(' / ')}`).join('; '));

/* 5 */
const ID_RE = /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/, SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const bad = Object.entries(RO).filter(([, v]) => !Array.isArray(v) || v.length !== 2 || !SLUG_RE.test(v[0]) || !ID_RE.test(String(v[1])))
  .concat(P.filter(p => p.rwId && p.rwSlug && (!SLUG_RE.test(p.rwSlug) || !ID_RE.test(String(p.rwId)))).map(p => [p.name]));
const uuids = Object.values(RO).filter(v => String(v[1]).includes('-')).length;
ok(bad.length === 0, `ids numeric or UUID, slugs lower-case-hyphen (ROTOID: ${Object.keys(RO).length - uuids} numeric, ${uuids} UUID)`, bad.slice(0, 5).map(b => b[0]).join(', '));

/* 6 */
const baseSrc = execFileSync('git', ['-C', ROOT, 'show', `${BASE}:data/rotoid.js`], { encoding: 'utf8' });
const bctx = vm.createContext({}); vm.runInContext(baseSrc + '\nglobalThis.__R = ROTOID;', bctx);
const B = bctx.__R, changed = Object.keys(B).filter(k => JSON.stringify(B[k]) !== JSON.stringify(RO[k]));
ok(changed.length === 0, `all ${Object.keys(B).length} ROTOID entries stored at ${BASE} unchanged (never overwrite)`, changed.slice(0, 5).join(', '));
console.log(`ROTOID: ${Object.keys(B).length} at ${BASE} -> ${Object.keys(RO).length} now (+${Object.keys(RO).length - Object.keys(B).length})`);

/* 7 */
const APP_VER = (html.match(/const APP_VER = '([^']+)'/) || [])[1];
ok(html.includes(`src="data/rotoid.js?v=${APP_VER}"`), `index.html loads data/rotoid.js?v=${APP_VER}`);

/* 8 (2026-11-28, spec topps-back-spec-2026-11-28.md section 6): seed rwId/rwSlug that pointed at a
   different player with the same name. Each resolves to the nbcsports page Eno checked on 11/28. */
const FIX_1128 = { pe5cfedf: ['Jacob Wilson', 'https://www.nbcsports.com/mlb/jacob-wilson/242595/news'],
                   p9ccea09: ['Julio Rodriguez', 'https://www.nbcsports.com/mlb/julio-rodriguez/48480/news'],
                   p7f1b103: ['Jose Ramirez', 'https://www.nbcsports.com/mlb/jose-ramirez/48521/news'] };
for(const [id, [name, url]] of Object.entries(FIX_1128)){
  const p = byId[id], u = p && rotoUrl(p);
  ok(!!p && p.name === name && u.direct && u.url === url, `${name} (${id}) -> ${url}`, u ? u.url : 'not in pool');
}
/* 9: mismatch guards. (a) A seed rwId that disagrees with ROTOID for the same name fails unless
   allowlisted (the harvest checked those pages). (b) Every direct link's slug must match the pool
   player's own name (knorm of the slug = knorm of the name), so a link to another player fails. */
const RW_ALLOW = new Set([
  'p7e9ee51',   // Kazuma Okamoto: seed UUID page checked 11/28 (Blue Jays news); ROTOID has no other id
  'p4cdd205',   // Roman Anthony: seed UUID page checked 11/28 (Red Sox news)
]);
const disagree = P.filter(p => p.rwId && p.rwSlug && RO[knorm(p.name)] && String(RO[knorm(p.name)][1]) !== String(p.rwId) && !RW_ALLOW.has(p.id));
ok(disagree.length === 0, 'no seed rwId disagrees with ROTOID for the same player (outside the allowlist)', disagree.map(p => `${p.name} ${p.id} seed ${p.rwId} vs ROTOID ${RO[knorm(p.name)][1]}`).join('; '));
// Nickname slugs Rotoworld itself uses (page checked: same player).
const SLUG_ALIAS = { 'Louis Varland': 'louie-varland', 'Jacob Latz': 'jake-latz' };
const slugName = P.filter(p => rotoUrl(p).direct).filter(p => {
  const slug = rotoUrl(p).url.split('/')[4];
  if(SLUG_ALIAS[p.name] === slug) return false;
  return knorm(slug.replace(/-/g, ' ')) !== knorm(p.name);
});
ok(slugName.length === 0, `every direct Rotoworld slug matches its pool player's name (${direct.length} links)`, slugName.slice(0, 8).map(p => `${p.name} -> ${rotoUrl(p).url.split('/')[4]}`).join('; '));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
