#!/usr/bin/env node
// Card-back 2027 line test (2026-11-16). Headless Chrome over http, room=local,
// every Firebase call failed as offline. Checks:
//   1. app loads, 0 console errors;
//   2. every pool player's card back: 2027 row headers are exactly
//      H: G AB R H HR RBI SB AVG · P: G W L SV IP H ER BB K ERA WHIP K/BB, the
//      history tables use the same headers, and the 2027 cells equal SEED2026
//      p27 (checked here from the data, not from the app's helper);
//   3. 2025-26 pitching rows leave L/H/ER/WHIP blank (not in the history data);
//   4. no $ anywhere on any card back;
//   5. the Sold price box opens blank on every undrafted card;
//   6. 0 console errors after all of it.
// Writes the check CSV and two screenshots (hitter, pitcher):
//   node tools/test-card-lines.mjs [--csv <path>] [--shots <dir>]
import { spawn } from 'child_process';
import fs from 'fs'; import http from 'http'; import path from 'path';
import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const WebSocket = require('ws');

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const argv = process.argv.slice(2);
const arg = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const CSV = arg('--csv', '/workspace/cthl-shots/card-2027-lines.csv');
const SHOTS = arg('--shots', '/workspace/cthl-shots');
const HH = ['G', 'AB', 'R', 'H', 'HR', 'RBI', 'SB', 'AVG'];
const PH = ['G', 'W', 'L', 'SV', 'IP', 'H', 'ER', 'BB', 'K', 'ERA', 'WHIP', 'K/BB'];
let fails = 0;
const ok = (c, msg, extra = '') => { if(!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${msg}${extra ? '  — ' + extra : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if(p === '/favicon.ico'){ r.writeHead(204); r.end(); return; }
  const f = path.join(ROOT, path.normalize(p === '/' ? '/index.html' : p));
  if(!f.startsWith(ROOT) || !fs.existsSync(f)){ r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(fs.readFileSync(f));
}).listen(0);
const PORT = 9950 + Math.floor(Math.random() * 40);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/card-lines-${Date.now()}`, 'about:blank'], { stdio: 'ignore' });
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
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:${srv.address().port}/index.html?room=local` });
for(let i = 0; i < 40; i++){ await sleep(200); if(await ev(`document.readyState==='complete'`).catch(() => false)) break; }
await sleep(1500);
ok(await ev(`typeof S!=='undefined' && S.players.length>600 && DATA_FAIL===''`), 'app loads (room=local)');
ok(errs.length === 0, '0 console errors on load', errs.slice(0, 3).join(' | '));

const res = await ev(`(()=>{
  const HH=${JSON.stringify(HH)}, PH=${JSON.stringify(PH)};
  const exp = q => { const H='PA' in q;
    const f2=v=>(+v).toFixed(2), kbb=q.BB ? (q.SO/q.BB).toFixed(2) : '';
    return H ? [q.G,q.AB,q.R,q.H,q.HR,q.RBI,q.SB,(+q.AVG).toFixed(3).replace(/^0/,'')].map(String)
             : [q.G,q.W,q.L,q.SV,q.IP,q.H,q.ER,q.BB,q.SO,f2(q.ERA),f2(q.WHIP),kbb].map(String); };
  const out=[], bad=[], dollar=[], price=[], hist=[];
  for(const p of S.players){
    openPick(p.id);
    const back=document.getElementById('cardBack'), q=p.p27;
    if(/\\$/.test(back.textContent)) dollar.push(p.name);
    if(!p.pick && document.getElementById('dlgPrice').value!=='') price.push(p.name+'='+document.getElementById('dlgPrice').value);
    const grids=[...back.querySelectorAll('.cb-grid')];
    const proj=grids.find(g=>/2027/.test(g.querySelector('caption').textContent));
    const side = q ? (('PA' in q)?'H':'P') : p.kind;
    const want = side==='H'?HH:PH;
    const hdr = g=>[...g.querySelectorAll('thead th')].map(t=>t.textContent).filter(t=>!['Year','Club','Lvl'].includes(t));
    for(const g of grids){
      const cap=g.querySelector('caption').textContent, w=/Batting/.test(cap)?HH:/Pitching/.test(cap)?PH:want;
      if(hdr(g).join()!==w.join()) bad.push(p.name+' header '+cap+' '+hdr(g).join(' '));
      if(/Pitching/.test(cap)) for(const tr of g.querySelectorAll('tbody tr')){
        const c=[...tr.children].slice(3).map(td=>td.textContent);
        if(['L','H','ER','WHIP'].some(k=>c[PH.indexOf(k)]!=='')) hist.push(p.name);
      }
    }
    const cells=[...proj.querySelectorAll('tbody tr.proj td')].slice(2).map(td=>td.textContent);
    if(q){ const e=exp(q); if(cells.join('|')!==e.join('|')) bad.push(p.name+' got '+cells.join(' ')+' want '+e.join(' ')); }
    else if(!/no 2027 projection/.test(proj.textContent)) bad.push(p.name+' no p27 but row is not blank');
    out.push({id:p.id,name:p.name,team:p.team,type:side==='H'?'hitter':'pitcher',cols:want,cells:q?cells:null});
    pickDlg.close();
  }
  return {out,bad,dollar,price,hist,undrafted:S.players.filter(p=>!p.pick).length};
})()`);
ok(res.bad.length === 0, `2027 row + history headers on all ${res.out.length} cards; 2027 cells = SEED2026 p27`, res.bad.slice(0, 5).join(' ; '));
ok(res.hist.length === 0, '2025-26 pitching rows: L / H / ER / WHIP blank (not in the history data)', res.hist.slice(0, 5).join(', '));
ok(res.dollar.length === 0, `no $ on any card back (${res.out.length} cards)`, res.dollar.slice(0, 5).join(', '));
ok(res.price.length === 0, `Sold price box opens blank on all ${res.undrafted} undrafted cards`, res.price.slice(0, 5).join(', '));

// check CSV: one row per pool player, the 2027 line as shown on the card
const q = s => /[",\n]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s);
const head = ['pool_id', 'player', 'team', 'type', 'line', ...HH.map(c => 'H_' + c), ...PH.map(c => 'P_' + c)];
const rows = res.out.map(r => {
  const line = r.cells ? r.cols.map((c, i) => `${c} ${r.cells[i]}`).join(' · ') : 'no 2027 projection';
  const h = HH.map((c, i) => r.type === 'hitter' && r.cells ? r.cells[i] : '');
  const pc = PH.map((c, i) => r.type === 'pitcher' && r.cells ? r.cells[i] : '');
  return [r.id, r.name, r.team, r.type, line, ...h, ...pc].map(q).join(',');
});
fs.writeFileSync(CSV, head.join(',') + '\n' + rows.join('\n') + '\n');
console.log(`wrote ${CSV} (${rows.length} rows)`);
console.log('spot list:');
for(const n of ['Junior Caminero', 'Bobby Witt Jr.', 'Garrett Crochet', 'Paul Skenes', 'Bryan Baker']){
  const r = res.out.find(x => x.name === n);
  console.log(`  ${n.padEnd(16)} ${r ? `${r.team} ${r.type}: ${r.cells ? r.cols.map((c, i) => `${c} ${r.cells[i]}`).join(' · ') : 'no 2027 projection'}` : 'not in the pool'}`);
}

// screenshots: hitter and pitcher cards (whole dialog, both faces)
for(const [n, f] of [['Junior Caminero', 'card-2027-hitter.png'], ['Garrett Crochet', 'card-2027-pitcher.png']]){
  const pid = await ev(`S.players.find(p=>p.name===${JSON.stringify(n)}).id`);
  await ev(`openPick(${JSON.stringify(pid)})`); await sleep(400);
  const b = await ev(`(()=>{ const r=document.getElementById('pickDlg').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })()`);
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { ...b, scale: 1 } });
  fs.writeFileSync(path.join(SHOTS, f), Buffer.from(shot.result.data, 'base64'));
  console.log('screenshot', path.join(SHOTS, f));
  await ev('pickDlg.close()');
}
ok(errs.length === 0, '0 console errors after opening every card', errs.slice(0, 3).join(' | '));

ws.close(); chrome.kill(); srv.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
