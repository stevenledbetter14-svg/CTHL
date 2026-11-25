#!/usr/bin/env node
// No prospect ranks + card write-ups (2026-11-20, spec zuck_2026-11-20_package.md 1.4 / 4.4).
// Headless Chrome over http, room=local, every Firebase call failed as offline. Checks:
//   1. app loads, 0 console errors; APP_VER 2026.11.25-3; seven data <script> tags, each
//      ?v=APP_VER, writeups-2027.js among them and in the data-file guard (elig-2027.js is not loaded);
//   2. CARDS has no t; the app source never reads CARDS.t;
//   3. every Future Stars card (CARDS.f[id]==='f'): banner still shown, cfTag empty, and the
//      document text has no "Provisional", no "Top 100 prospect", no PR+digits badge;
//      no card at all shows any of those (whole pool);
//   4. Projections tab (Steven 1:08 PM 11/20: "The Top Prospect button stays"): the
//      ★ Top Prospects button is there; clicking it filters the pool to p.pr players only
//      (0 < count < full pool, hitters and pitchers); the tab text and every title/tooltip,
//      filter on and off, has no "Provisional", "Top 100", PR+digits or "#N" rank (the
//      overall-rank column is checked to be the whole-pool rank, not a prospect rank);
//   5. $1 prospect floor: PROSPECT_FLOOR_IDS is still the 10 names from 11/18. A name with
//      val > 0 drops the flag (Ryan Sloan, val 1, after the 11/20 re-pull).
//      and its cell shows $1 with no rank;
//   6. write-ups: the 114 ids each show WRITEUPS2027[id].text exactly in #cbWriteup.
//      The original 10 pilots (approved_by Eno) match a block of pilot_2026-11-19.md when
//      /workspace/db2027 is present. The other 51 of the original 61 are approved_by Steven
//      and are not checked against that file. The 44 from batch 2026-11-24 and the 9 from batch 2026-11-25 are approved_by
//      null and approved_date null. No CTHL $ amount, no "Provisional Top 100"; every other
//      card's slot is empty (no CARDS.w fallback); no write-up text on the Draft List tab;
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
const WU_IDS = ['p301850c', 'p5c9bcf3', 'pabd0d7f', 'p87322e2', 'p8c74fc1', 'p7f1b103', 'pf97704', 'p9ccea09', 'p28aaca5', 'pbd68516', 'pf29d0da', 'p895e8b6', 'p95e60af', 'p953f48f', 'p2020362', 'pf10637c', 'p8fcd7f4', 'p4ba2e16', 'p3672d6a', 'p537390e', 'pe315128', 'p6bae4b5', 'p988af3f', 'p5d39d0a', 'p82b3359', 'pb4d19ec', 'pba6785e', 'p18b962a', 'p86b38f3', 'pf977fae', 'p7c99a58', 'pd726c86', 'pe225715', 'pf0ce583', 'p8c38fb2', 'p6b44680', 'p83239ef', 'p15b40ae', 'pd70820f', 'p9d33a01', 'p8aa4248', 'p7abec53', 'p7ebff20', 'p66c1494', 'p6aa8b9e', 'p8604871', 'p873be07', 'pe0cfab4', 'p8b0d590', 'pc7a2ea2', 'pbd6b881', 'pd3bf6d0', 'pa5aa3c8', 'p9a2ef80', 'p3488f87', 'p518ae45', 'p68739f', 'peaefc4d', 'p8cdb305', 'p930d6ea', 'pe8bec9', 'p98289fc', 'p7d103', 'pa4b9a9c', 'p8dd63cb', 'pb8dee08', 'p243d357', 'pae3a2b7', 'pfd56a92', 'pd3ac94a', 'p9d1de2a', 'pe8c1474', 'p6377140', 'pdc823df', 'p5d22ea3', 'pe7e8f9f', 'p27e9e06', 'p76b3e3', 'pbd0561e', 'p4bc46e0', 'p0a2b0d2', 'p3f9d52f', 'pf12b4da', 'p64ab4f3', 'p2085963', 'p48b4a89', 'p4cdd205', 'pbd7c94a', 'p218e0b7', 'pda33ea0', 'pe7b3e25', 'pf92e233', 'p30f9705', 'p19f9919', 'p119a72d', 'pa7773b6', 'p5daf106', 'pd82e198', 'p90fbbd1', 'pbd62888', 'p77216e9', 'p6587b4a', 'p2a96fb1', 'p3451d01', 'pdf0a965', 'p506bf2e', 'p298cb3a', 'p7f26144', 'p1f52526', 'p7e9ee51', 'pe5cfedf', 'p1200339', 'p176e0ac', 'p1038f0b'];
const PILOT_IDS = new Set(WU_IDS.slice(0, 10));
const NEW_IDS = new Set(WU_IDS.slice(61));
let fails = 0;
const ok = (c, msg, extra = '') => { if(!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${msg}${extra ? '  — ' + extra : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const APP_VER = (html.match(/const APP_VER = '([^']+)'/) || [])[1];
ok(APP_VER === '2026.11.25-3', `APP_VER ${APP_VER}`);
const tags = [...html.matchAll(/<script src="(data\/[^"]+)"><\/script>/g)].map(m => m[1]);
ok(tags.length === 7 && tags.every(t => t.endsWith('?v=' + APP_VER)) && tags.includes(`data/writeups-2027.js?v=${APP_VER}`) && !tags.some(t => t.includes('elig-2027.js')),
  `seven data files, each ?v=APP_VER, writeups-2027.js included, elig-2027.js not loaded`, tags.join(' '));
ok(html.includes(`'writeups-2027.js': typeof WRITEUPS2027 !== 'undefined'`), 'data-file guard checks WRITEUPS2027');
ok(!html.includes('elig-2027.js') && !html.includes('ELIG2027'), 'data-file guard does not load ELIG2027');
ok(!/CARDS\.t\b/.test(html), 'index.html never reads CARDS.t');
ok(!/cardProspectRank|cardProspectTitle|prospectBadge|prospectTitle/.test(html), 'no PR badge / prospect-title code left in index.html');
ok(/toggleProspectOnly\(\)" title="Show only top prospects">★ Top Prospects</.test(html) && /\.filter\(p=>!poolProspectOnly \|\| isProspect\(p\)\)/.test(html),
  'Top Prospects button + filter present, tooltip "Show only top prospects"');

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

/* ---- 4. Projections tab: Top Prospects button kept, no rank shown ---- */
const NUM_RE = String.raw`Provisional|Top 100|\bPR\s?\d+\b|#\d+`;
const proj = await ev(`(()=>{ show('draft'); poolProspectOnly=false; $('search').value=''; $('hideDrafted').checked=false;
  const re=new RegExp(${JSON.stringify(NUM_RE)},'i'), v=document.getElementById('view-draft'), out={};
  // the td.rank column is the whole-pool overall rank (every player, not a prospect rank):
  // left out of the text scan, but each cell must equal '#'+overallRank(p), never renumbered
  const scan=tag=>{ const hits=[], c=v.cloneNode(true);
    [...v.querySelectorAll('td.rank')].forEach(td=>{ const p=S.players.find(x=>x.id===td.closest('tr').dataset.id) || null;
      const name=td.closest('tr').querySelector('td.pl')?.innerText||'', q=p||S.players.find(x=>x.kind===poolMode && name.includes(x.name));
      const rk=q&&overallRank(q); if(td.textContent!==(rk?'#'+rk:'—')) hits.push(tag+' rank cell '+td.textContent+' != overall rank for '+name.slice(0,30)); });
    c.querySelectorAll('td.rank').forEach(td=>td.remove());
    document.body.appendChild(c); const txt=c.innerText; c.remove();
    if(re.test(txt)) hits.push(tag+' text: '+txt.match(re)[0]);
    v.querySelectorAll('[title]').forEach(e=>{ if(re.test(e.title)) hits.push(tag+' title: '+e.title.slice(0,80)); }); return hits; };
  const btn=()=>[...v.querySelectorAll('#poolPos button')].find(b=>/★ Top Prospects/.test(b.textContent));
  const hits=[];
  for(const m of ['H','P']){
    poolSet('mode',m); poolSet('pos',''); poolSet('mlb','');
    const full=S.players.filter(p=>p.kind===m).length, cnt=()=>+($('poolCount').textContent.match(/\\d+/)||[0])[0];
    const b0=btn(), n0=cnt(); hits.push(...scan(m+' off'));
    if(b0) b0.click();
    const b1=btn(), n1=cnt();
    const want=S.players.filter(p=>p.kind===m && isProspect(p)).length;
    hits.push(...scan(m+' on'));
    out[m]={btn:!!b0, title:b0&&b0.title, on:!!(b1&&b1.classList.contains('on')), full, n0, n1, want, flag:poolProspectOnly};
    if(b1) b1.click();
    out[m].back=cnt(); out[m].off=!poolProspectOnly;
  }
  out.hits=hits; return out; })()`);
for(const m of ['H', 'P']){
  const r = proj[m];
  ok(r.btn && r.title === 'Show only top prospects', `Projections ${m}: ★ Top Prospects button present, tooltip "Show only top prospects"`, JSON.stringify(r.title));
  ok(r.on && r.flag && r.n0 === r.full && r.n1 === r.want && r.n1 > 0 && r.n1 < r.full && r.back === r.full && r.off,
    `Projections ${m}: click filters to prospects only (${r.n1} of ${r.full}), click again restores`, JSON.stringify(r));
}
ok(proj.hits.length === 0, 'Projections tab, filter on and off: no Provisional / Top 100 / PR+digits / #N in text or tooltips', proj.hits.slice(0, 5).join(' ; '));

/* ---- 5. $1 prospect floor ---- */
const fl = await ev(`(()=>{
  const priced = PROSPECT_FLOOR_IDS.filter(id => ((S.players.find(x=>x.id===id)||{}).val||0) > 0);
  return {ids:Object.keys(PFLOOR).sort(), priced, cells:Object.keys(PFLOOR).map(id=>{ const p=S.players.find(x=>x.id===id);
  const d=document.createElement('div'); d.innerHTML=aavCellHTML(p); return d.textContent+' | '+d.firstChild.title; })};
})()`);
const floorShown = [...FLOOR_IDS].filter(id => !fl.priced.includes(id)).sort();
ok(JSON.stringify(fl.priced) === JSON.stringify(['p6587b4a']) && JSON.stringify(fl.ids) === JSON.stringify(floorShown),
  '$1 prospect floor: frozen 10, Ryan Sloan dropped because val > 0', `shown ${fl.ids.join(' ')} priced ${fl.priced.join(' ')}`);
ok(fl.cells.every(c => /^\$1 \| /.test(c) && !/#\d|PR\s?\d|Top.?100/i.test(c)), '$1 flag shows no rank', fl.cells[0]);

/* ---- 6. write-ups ---- */
const pilot = fs.existsSync(PILOT) ? new Set([...fs.readFileSync(PILOT, 'utf8').matchAll(/\*\*.+?\*\*\n(.+)/g)].map(m => m[1].trim())) : null;
const wu = await ev(`(()=>{
  const ids=${JSON.stringify(WU_IDS)}, out=[], empty=[], fallback=[];
  for(const p of S.players){
    openPick(p.id);
    const slot=document.getElementById('cbWriteup').textContent, back=document.getElementById('cardBack').textContent;
    if(ids.includes(p.id)) out.push({id:p.id, name:p.name, slot, back, want:(WRITEUPS2027[p.id]||{}).text, ap:(WRITEUPS2027[p.id]||{}).approved_by, ad:(WRITEUPS2027[p.id]||{}).approved_date,
      money:[p.val, p.pick&&p.pick.price, (aavOf(p)||{}).a, (aavOf(p)||{}).k].filter(x=>x>0)});
    else if(slot!==''){ empty.push(p.name); if(CARDS.w[p.id] && slot===CARDS.w[p.id]) fallback.push(p.name); }
    pickDlg.close();
  }
  return {keys:Object.keys(WRITEUPS2027).sort(), out, empty, fallback, others:S.players.length-ids.length,
    w:Object.keys(CARDS.w).filter(k=>!ids.includes(k)).length};
})()`);
ok(WU_IDS.length === 114 && NEW_IDS.size === 53 && JSON.stringify(wu.keys) === JSON.stringify([...WU_IDS].sort()) && wu.out.length === 114, 'WRITEUPS2027 holds exactly these 114 ids, all in the pool', wu.keys.join(' '));
// CTHL $ = a bare auction-sized dollar figure ($N, not $N,NNN / $N.NM / $N million real money)
const CTHL$ = /\$\d+(?!\d)(?![,.]\d)(?!\s?(?:M\b|million|billion))/;
for(const r of wu.out){
  // Same exceptions as CTHL$: $3.2 million is a signing bonus, not the auction $3.
  const realOnly = !CTHL$.test(r.back) && r.money.every(m => !new RegExp(`\\$${m}(?!\\d)(?![,.]\\d)(?!\\s?(?:M\\b|million|billion))`).test(r.back));
  const isPilot = PILOT_IDS.has(r.id);
  const isNew = NEW_IDS.has(r.id);
  const apOk = isPilot ? r.ap === 'Eno' : (isNew ? r.ap == null && r.ad == null : r.ap === 'Steven');
  const who = isPilot ? 'Eno' : (isNew ? 'null' : 'Steven');
  const pilotOk = !isPilot || !pilot || pilot.has(r.slot);
  ok(r.slot === r.want && apOk && pilotOk && realOnly && !/Provisional Top 100/i.test(r.back),
    `${r.name}: card back shows the exact approved text${isPilot && pilot ? ' (= pilot_2026-11-19.md)' : ''}, approved_by ${who}, no CTHL $, no Provisional Top 100`,
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
