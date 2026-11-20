#!/usr/bin/env node
// No prospect ranks + card write-ups (2026-11-20, spec zuck_2026-11-20_package.md 1.4 / 4.4).
// Headless Chrome over http, room=local, every Firebase call failed as offline. Checks:
//   1. app loads, 0 console errors; APP_VER 2026.11.20-1; seven data <script> tags, each
//      ?v=APP_VER, writeups-2027.js among them and in the data-file guard;
//   2. CARDS has no t; the app source never reads CARDS.t;
//   3. every Future Stars card (CARDS.f[id]==='f'): banner still shown, cfTag empty, and the
//      document text has no "Provisional", no "Top 100 prospect", no PR+digits badge;
//      no card at all shows any of those (whole pool);
//   4. Projections tab: no "Top Prospects" button, no "Top 100" text;
//   5. $1 prospect floor: PFLOOR is exactly the 10 names the rank rule picked on 11/18,
//      and its cell shows $1 with no rank;
//   6. write-ups: the 10 seed ids each show WRITEUPS2027[id].text exactly in #cbWriteup
//      (and, when /workspace/db2027 is present, that text is a block of the approved
//      pilot_2026-11-19.md), no CTHL $ amount, no "Provisional Top 100"; every other card's
//      slot is empty (no CARDS.w fallback); no write-up text on the Draft List tab;
//   7. guard: data/writeups-2027.js missing -> DATA_FAIL names it;
//   8. 0 console errors after all of it.
//   node tools/test-no-ranks-writeups.mjs
import { spawn } from 'child_process';
import fs from 'fs'; import http from 'http'; import path from 'path';
import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const WebSocket = require('ws');

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const PILOT = '/workspace/db2027/writeups/pilot_2026-11-19.md';
const FLOOR_IDS = ['pdc823df', 'p6587b4a', 'p6ccee2a', 'p96f7374', 'p8985064', 'p5b997e0', 'p9c8df46', 'p4da2d2a', 'p5d22ea3', 'pec92b6a'];
const WU_IDS = ['p301850c', 'p5c9bcf3', 'pabd0d7f', 'p87322e2', 'p8c74fc1', 'p7f1b103', 'pf97704', 'p9ccea09', 'p28aaca5', 'pbd68516'];
let fails = 0;
const ok = (c, msg, extra = '') => { if(!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${msg}${extra ? '  — ' + extra : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const APP_VER = (html.match(/const APP_VER = '([^']+)'/) || [])[1];
ok(APP_VER === '2026.11.20-1', `APP_VER ${APP_VER}`);
const tags = [...html.matchAll(/<script src="(data\/[^"]+)"><\/script>/g)].map(m => m[1]);
ok(tags.length === 7 && tags.every(t => t.endsWith('?v=' + APP_VER)) && tags.includes(`data/writeups-2027.js?v=${APP_VER}`),
  `seven data files, each ?v=APP_VER, writeups-2027.js included`, tags.join(' '));
ok(html.includes(`'writeups-2027.js': typeof WRITEUPS2027 !== 'undefined'`), 'data-file guard checks WRITEUPS2027');
ok(!/CARDS\.t\b/.test(html), 'index.html never reads CARDS.t');
ok(!/★ Top Prospects|toggleProspectOnly|poolProspectOnly|cardProspectRank|cardProspectTitle|prospectBadge|prospectTitle/.test(html), 'no Top Prospects filter / PR badge code left in index.html');

let hide = null;
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if(p === '/favicon.ico'){ r.writeHead(204); r.end(); return; }
  const f = path.join(ROOT, path.normalize(p === '/' ? '/index.html' : p));
  if(!f.startsWith(ROOT) || !fs.existsSync(f) || (hide && p === '/data/' + hide)){ r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(fs.readFileSync(f));
}).listen(0);
const PORT = 9950 + Math.floor(Math.random() * 40);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/no-ranks-${Date.now()}`, 'about:blank'], { stdio: 'ignore' });
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
ok(await ev(`!('t' in CARDS)`), 'CARDS has no t (provisional Top 100 rank)');

/* ---- 3. Future Stars fronts + every card ---- */
const RANK_RE = String.raw`Provisional|Top 100 prospect|\bPR\s?\d+\b`;
const fs3 = await ev(`(()=>{
  const re=new RegExp(${JSON.stringify(RANK_RE)},'i'), fsIds=Object.keys(CARDS.f).filter(k=>CARDS.f[k]==='f');
  const bad=[], any=[]; let n=0;
  for(const p of S.players){
    openPick(p.id);
    const isFs=CARDS.f[p.id]==='f', txt=document.body.innerText+' '+document.getElementById('pickDlg').innerText;
    if(re.test(txt)) any.push(p.name+': '+txt.match(re)[0]);
    if(isFs){ n++;
      const tag=document.getElementById('cfTag').textContent, ban=document.getElementById('cfBanner').textContent;
      if(tag!=='') bad.push(p.name+' cfTag "'+tag+'"');
      if(!/Future Stars/.test(ban) || !document.getElementById('cardFront').classList.contains('fs')) bad.push(p.name+' lost the Future Stars banner');
    }
    pickDlg.close();
  }
  return {fsN:fsIds.length, n, bad, any};
})()`);
ok(fs3.fsN === 51 && fs3.n === 51 && fs3.bad.length === 0, `all ${fs3.n} Future Stars cards: banner kept, cfTag empty`, fs3.bad.slice(0, 5).join(' ; '));
ok(fs3.any.length === 0, 'no card (whole pool) shows "Provisional", "Top 100 prospect" or a PR+digits badge', fs3.any.slice(0, 5).join(' ; '));

/* ---- 4. Projections tab ---- */
const proj = await ev(`(()=>{ show('draft'); renderPool();
  const v=document.getElementById('view-draft');
  return {btn:[...v.querySelectorAll('button')].filter(b=>/Top Prospects/i.test(b.textContent)).length,
          top:/Top 100|Top Prospect/i.test(v.innerText), rank:new RegExp(${JSON.stringify(RANK_RE)},'i').test(v.innerText)}; })()`);
ok(proj.btn === 0 && !proj.top && !proj.rank, 'Projections tab: no Top Prospects button, no Top 100 / PR text', JSON.stringify(proj));

/* ---- 5. $1 prospect floor ---- */
const fl = await ev(`(()=>({ids:Object.keys(PFLOOR).sort(), cells:Object.keys(PFLOOR).map(id=>{ const p=S.players.find(x=>x.id===id);
  const d=document.createElement('div'); d.innerHTML=aavCellHTML(p); return d.textContent+' | '+d.firstChild.title; })}))()`);
ok(JSON.stringify(fl.ids) === JSON.stringify([...FLOOR_IDS].sort()), `$1 prospect floor = the same 10 names as 11/18`, fl.ids.join(' '));
ok(fl.cells.every(c => /^\$1 \| /.test(c) && !/#\d|PR\s?\d|Top.?100/i.test(c)), '$1 flag shows no rank', fl.cells[0]);

/* ---- 6. write-ups ---- */
const pilot = fs.existsSync(PILOT) ? new Set([...fs.readFileSync(PILOT, 'utf8').matchAll(/\*\*.+?\*\*\n(.+)/g)].map(m => m[1].trim())) : null;
const wu = await ev(`(()=>{
  const ids=${JSON.stringify(WU_IDS)}, out=[], empty=[], fallback=[];
  for(const p of S.players){
    openPick(p.id);
    const slot=document.getElementById('cbWriteup').textContent, back=document.getElementById('cardBack').textContent;
    if(ids.includes(p.id)) out.push({id:p.id, name:p.name, slot, back, want:(WRITEUPS2027[p.id]||{}).text, ap:(WRITEUPS2027[p.id]||{}).approved_by,
      money:[p.val, p.pick&&p.pick.price, (aavOf(p)||{}).a, (aavOf(p)||{}).k].filter(x=>x>0)});
    else if(slot!==''){ empty.push(p.name); if(CARDS.w[p.id] && slot===CARDS.w[p.id]) fallback.push(p.name); }
    pickDlg.close();
  }
  return {keys:Object.keys(WRITEUPS2027).sort(), out, empty, fallback, others:S.players.length-ids.length,
    w:Object.keys(CARDS.w).filter(k=>!ids.includes(k)).length};
})()`);
ok(JSON.stringify(wu.keys) === JSON.stringify([...WU_IDS].sort()) && wu.out.length === 10, 'WRITEUPS2027 holds exactly the 10 seed ids, all in the pool', wu.keys.join(' '));
// CTHL $ = a bare auction-sized dollar figure ($N, not $N,NNN / $N.NM / $N million real money)
const CTHL$ = /\$\d+(?!\d)(?![,.]\d)(?!\s?(?:M\b|million|billion))/;
for(const r of wu.out){
  const realOnly = !CTHL$.test(r.back) && r.money.every(m => !new RegExp(`\\$${m}(?![\\d,])`).test(r.back));
  ok(r.slot === r.want && r.ap === 'Eno' && (!pilot || pilot.has(r.slot)) && realOnly && !/Provisional Top 100/i.test(r.back),
    `${r.name}: card back shows the exact approved text${pilot ? ' (= pilot_2026-11-19.md)' : ''}, no CTHL $, no Provisional Top 100`,
    r.slot === r.want ? (r.back.match(CTHL$) || [''])[0] : 'slot: ' + r.slot.slice(0, 80));
}
ok(wu.empty.length === 0, `the other ${wu.others} cards: write-up slot empty`, wu.empty.slice(0, 5).join(', '));
ok(wu.fallback.length === 0 && wu.w > 500, `no fallback to CARDS.w (${wu.w} old recaps in the file, none shown)`, wu.fallback.slice(0, 5).join(', '));
const dl = await ev(`(()=>{ show('list'); const texts=Object.values(WRITEUPS2027).map(w=>w.text.slice(0,40)), hit=[];
  const clubs=[...document.querySelectorAll('#dlTeams [onclick]')].length; let seen=0;
  for(const c of [...new Set(S.players.map(p=>p.team))]){ dlClub=c; renderDraftList(); seen++;
    const t=document.getElementById('view-list').innerText; texts.forEach(x=>{ if(t.includes(x)) hit.push(c+': '+x); }); }
  return {hit, seen}; })()`);
ok(dl.hit.length === 0 && dl.seen > 10, `Draft List (${dl.seen} clubs rendered): no write-up text`, dl.hit.slice(0, 3).join(' ; '));
ok(errs.length === 0, '0 console errors after all cards', errs.slice(0, 3).join(' | '));

/* ---- 7. guard: writeups file missing ---- */
hide = 'writeups-2027.js'; errs = [];
await load();
const df = await ev(`typeof DATA_FAIL==='string' ? DATA_FAIL : ''`).catch(() => '');
ok(/data\/writeups-2027\.js did not load/.test(df), 'guard: missing data/writeups-2027.js stops the app and names the file', df.slice(0, 120));
hide = null;

ws.close(); chrome.kill(); srv.close();
console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
process.exit(fails ? 1 : 0);
