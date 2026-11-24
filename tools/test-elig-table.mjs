#!/usr/bin/env node
// Projections tab after the Multi-Pos grid was removed (2026-11-24).
// Headless Chrome, ?room=local, Firebase failed as offline.
// data/elig-2027.js stays in the repo and still parses; the app does not load it.
//   node tools/test-elig-table.mjs
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
const eligPath = path.join(ROOT, 'data/elig-2027.js');
ok(fs.existsSync(eligPath), 'data/elig-2027.js still exists');
let parsed = null;
try { parsed = new Function(fs.readFileSync(eligPath, 'utf8') + '\nreturn ELIG2027;')(); }
catch(e) { ok(false, 'data/elig-2027.js parses', e.message); }
ok(!!parsed && parsed.players && Object.keys(parsed.players).length > 0 && parsed.meta && parsed.meta.source,
  'data/elig-2027.js parses (players + meta)', parsed ? `${Object.keys(parsed.players).length} players` : 'no value');
const tags = [...html.matchAll(/<script src="(data\/[^"]+)"><\/script>/g)].map(m => m[1]);
ok(!tags.some(t => t.includes('elig-2027.js')) && !html.includes('elig-2027.js') && !html.includes('ELIG2027'),
  'no elig-2027.js script tag and no ELIG2027 in index.html', tags.join(' '));
ok(!html.includes('id="eligGrid"') && !html.includes('eligGrid') && !html.includes('renderEligGrid') && !html.includes('poolMulti'),
  'no #eligGrid, renderEligGrid, or poolMulti in index.html');
ok(!/Multi-Pos|Multi-Position|toggleMultiPos/.test(html), 'no Multi-Pos button in index.html');

const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if(p === '/favicon.ico'){ r.writeHead(204); r.end(); return; }
  const f = path.join(ROOT, path.normalize(p === '/' ? '/index.html' : p));
  if(!f.startsWith(ROOT) || !fs.existsSync(f)){ r.writeHead(404); r.end(); return; }
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
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:${srv.address().port}/index.html?room=local` });
for(let i = 0; i < 40; i++){ await sleep(200); if(await ev(`document.readyState==='complete'`).catch(() => false)) break; }
await sleep(1500);
ok(await ev(`typeof S!=='undefined' && S.players.length>600 && DATA_FAIL===''`), 'app loads (room=local)');
ok(errs.length === 0, '0 console errors on load', errs.slice(0, 3).join(' | '));

const grid = await ev(`(()=>{
  show('draft');
  const pos=[...document.querySelectorAll('#poolPos button')].map(b=>b.textContent.trim());
  const nav=[...document.querySelectorAll('nav button')].map(b=>b.textContent.trim());
  const tbl=document.getElementById('poolTable');
  const scroll=document.getElementById('poolScroll');
  return {
    pos, nav,
    hasGrid:!!document.getElementById('eligGrid'),
    rows: tbl ? tbl.querySelectorAll('tbody tr').length : 0,
    heads: tbl ? [...tbl.querySelectorAll('thead th')].map(th=>th.textContent.replace(/[▲▼]/g,'').trim()) : [],
    scrollHidden: !!(scroll && scroll.hidden),
    visible: !!(tbl && tbl.getClientRects().length)
  };
})()`);
ok(!grid.hasGrid && !grid.pos.some(t => /Multi-Pos|Multi-Position/.test(t)) && !grid.nav.some(t => /Multi-Pos|Multi-Position/.test(t)),
  'no Multi-Pos button and no #eligGrid', JSON.stringify({pos:grid.pos, nav:grid.nav, hasGrid:grid.hasGrid}));
ok(grid.pos.includes('★ Top Prospects') && grid.rows > 100 && grid.heads.includes('Player') && grid.heads.includes('AAV') && !grid.scrollHidden && grid.visible,
  'Projections table renders', JSON.stringify({rows:grid.rows, heads:grid.heads, scrollHidden:grid.scrollHidden, visible:grid.visible}));
ok(errs.length === 0, '0 console errors after opening Projections', errs.slice(0, 3).join(' | '));

ws.close(); chrome.kill(); srv.close();
console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
process.exit(fails ? 1 : 0);
