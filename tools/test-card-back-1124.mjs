#!/usr/bin/env node
// Card back, 2026-11-24: 1987 Topps banner (full-width NAME • POS, royal blue,
// no top CTHL mark, no team / Hitter / Pitcher on that row) and no purple in
// #pickDlg. Headless Chrome, ?room=local, Firebase failed as offline.
// $ is allowed only inside an approved write-up (#cbWriteup). The rest of the
// back, including the banner, has none.
//   node tools/test-card-back-1124.mjs
import { spawn } from 'child_process';
import fs from 'fs'; import http from 'http'; import path from 'path';
import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const WebSocket = require('ws');

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
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
const PORT = 9960 + Math.floor(Math.random() * 20);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/card-back-${Date.now()}`, 'about:blank'], { stdio: 'ignore' });
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

const load = async (w, h) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
  await send('Page.navigate', { url: `http://127.0.0.1:${srv.address().port}/index.html?room=local` });
  for(let i = 0; i < 40; i++){ await sleep(200); if(await ev(`document.readyState==='complete'`).catch(() => false)) break; }
  await sleep(1200);
};
await load(1280, 900);
ok(await ev(`typeof S!=='undefined' && S.players.length>600 && DATA_FAIL===''`), 'app loads (room=local)');
ok(errs.length === 0, '0 console errors on load', errs.slice(0, 3).join(' | '));

const CARD = `(()=>{
  const badPurple = c => {
    const m = String(c||'').match(/rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,\\s/]+([\\d.]+))?/);
    if(!m) return false;
    const r=+m[1], g=+m[2], b=+m[3], a=m[4]==null?1:+m[4];
    if(a===0) return false;
    return b>150 && r>90 && g<r;
  };
  const props=['color','backgroundColor','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','outlineColor'];
  const open = name => {
    const p = S.players.find(x=>x.name===name);
    openPick(p.id);
    fitCardBanner();
    const back=document.getElementById('cardBack');
    const top=back.querySelector('.cb-top');
    const nm=document.getElementById('cbName');
    const wu=document.getElementById('cbWriteup');
    const rest=back.textContent.replace(wu.textContent,'');
    const dlg=document.getElementById('pickDlg');
    const purples=[];
    [dlg, ...dlg.querySelectorAll('*')].forEach(el=>{
      for(const pseudo of ['', '::before', '::after']){
        const cs=getComputedStyle(el, pseudo||null);
        for(const prop of props){
          const c=cs[prop];
          if(badPurple(c)) purples.push((el.id||el.className||el.tagName)+pseudo+' '+prop+' '+c);
        }
      }
    });
    const proj=back.querySelector('tr.proj');
    const club=proj&&proj.children[1]?proj.children[1].textContent:'';
    return {
      name:p.name, team:p.team, pos:dispElig(p),
      banner:nm.textContent,
      top:top.textContent.trim(),
      hasMark:!!back.querySelector('.cb-no'),
      hasVitals:!!document.getElementById('cbVitals'),
      topHasCTHL:/CTHL/.test(top.textContent),
      topHasRole:/Hitter|Pitcher/.test(top.textContent),
      dollar: rest.includes('\$'),
      wholeDollar: back.textContent.includes('\$'),
      club,
      font: parseFloat(getComputedStyle(nm).fontSize),
      fits: nm.scrollWidth<=nm.clientWidth+1,
      lines: Math.round(nm.getBoundingClientRect().height / parseFloat(getComputedStyle(nm).lineHeight)),
      both: !!document.getElementById('cardFront') && getComputedStyle(document.getElementById('cardFront')).display!=='none'
        && getComputedStyle(back).display!=='none',
      banBg: getComputedStyle(back.querySelector('.cb-ban')).backgroundColor,
      purples: purples.slice(0, 8),
      purpleN: purples.length
    };
  };
  return {paredes:open('Isaac Paredes'), crochet:open('Garrett Crochet'), long:open('Christian Encarnacion-Strand')};
})()`;

const desk = await ev(CARD);
const want = (row, label) => {
  const expect = (row.name + ' • ' + row.pos).toUpperCase();
  ok(row.banner === expect && row.top === expect, `${label}: banner text is NAME • POS`, JSON.stringify({banner:row.banner, want:expect, top:row.top}));
  ok(!row.hasMark && !row.topHasCTHL && !row.hasVitals, `${label}: no CTHL mark and no vitals line in the top row`);
  ok(!row.top.includes(row.team) && !row.topHasRole, `${label}: banner row has no team code and no Hitter/Pitcher`, row.top);
  ok(!row.dollar, `${label}: no $ in the back text outside the write-up`);
  ok(row.club === row.team, `${label}: Club column still shows the team`, row.club);
  ok(row.both, `${label}: front and back both shown`);
  ok(row.purpleN === 0, `${label}: no purple computed colors in #pickDlg`, row.purples.join(' | '));
  ok(row.fits, `${label}: banner text fits`, `font ${row.font}px lines ${row.lines}`);
};
want(desk.paredes, 'Paredes');
// CBS 2027 elig is 3B/CI (was 1B/3B/CI). dispElig hides CI, so the banner is 3B.
ok(desk.paredes.banner === 'ISAAC PAREDES • 3B', 'Paredes banner is ISAAC PAREDES • 3B', desk.paredes.banner);
want(desk.crochet, 'Crochet');
ok(desk.crochet.banner === 'GARRETT CROCHET • SP', 'Crochet banner is GARRETT CROCHET • SP', desk.crochet.banner);
ok(!desk.crochet.wholeDollar, 'Crochet back text has no $', desk.crochet.banner);
want(desk.long, 'Encarnacion-Strand');
ok(/^rgb\(29,\s*63,\s*158\)$/.test(desk.paredes.banBg), 'banner background is royal blue #1d3f9e', desk.paredes.banBg);
ok(errs.length === 0, '0 console errors after the desktop cards', errs.slice(0, 3).join(' | '));

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await sleep(400);
const phone = await ev(CARD);
want(phone.paredes, '390 Paredes');
want(phone.long, '390 Encarnacion-Strand');
ok(phone.long.fits && phone.long.font >= 15, 'long name fits at 390px without dropping below 15px', `font ${phone.long.font} lines ${phone.long.lines} fits ${phone.long.fits}`);
ok(phone.paredes.font >= 18, 'a normal name stays large at 390px', `font ${phone.paredes.font}`);
ok(errs.length === 0, '0 console errors at 390px', errs.slice(0, 3).join(' | '));

ws.close(); chrome.kill(); srv.close();
console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
process.exit(fails ? 1 : 0);
