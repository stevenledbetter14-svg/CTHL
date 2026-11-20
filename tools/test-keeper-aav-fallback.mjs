#!/usr/bin/env node
// Keeper-AAV fallback (11/20 package 3.6, cherry-pick of 658b277; Steven released the hold
// 2026-11-20 12:21 PM ET). A keeper-list player who is NOT kept shows his keeper-list curve
// AAV k (data/aav-2027.js) in the pool AAV column and the card box, instead of "—".
// Display only: k never enters the pot / inflation / budget math.
// Headless Chrome over http, room=local, every Firebase call failed as offline. Checks:
//   1. source: aav27Shown() is used only by aav27CellHTML() and openPick(); inflationFactors(),
//      fullPoolVal(), maxBid(), renderMeter(), renderMoney() never read AAV_2027 / aavOf / aav27*;
//   2. Junior Caminero (pabd0d7f, kept $32, AAV_2027 {k:56}, no a): kept -> lock + salary;
//      un-kept -> pool cell and card box show $56 (cell titled "Display only"), not "—".
//      Walker Jenkins left the keeper list on 11/20 and is now a regular {a:8}, so he is
//      the priced control in check 3, not the fallback subject.
//   3. a priced non-keeper (Walker Jenkins, {a:8}) still shows a, no curve title;
//   4. display-only: with Caminero un-kept, inflationFactors(), every team's maxBid(), every
//      p.val, #meter, #moneyBoard, #moneyFoot are identical before and after every AAV_2027 k
//      is set to 999, while the pool cell follows k ($999);
//   5. 0 console errors.
//   node tools/test-keeper-aav-fallback.mjs
import { spawn } from 'child_process';
import fs from 'fs'; import http from 'http'; import path from 'path';
import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const WebSocket = require('ws');

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const JENKINS = 'p6377140', CAMINERO = 'pabd0d7f';
let fails = 0;
const ok = (c, msg, extra = '') => { if(!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${msg}${extra ? '  — ' + extra : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- 1. source ---- */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const fnSrc = name => (html.match(new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`)) || [''])[0];
const uses = [...html.matchAll(/(?<!function )aav27Shown\(/g)].map(m => { const before = html.slice(0, m.index); return (before.match(/function (\w+)\([^)]*\)\{(?![\s\S]*\nfunction )/) || [])[1]; });
ok(uses.length === 3 && uses.filter(u => u === 'openPick').length === 2 && uses.includes('aav27CellHTML') && (html.match(/function aav27Shown\(p\)/g) || []).length === 1,
  'aav27Shown() defined once, used only by openPick() (card box) and aav27CellHTML() (pool column)', uses.join(', '));
const MATH = ['inflationFactors', 'fullPoolVal', 'maxBid', 'renderMeter', 'renderMoney'];
const leak = MATH.filter(f => !fnSrc(f) || /AAV_2027|aavOf|aav27/.test(fnSrc(f)));
ok(leak.length === 0, `pot / inflation / budget code (${MATH.join(', ')}) never reads AAV_2027, aavOf or aav27*`, leak.join(', '));

let hide = null;
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if(p === '/favicon.ico'){ r.writeHead(204); r.end(); return; }
  const f = path.join(ROOT, path.normalize(p === '/' ? '/index.html' : p));
  if(!f.startsWith(ROOT) || !fs.existsSync(f) || (hide && p === '/data/' + hide)){ r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(fs.readFileSync(f));
}).listen(0);
const PORT = 9950 + Math.floor(Math.random() * 40);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/keeper-aav-${Date.now()}`, 'about:blank'], { stdio: 'ignore' });
let pages; for(let i = 0; i < 60; i++){ try{ pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if(pages.find(t => t.type === 'page')) break; }catch(e){} await sleep(200); }
const ws = new WebSocket(pages.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.on('open', r));
let id = 0; const pend = {}; let errs = [];
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
ws.on('message', m => { const d = JSON.parse(m);
  if(d.id && pend[d.id]){ pend[d.id](d); delete pend[d.id]; }
  if(d.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  if(d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push('console.error ' + d.params.args.map(a => a.value || a.description).join(' '));
  if(d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errs.push('log ' + d.params.entry.text);
  if(d.method === 'Fetch.requestPaused'){
    if(/firebaseio\.com/.test(d.params.request.url)) send('Fetch.failRequest', { requestId: d.params.requestId, errorReason: 'InternetDisconnected' });
    else send('Fetch.continueRequest', { requestId: d.params.requestId });
  }
});
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if(r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
const load = async () => {
  await send('Page.navigate', { url: `http://127.0.0.1:${srv.address().port}/index.html?room=local` });
  for(let i = 0; i < 40; i++){ await sleep(200); if(await ev(`document.readyState==='complete'`).catch(() => false)) break; }
  await sleep(1500);
};
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await load();
ok(await ev(`typeof S!=='undefined' && S.players.length>600 && DATA_FAIL===''`), 'app loads (room=local)');
ok(errs.length === 0, '0 console errors on load', errs.slice(0, 3).join(' | '));

/* ---- 2 + 3. Caminero kept / un-kept, Jenkins priced ---- */
const view = id => ev(`(()=>{ const p=S.players.find(x=>x.id===${JSON.stringify(id)}); openPick(p.id);
  const ab=document.getElementById('dlgAav'); const r={cell:aav27CellHTML(p), box:ab.textContent, label:ab.previousElementSibling.textContent, kept:!!(p.pick&&p.pick.keeper)};
  document.getElementById('pickDlg').close(); return r; })()`);
const k0 = await view(CAMINERO);
ok(k0.kept && /🔒 \$32/.test(k0.cell) && /Ranked by AAV \$56/.test(k0.cell) && /\$32/.test(k0.box) && k0.label === 'Keeper', 'Caminero kept: lock + $32 salary, ranked by AAV $56', JSON.stringify(k0));
ok(await ev(`JSON.stringify(AAV_2027[${JSON.stringify(CAMINERO)}])`) === '{"k":56}', 'Caminero AAV_2027 = {k:56} (curve price, no auction a)');
ok(await ev(`JSON.stringify(AAV_2027[${JSON.stringify(JENKINS)}])`) === '{"a":8}', 'Jenkins AAV_2027 = {a:8} (regular non-keeper, not a k fallback)');
const before = await ev(`JSON.stringify(inflationFactors())`);
await ev(`removePick(${JSON.stringify(CAMINERO)})`);
const k1 = await view(CAMINERO);
ok(!k1.kept && k1.cell === '<b title="Keeper-list curve AAV (not kept). Display only: not in the pot until the next AAV run.">$56</b>', 'Caminero un-kept: pool column shows $56 (curve k), titled display-only — not "—"', k1.cell);
ok(k1.box === '$56' && k1.label === 'CTHL AAV 2027', 'Caminero un-kept: card box shows CTHL AAV 2027 $56', JSON.stringify(k1));
ok(await ev(`JSON.stringify(inflationFactors())`) !== before, 'un-keeping moves inflation through the keeper salary / p.val only (expected)');
const c = await view(JENKINS);
ok(c.cell === '<b>$8</b>' && c.box === '$8' && c.label === 'CTHL AAV 2027', 'Jenkins (priced a=8, not kept): $8 in both, no curve title', JSON.stringify(c));
const ghost = await ev(`(()=>{ const out=[]; for(const p of S.players){ const a=AAV_2027[p.id]; if(a || p.pick) continue; if(aav27CellHTML(p)!=='—') out.push(p.name); } return out; })()`);
ok(ghost.length === 0, 'players with no AAV_2027 entry still show "—"', ghost.slice(0, 5).join(', '));

/* ---- 4. display only ---- */
const snap = () => ev(`(()=>{ renderAll(); return JSON.stringify({inf:inflationFactors(), mb:S.settings.teams.map(t=>maxBid(t)), val:S.players.map(p=>p.val),
  meter:document.getElementById('meter').innerHTML, money:document.getElementById('moneyBoard').innerHTML, foot:document.getElementById('moneyFoot').innerHTML}); })()`);
const s0 = await snap();
const nk = await ev(`(()=>{ let n=0; for(const id in AAV_2027) if(AAV_2027[id].k!=null){ AAV_2027[id].k=999; n++; } return n; })()`);
const s1 = await snap();
ok(nk === 48 && s0 === s1, `all ${nk} keeper k set to 999: inflation, every maxBid, every p.val, meter and money board unchanged`, s0 === s1 ? '' : 'snapshot differs');
const k2 = await view(CAMINERO);
ok(/>\$999<\/b>$/.test(k2.cell) && k2.box === '$999', 'the pool cell and card box follow k ($999): k is display only', JSON.stringify(k2));

ok(errs.length === 0, '0 console errors after all checks', errs.slice(0, 3).join(' | '));
ws.close(); chrome.kill(); srv.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
