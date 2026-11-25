#!/usr/bin/env node
// CBS 2027 eligibility is what the app shows. Headless Chrome, file:// ?room=local,
// Firebase failed as offline. Checks:
//   1. every Draft-List hitter: seed elig == data/elig-2027.js elig when that
//      string is non-empty (an empty backup keeps the seed);
//   2. Brent Rooker shows DH on Projections, on the card front, in the card-back
//      banner ("BRENT ROOKER • DH"), and his Draft List section is DH;
//   3. 0 console errors.
//   node tools/test-cbs-elig.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const WebSocket = require('ws');

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const AL = new Set('BAL,BOS,CHW,CLE,DET,HOU,KCR,LAA,MIN,NYY,ATH,OAK,SEA,TBR,TEX,TOR'.split(','));
let fails = 0;
const ok = (c, msg, extra = '') => { if(!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${msg}${extra ? '  — ' + extra : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadConst(file, name){
  return new Function(fs.readFileSync(path.join(ROOT, file), 'utf8') + `\nreturn ${name};`)();
}
function loadOverrides(){
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/const POOL_OVERRIDES = (\{[\s\S]*?\});\n\/\* ================= END POOL OVERRIDES/);
  if(!m) throw new Error('no POOL_OVERRIDES');
  return JSON.parse(m[1].replace(/\/\/.*$/gm, ''));
}
const SEED = loadConst('data/seed-2027.js', 'SEED2026');
const ELIG = loadConst('data/elig-2027.js', 'ELIG2027').players;
const ov = loadOverrides();
const teamOv = ov.team || {};
function poolStatus(id){
  const st = (ov.status || {})[id];
  if(!st) return null;
  const t = teamOv[id];
  if(t && AL.has(String(t).toUpperCase())) return null;
  return String(st);
}
const draft = SEED.players.filter(p => {
  if(p.kind !== 'H') return false;
  const team = teamOv[p.id] || p.team;
  return !poolStatus(p.id) && AL.has(team);
});
const missing = draft.filter(p => !ELIG[p.id]);
ok(missing.length === 0, `elig-2027.js covers every Draft-List hitter (${draft.length})`, missing.map(p => p.name).join(', '));
const mismatch = draft.filter(p => ELIG[p.id] && ELIG[p.id].elig && ELIG[p.id].elig !== (p.elig || ''));
ok(mismatch.length === 0, 'seed elig == elig-2027.js elig when the backup is non-empty', mismatch.slice(0, 5).map(p => `${p.name} seed ${p.elig} file ${ELIG[p.id] && ELIG[p.id].elig}`).join('; '));
const rook = SEED.players.find(p => p.id === 'pd3bf6d0');
ok(rook && rook.name === 'Brent Rooker' && rook.elig === 'DH' && ELIG.pd3bf6d0.elig === 'DH', 'seed and elig-2027.js both have Brent Rooker at DH', rook && rook.elig);

const PORT = 9940 + Math.floor(Math.random() * 20);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/cbs-elig-${Date.now()}`, 'about:blank'], { stdio: 'ignore' });
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
const url = 'file://' + path.join(ROOT, 'index.html') + '?room=local';
await send('Page.navigate', { url });
for(let i = 0; i < 40; i++){ await sleep(200); if(await ev(`document.readyState==='complete'`).catch(() => false)) break; }
await sleep(1500);
ok(await ev(`typeof S!=='undefined' && S.players.length>600 && DATA_FAIL===''`), 'app loads (file:// ?room=local)', url);
ok(errs.length === 0, '0 console errors on load', errs.slice(0, 3).join(' | '));

const view = await ev(`(()=>{
  const p = S.players.find(x => x.id === 'pd3bf6d0');
  show('draft');
  $('search').value = 'Rooker';
  $('hideDrafted').checked = false;
  renderPool();
  const tr = [...document.querySelectorAll('#poolTable tr')].find(r => (r.querySelector('.nm')||{}).textContent === 'Brent Rooker');
  const sub = tr ? tr.querySelector('.sub').textContent : '';
  openPick(p.id);
  fitCardBanner();
  const front = document.getElementById('dlgSub').textContent;
  const banner = document.getElementById('cbName').textContent;
  show('list');
  dlSet('ATH');
  const row = document.querySelector('#dlSheet [data-pid="pd3bf6d0"]');
  const sec = row ? row.closest('.dlsec').querySelector('.dlhead .dlnm').textContent : '';
  return {
    elig: p.elig,
    disp: dispElig(p),
    section: dlSection(p),
    sub, front, banner, sec,
    active: document.querySelector('.view.active').id
  };
})()`);
ok(view.elig === 'DH' && view.disp === 'DH', 'Rooker elig and dispElig are DH', JSON.stringify(view));
ok(view.sub === 'ATH · DH', 'Projections cell shows ATH · DH', view.sub);
ok(view.front === 'ATH · DH', 'card front shows ATH · DH', view.front);
ok(view.banner === 'BRENT ROOKER • DH', 'card-back banner is BRENT ROOKER • DH', view.banner);
ok(view.section === 'DH' && view.sec === 'DH', 'Draft List section is DH', JSON.stringify({ section: view.section, sec: view.sec }));
ok(errs.length === 0, '0 console errors after Projections, card, and Draft List', errs.slice(0, 3).join(' | '));

ws.close(); chrome.kill();
console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
process.exit(fails ? 1 : 0);
