#!/usr/bin/env node
// Two ways a current-version board can be missing McGonigle and Caminero.
// (a) localStorage 'cthl-auction' stamped seedVer 2027-actuals.12 and bakedSet
//     2027-keeperval.4, seed keepers minus those two (46). load() → migrate()
//     must call fillMissingBakedKeepers().
// (b) stale official-room shape: Martinez (Birdland $2) and Jenkins (Money
//     Bags $5) in, McGonigle and Caminero out. rebuildPickRefs() drops the
//     cleared names and fills the seed replacements.
// Both: 48 keepers / $512 / pot $2088, McGonigle Birdland $20, Caminero Money
// Bags $32, Martinez and Jenkins absent, 48 of 50. Never Catch Up and Dealers
// stay at 4. No Firebase writes.
// Headless Chrome, ?room=local.
//   node tools/test-stale-keepers.mjs
import { spawn } from 'child_process';
import fs from 'fs'; import http from 'http'; import path from 'path';
import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const WebSocket = require('ws');

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
let fails = 0;
const ok = (c, msg, extra = '') => { if(!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${msg}${extra ? '  — ' + extra : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(!html.includes('id="declaredKeepers"') && !/<h2>Declared keepers/.test(html), 'declared-keepers box is gone');
ok(html.includes('Eligible players (2027 Keeper List — not the declared keepers)'), 'eligible-list heading kept');
ok(/onclick="keepSort\('kv'\)">Keeper/.test(html), 'board salary column header is Keeper');

const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if(p === '/favicon.ico'){ r.writeHead(204); r.end(); return; }
  const f = path.join(ROOT, path.normalize(p === '/' ? '/index.html' : p));
  if(!f.startsWith(ROOT) || !fs.existsSync(f)){ r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(fs.readFileSync(f));
}).listen(0);
const PORT = 9960 + Math.floor(Math.random() * 30);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/stale-keepers-${Date.now()}`, 'about:blank'], { stdio: 'ignore' });
let pages; for(let i = 0; i < 60; i++){ try{ pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if(pages.find(t => t.type === 'page')) break; }catch(e){} await sleep(200); }
const ws = new WebSocket(pages.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.on('open', r));
let id = 0; const pend = {}; let errs = []; let writes = [];
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
ws.on('message', m => { const d = JSON.parse(m);
  if(d.id && pend[d.id]){ pend[d.id](d); delete pend[d.id]; }
  if(d.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  if(d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push('console.error ' + d.params.args.map(a => a.value || a.description).join(' '));
  if(d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errs.push('log ' + d.params.entry.text);
  if(d.method === 'Fetch.requestPaused'){
    const u = d.params.request.url, method = d.params.request.method || 'GET';
    if(/firebaseio\.com/.test(u)){
      if(method !== 'GET') writes.push(method + ' ' + u);
      send('Fetch.failRequest', { requestId: d.params.requestId, errorReason: 'InternetDisconnected' });
    } else send('Fetch.continueRequest', { requestId: d.params.requestId });
  }
});
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if(r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500)); return r.result.result.value; };

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
await send('Page.navigate', { url: `http://127.0.0.1:${srv.address().port}/index.html?room=local` });
for(let i = 0; i < 40; i++){ await sleep(200); if(await ev(`document.readyState==='complete'`).catch(() => false)) break; }
await sleep(1500);
ok(await ev(`typeof S!=='undefined' && S.players.length>600 && DATA_FAIL===''`), 'app loads (room=local)');

const potOf = `(()=>{ renderMoney(); const foot=(document.getElementById('moneyFoot')||{}).textContent||''; const m=foot.match(/\\$(\\d+) in the pot/); return {pot:m?Number(m[1]):null, foot}; })()`;
const shape = `
  const ks = S.picks.filter(k=>k.keeper);
  const one = id => ks.find(k=>String(k.pid)===id) || null;
  const counts = {};
  ks.forEach(k=>{ counts[k.team]=(counts[k.team]||0)+1; });
  const pot = ${potOf};
  return {
    n: ks.length,
    sum: ks.reduce((s,k)=>s+(Number(k.price)||0),0),
    pot: pot.pot,
    foot: pot.foot,
    mcg: one('p2020362'),
    cam: one('pabd0d7f'),
    mart: one('p4720771'),
    jenk: one('p6377140'),
    fill: document.getElementById('keepFillCount').textContent,
    open: {ncu: counts['Never Catch Up']||0, dealers: counts['Dealers']||0},
    canWrite: SY.canWrite,
    seedVer: S.seedVer,
    bakedSet: S.bakedSet
  };
`;
const expectBoard = (label, report) => {
  ok(report.n === 48 && report.sum === 512, `${label}: 48 keepers / $512`, `${report.n} / $${report.sum}`);
  ok(report.pot === 2088, `${label}: pot $2088`, `${report.pot} · ${report.foot}`);
  ok(report.mcg && report.mcg.team === 'Birdland' && report.mcg.price === 20, `${label}: McGonigle Birdland $20`, JSON.stringify(report.mcg));
  ok(report.cam && report.cam.team === 'Money Bags' && report.cam.price === 32, `${label}: Caminero Money Bags $32`, JSON.stringify(report.cam));
  ok(!report.mart && !report.jenk, `${label}: Martinez and Jenkins absent`);
  ok(String(report.fill).includes('48 of 50'), `${label}: keepFillCount is 48 of 50`, report.fill);
  ok(report.open.ncu === 4 && report.open.dealers === 4, `${label}: Never Catch Up and Dealers stay at 4`, JSON.stringify(report.open));
};

const local = await ev(`(()=>{
  const saved = JSON.parse(JSON.stringify(SEED2026));
  saved.seedVer = '2027-actuals.12';
  saved.bakedSet = '2027-keeperval.4';
  saved.picks = (saved.picks||[]).filter(k=>k.pid!=='p2020362' && k.pid!=='pabd0d7f');
  const before = saved.picks.filter(k=>k.keeper).length;
  localStorage.setItem('cthl-auction', JSON.stringify(saved));
  load();
  show('keepers');
  const body = (()=>{ ${shape} })();
  body.before = before;
  body.viaLoad = true;
  return body;
})()`);
ok(local.before === 46, 'localStorage save starts at 46 keepers (McGonigle and Caminero missing)', String(local.before));
ok(local.seedVer === '2027-actuals.12' && local.bakedSet === '2027-keeperval.4', 'load() kept seedVer .12 and bakedSet .4', `${local.seedVer} ${local.bakedSet}`);
expectBoard('load()', local);

const report = await ev(`(()=>{
  const seed = (SEED2026.picks||[]).filter(k=>k.keeper);
  const byId = id => seed.find(k=>k.pid===id);
  const mcg = byId('p2020362'), cam = byId('pabd0d7f');
  const stale = seed.filter(k=>k.pid!=='p2020362' && k.pid!=='pabd0d7f').map(k=>JSON.parse(JSON.stringify(k)));
  stale.push({pid:'p4720771', name:'Angel Martinez', team:'Birdland', price:2, keeper:true, t:0});
  stale.push({pid:'p6377140', name:'Walker Jenkins', team:'Money Bags', price:5, keeper:true, t:0});
  S.picks = stale;
  S.taxi = [];
  S.bakedSet = BAKED_KEEPER_SET;
  const before = S.picks.filter(k=>k.keeper).length;
  rebuildPickRefs();
  show('keepers');
  const ks = S.picks.filter(k=>k.keeper);
  const one = id => ks.find(k=>String(k.pid)===id) || null;
  const counts = {};
  ks.forEach(k=>{ counts[k.team]=(counts[k.team]||0)+1; });
  return {
    before,
    n: ks.length,
    sum: ks.reduce((s,k)=>s+(Number(k.price)||0),0),
    mcg: one('p2020362'),
    cam: one('pabd0d7f'),
    mart: one('p4720771'),
    jenk: one('p6377140'),
    seedMcg: mcg && {team:mcg.team, price:mcg.price},
    seedCam: cam && {team:cam.team, price:cam.price},
    fill: document.getElementById('keepFillCount').textContent,
    declared: !!document.getElementById('declaredKeepers'),
    heading: [...document.querySelectorAll('#view-keepers h2')].map(h=>h.childNodes[0] && h.childNodes[0].textContent.trim()),
    header: (document.querySelector('#keepBoardTable thead th.aav')||{}).textContent || '',
    open: {ncu: counts['Never Catch Up']||0, dealers: counts['Dealers']||0},
    canWrite: SY.canWrite,
    pot: (${potOf}).pot,
    foot: (${potOf}).foot
  };
})()`);

ok(report.before === 48, 'stale snapshot starts at 48 keepers (Martinez + Jenkins in, McGonigle + Caminero out)', String(report.before));
expectBoard('rebuildPickRefs()', report);
ok(!report.declared, 'no #declaredKeepers in the live DOM');
ok(report.heading.includes('Eligible players (2027 Keeper List — not the declared keepers)') && !report.heading.some(h => /Declared keepers/.test(h)), 'Keepers headings', JSON.stringify(report.heading));
ok(/^Keeper/.test(report.header), 'rendered salary header is Keeper', report.header);
ok(report.canWrite === false, 'canWrite unchanged (room=local stays view-only)', String(report.canWrite));
ok(writes.length === 0, 'no Firebase writes', writes.slice(0, 3).join(' | '));
ok(errs.length === 0, '0 console errors', errs.slice(0, 3).join(' | '));
ok(report.seedMcg && report.seedMcg.team === 'Birdland' && report.seedMcg.price === 20 && report.seedCam && report.seedCam.team === 'Money Bags' && report.seedCam.price === 32,
  'seed still has McGonigle $20 and Caminero $32 (seed file not rewritten)', JSON.stringify({seedMcg: report.seedMcg, seedCam: report.seedCam}));

ws.close(); chrome.kill(); srv.close();
process.exit(fails ? 1 : 0);
