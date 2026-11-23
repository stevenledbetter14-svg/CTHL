#!/usr/bin/env node
// Multi-position eligibility grid (spec zuck_eligibility_table_spec.md section 5).
// Headless Chrome, ?room=local, Firebase failed as offline, 0 console errors.
// APP_VER is read from index.html. node tools/test-elig-table.mjs
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
const eligSrc = fs.readFileSync(path.join(ROOT, 'data/elig-2027.js'), 'utf8');
const APP_VER = (html.match(/const APP_VER = '([^']+)'/) || [])[1];
ok(!!APP_VER, `APP_VER read from index.html (${APP_VER})`);
const tags = [...html.matchAll(/<script src="(data\/[^"]+)"><\/script>/g)].map(m => m[1]);
ok(tags.includes(`data/elig-2027.js?v=${APP_VER}`), 'elig-2027.js script tag ?v= equals APP_VER', tags.join(' '));
ok(html.includes(`'elig-2027.js': typeof ELIG2027 !== 'undefined'`), 'data-file guard lists elig-2027.js');
ok(!/\$/.test(eligSrc) && !/\baav\b/i.test(eligSrc) && !/keeper/i.test(eligSrc), 'elig-2027.js source has no $ and no aav/keeper price fields');

let hide = null;
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if(p === '/favicon.ico'){ r.writeHead(204); r.end(); return; }
  const f = path.join(ROOT, path.normalize(p === '/' ? '/index.html' : p));
  if(!f.startsWith(ROOT) || !fs.existsSync(f) || (hide && p === '/data/' + hide)){ r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(fs.readFileSync(f));
}).listen(0);
const PORT = 9970 + Math.floor(Math.random() * 20);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/elig-${Date.now()}`, 'about:blank'], { stdio: 'ignore' });
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
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if(r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500)); return r.result.result.value; };
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

const meta = await ev(`({source: ELIG2027.meta.source, pulled: ELIG2027.meta.pulled, rice: ELIG2027.players.p988af3f, multi: Object.values(ELIG2027.players).filter(p=>p.multi===true).length})`);
ok(meta.source && meta.pulled, 'ELIG2027.meta.source and meta.pulled are non-empty', JSON.stringify(meta));
ok(meta.rice && meta.rice.g.C === 0 && meta.rice.g['1B'] === 56 && meta.rice.g.DH === 95 && meta.rice.elig === '1B/CI' && meta.rice.multi === false,
  'Ben Rice: C 0, 1B 56, DH 95, elig 1B/CI, multi false', JSON.stringify(meta.rice));

const grid = await ev(`(()=>{
  show('draft');
  const nav=[...document.querySelectorAll('nav button')].map(b=>b.textContent);
  const pos=[...document.querySelectorAll('#poolPos button')];
  const multi=pos.find(b=>/Multi-Pos|Multi-Position/.test(b.textContent));
  const top=pos.find(b=>/Top Prospects/.test(b.textContent));
  if(multi) multi.click();
  const box=document.getElementById('eligGrid');
  const row=id=>{ const tr=document.querySelector('#eligTable tr[data-id="'+id+'"]'); if(!tr) return null;
    const cells={}; tr.querySelectorAll('[data-pos]').forEach(td=>{ cells[td.dataset.pos]={t:td.textContent, q:td.dataset.q==='1', cls:td.className}; });
    return {name:tr.querySelector('td.pl').textContent, elig:tr.querySelector('[data-elig]').textContent, title:tr.getAttribute('title')||'', cells}; };
  const names=[...document.querySelectorAll('#eligTable tbody tr')].map(tr=>tr.querySelector('td.pl').textContent.replace(/†/g,'').trim());
  const txt=box.innerText;
  return {nav, hasMulti:!!multi, hasTop:!!top, topTitle:top&&top.title, open:!box.hidden && !!document.getElementById('eligTable'),
    n:document.querySelectorAll('#eligTable tbody tr').length, names, txt,
    jac:row('p87322e2'), rice:!!document.querySelector('#eligTable tr[data-id="p988af3f"]'),
    cab:row('pe7a4630'), gelof:row('pbd6b881'), romy:row('p2e05319'),
    perez:row('pf373ca5'), bauers:row('pbd7c94a'), shawn:row('pf938a7d')};
})()`);
ok(!grid.nav.some(t => /Multi-Pos|Multi-Position/.test(t)), 'no Multi-Pos nav tab', grid.nav.join(' | '));
ok(grid.hasMulti && grid.open && grid.hasTop && grid.topTitle === 'Show only top prospects', 'Multi-Pos button on Projections opens the grid; ★ Top Prospects remains', JSON.stringify({hasMulti:grid.hasMulti, open:grid.open, hasTop:grid.hasTop}));
ok(!grid.rice, 'Ben Rice is not on the default grid');
ok(grid.n === meta.multi && grid.n === 39, `default row count equals multi===true (${grid.n})`);
const sorted = [...grid.names].sort((a,b)=>a.localeCompare(b));
ok(JSON.stringify(grid.names) === JSON.stringify(sorted), 'default sort is name A–Z', grid.names.slice(0, 4).join(', '));

const cell = (row, pos) => row && row.cells[pos];
const checked = (c, n) => c && c.q && /✓/.test(c.t) && (c.t.match(/\d+/g) || []).includes(String(n));
ok(grid.jac && checked(cell(grid.jac,'1B'),39) && checked(cell(grid.jac,'OF'),95) && grid.jac.elig==='1B/CI/OF',
  'Jac Caglianone: ✓ 39 1B, ✓ 95 OF, elig 1B/CI/OF', JSON.stringify(grid.jac));
ok(grid.cab && checked(cell(grid.cab,'2B'),23) && checked(cell(grid.cab,'3B'),37) && checked(cell(grid.cab,'SS'),70) && checked(cell(grid.cab,'OF'),24),
  'Jose Caballero: ✓ 23 2B, ✓ 37 3B, ✓ 70 SS, ✓ 24 OF', JSON.stringify(grid.cab&&grid.cab.cells));
ok(grid.gelof && cell(grid.gelof,'2B') && !cell(grid.gelof,'2B').q && !/✓/.test(cell(grid.gelof,'2B').t) && /^19$/.test(cell(grid.gelof,'2B').t.trim())
  && checked(cell(grid.gelof,'3B'),70) && checked(cell(grid.gelof,'OF'),37) && grid.gelof.elig==='3B/CI/OF',
  'Zack Gelof: 19 at 2B with no check, ✓ 70 3B, ✓ 37 OF, elig 3B/CI/OF', JSON.stringify(grid.gelof));
ok(grid.perez && checked(cell(grid.perez,'C'),44) && checked(cell(grid.perez,'1B'),25) && grid.perez.elig==='C/1B/CI',
  'Salvador Perez: ✓ 44 C, ✓ 25 1B, elig C/1B/CI', JSON.stringify(grid.perez&&grid.perez.elig));
ok(grid.bauers && checked(cell(grid.bauers,'1B'),119) && checked(cell(grid.bauers,'OF'),48) && grid.bauers.elig==='1B/CI/OF',
  'Jake Bauers: ✓ 119 1B, ✓ 48 OF, elig 1B/CI/OF', JSON.stringify(grid.bauers&&grid.bauers.elig));
const fb = r => r && /†|most games/.test(r.name+' '+r.title) && checked(cell(r,'1B'), r===grid.shawn?1:5);
ok(grid.romy && checked(cell(grid.romy,'1B'),5) && checked(cell(grid.romy,'2B'),5) && /†|most games/.test(grid.romy.name+' '+grid.romy.title) && grid.romy.elig==='1B/2B/MI/CI',
  'Romy Gonzalez: ✓ 5 1B, ✓ 5 2B, fallback marker, elig 1B/2B/MI/CI', JSON.stringify(grid.romy));
ok(grid.shawn && checked(cell(grid.shawn,'C'),1) && checked(cell(grid.shawn,'1B'),1) && /†|most games/.test(grid.shawn.name+' '+grid.shawn.title) && grid.shawn.elig==='C/1B/CI',
  'Shawn Ross: ✓ 1 C, ✓ 1 1B, fallback marker, elig C/1B/CI', JSON.stringify(grid.shawn));

const filt = await ev(`(()=>{
  const btn=lab=>[...document.querySelectorAll('#eligFilters button')].find(b=>b.textContent.trim()===lab);
  btn('2B').click();
  const ids=[...document.querySelectorAll('#eligTable tbody tr')].map(tr=>tr.dataset.id);
  const n2=ids.length;
  btn('All').click();
  const nAll=document.querySelectorAll('#eligTable tbody tr').length;
  const txt=document.getElementById('eligGrid').innerText;
  return {n2, nAll, hasJac:ids.includes('p87322e2'), hasCab:ids.includes('pe7a4630'), txt,
    ci:!![...document.querySelectorAll('#eligFilters button')].find(b=>b.textContent.trim()==='CI'||b.textContent.trim()==='MI')};
})()`);
ok(filt.n2 < filt.nAll && !filt.hasJac && filt.hasCab && filt.nAll === meta.multi && !filt.ci,
  '2B filter hides Caglianone, keeps Caballero; All restores the multi list; no CI/MI filter', JSON.stringify({n2:filt.n2, nAll:filt.nAll, hasJac:filt.hasJac, hasCab:filt.hasCab}));
ok(filt.txt.includes('CBS eligibility overrides') && filt.txt.includes('once CBS rolls over to 2027') && filt.txt.includes(meta.pulled),
  'CBS-override sentence and pull date are visible', meta.pulled);
ok(!/\$/.test(filt.txt) && !/Provisional|Top 100|\bPR\s?\d+/i.test(filt.txt),
  'grid text has no $ and no Provisional / Top 100 / PR+digits', (filt.txt.match(/\$|Provisional|Top 100|PR\s?\d+/i)||[])[0]);
ok(errs.length === 0, '0 console errors after the grid clicks', errs.slice(0, 3).join(' | '));

hide = 'elig-2027.js'; errs = [];
await load();
const df = await ev(`typeof DATA_FAIL==='string' ? DATA_FAIL : ''`).catch(() => '');
ok(/data\/elig-2027\.js did not load/.test(df), 'guard: missing data/elig-2027.js stops the app and names the file', df.slice(0, 160));
hide = null;

ws.close(); chrome.kill(); srv.close();
console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
process.exit(fails ? 1 : 0);
