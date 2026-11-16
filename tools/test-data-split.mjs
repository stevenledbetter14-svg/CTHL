#!/usr/bin/env node
// Self-test for the data split (2026-11-16): the baked data blocks moved out of
// index.html into data/*.js. Checks, against the last single-file build:
//   1. every moved const is byte-identical in source and deep-equal in value
//      (old index.html line, evaluated, vs data/*.js, evaluated);
//   2. index.html no longer holds them, loads each file once, in order, before
//      the app script, with ?v=<APP_VER>; the guard covers every file;
//   3. the tools that write data (sync-keepers --write, aav_single_pass --write)
//      edit the data files in a temp copy and keep everything else intact;
//   4. headless Chrome over http and file://: app loads, 0 console errors, the
//      in-page objects equal the old embedded ones;
//   5. a missing data file or a wrong ?v= shows the red CTHL issue + error box.
//   node tools/test-data-split.mjs [--ref <git rev of the pre-split build>] [--no-net]
// --no-net skips the sync-keepers write check (it GETs the keepers room).
import { spawn, spawnSync, execFileSync } from 'child_process';
import fs from 'fs'; import http from 'http'; import os from 'os'; import path from 'path'; import vm from 'vm'; import util from 'util';
import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const WebSocket = require('ws');

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const argv = process.argv.slice(2);
const REF = argv.includes('--ref') ? argv[argv.indexOf('--ref') + 1] : 'b5a63b7';   // last single-file build
const NONET = argv.includes('--no-net');
const FILES = [['seed-2027.js', 'SEED2026'], ['aav-2027.js', 'AAV_2027'], ['cards-2027.js', 'CARDS'],
               ['keepers-2027.js', 'KEEPERS2027'], ['rotoid.js', 'ROTOID'], ['logos.js', 'LOGO']];
/* 2026-11-16 card lines: tools/p27-card-fields.py appends G/AB/H (hitters) and
   G/L/H/ER/WHIP (pitchers) to every SEED2026 p27. The baseline is the old
   build minus exactly those keys; nothing else in SEED2026 may differ. */
const CARD_ADD = { H: ['G', 'AB', 'H'], P: ['G', 'L', 'H', 'ER', 'WHIP'] };
const p27Side = q => ('PA' in q) ? 'H' : 'P';
const stripCardVal = (name, v) => { if(name === 'SEED2026') for(const p of v.players) if(p.p27) for(const k of CARD_ADD[p27Side(p.p27)]) delete p.p27[k]; return v; };
const stripCardSrc = (name, l) => name !== 'SEED2026' ? l
  : l.replace(/,"G":[-\d.e]+,"AB":[-\d.e]+,"H":[-\d.e]+\}/g, '}').replace(/,"G":[-\d.e]+,"L":[-\d.e]+,"H":[-\d.e]+,"ER":[-\d.e]+,"WHIP":[-\d.e]+\}/g, '}');
let fails = 0;
const ok = (c, msg, extra = '') => { if(!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${msg}${extra ? '  — ' + extra : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- 1. old embedded vs new files ---------------- */
const oldHtml = execFileSync('git', ['-C', ROOT, 'show', `${REF}:index.html`], { encoding: 'utf8', maxBuffer: 1 << 26 });
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const constLine = (text, name) => text.split('\n').filter(l => l.startsWith(`const ${name} =`) || l.startsWith(`const ${name}=`));
const OLD = {}, OLDJSON = {};
for(const [f, name] of FILES){
  const lines = constLine(oldHtml, name);
  ok(lines.length === 1, `old build (${REF}) has one ${name} line`);
  const ctx = vm.createContext({});
  vm.runInContext(lines[0], ctx);
  OLD[name] = structuredClone(vm.runInContext(name, ctx));   // into this realm, so deep-equal can compare
  OLDJSON[name] = JSON.stringify(OLD[name]);
  const src = fs.readFileSync(path.join(ROOT, 'data', f), 'utf8');
  ok(constLine(src, name).length === 1 && stripCardSrc(name, constLine(src, name)[0]) === lines[0], `data/${f}: ${name} source line byte-identical${name === 'SEED2026' ? ' minus the p27 card-line fields' : ''} (${lines[0].length} chars)`);
}
const NEW = vm.createContext({});
for(const [f] of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'), NEW, { filename: f });
for(const [f, name] of FILES){
  const v = stripCardVal(name, structuredClone(vm.runInContext(name, NEW)));
  ok(util.isDeepStrictEqual(v, OLD[name]) && JSON.stringify(v) === OLDJSON[name], `${name}: value deep-equal to the old embedded object (key order too)${name === 'SEED2026' ? ', minus the p27 card-line fields' : ''}`);
}
{
  const pl = vm.runInContext('SEED2026', NEW).players.filter(p => p.p27);
  const bad = pl.filter(p => !CARD_ADD[p27Side(p.p27)].every(k => typeof p.p27[k] === 'number' && isFinite(p.p27[k])));
  ok(pl.length > 600 && bad.length === 0, `SEED2026: all ${pl.length} p27 lines carry the card fields (H: G AB H · P: G L H ER WHIP)`, bad.slice(0, 5).map(p => p.name).join(', '));
}
for(const [f, name] of FILES){
  const bare = fs.readFileSync(path.join(ROOT, 'data', f), 'utf8').replace(/\/\*[\s\S]*?\*\/|^\/\/.*$/gm, '').trim();
  ok(new RegExp(`^const ${name} ?= ?\\{.*\\};$`, 's').test(bare) && bare.split('\n').length === 1, `data/${f} holds values only (comments + one const, no code)`);
}

/* ---------------- 2. index.html wiring ---------------- */
const APP_VER = (html.match(/const APP_VER = '([^']+)'/) || [])[1];
ok(!!APP_VER && APP_VER !== (oldHtml.match(/const APP_VER = '([^']+)'/) || [])[1], `APP_VER bumped for the split build (${APP_VER})`);
ok(FILES.every(([, n]) => constLine(html, n).length === 0), 'index.html no longer defines any moved const');
const tags = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
ok(JSON.stringify(tags) === JSON.stringify(FILES.map(([f]) => `data/${f}?v=${APP_VER}`)), 'one <script src> per data file, in order, each ?v=APP_VER', tags.join(' '));
const firstApp = html.indexOf('if(DATA_FAIL) throw');
ok(tags.every(t => html.indexOf(t) < firstApp) && html.indexOf('const DATA_FAIL') < firstApp, 'data tags and guard come before the app script');
ok(FILES.every(([f, n]) => html.includes(`'${f}': typeof ${n} !== 'undefined'`)), 'guard checks every data global');
ok((html.match(/if\(DATA_FAIL\) throw new Error\(DATA_FAIL\);/g) || []).length === 2, 'both app scripts stop on DATA_FAIL');
ok(fs.readFileSync(path.join(ROOT, 'index.html')).length < 300000, `index.html is markup/CSS/code only (${fs.statSync(path.join(ROOT, 'index.html')).size} bytes)`);
ok((oldHtml.match(/const SEED_VER = '([^']+)'/) || [])[1] === (html.match(/const SEED_VER = '([^']+)'/) || [])[1], 'SEED_VER unchanged');

/* ---------------- 3. data-writing tools, on temp copies ---------------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cthl-split-'));
fs.mkdirSync(path.join(tmp, 'data'));
for(const [f] of FILES) fs.copyFileSync(path.join(ROOT, 'data', f), path.join(tmp, 'data', f));
const nonConst = (t, n) => t.split('\n').filter(l => !l.startsWith(`const ${n}`)).join('\n');
{
  // aav: knock one price off in the copy; --write must restore the block in data/aav-2027.js
  const p = path.join(tmp, 'data', 'aav-2027.js'), orig = fs.readFileSync(p, 'utf8');
  const blk = JSON.parse(orig.match(/const AAV_2027 = (\{.*?\});\n/)[1]);
  const pid = Object.keys(blk).find(k => blk[k].a > 5);
  fs.writeFileSync(p, orig.replace(`"${pid}":{"a":${blk[pid].a}}`, `"${pid}":{"a":${blk[pid].a + 7}}`));
  const r = spawnSync('python3', [path.join(ROOT, 'tools/aav_single_pass.py'), '--root', tmp, '--write'], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  const after = fs.readFileSync(p, 'utf8');
  const nb = JSON.parse(after.match(/const AAV_2027 = (\{.*?\});\n/)[1]);
  ok(r.status === 0 && /data\/aav-2027\.js AAV_2027 block updated \(1 entries changed\)/.test(r.stdout) && util.isDeepStrictEqual(nb, blk),
    'aav_single_pass --write rewrites the AAV_2027 block in data/aav-2027.js (1 changed -> back to the run values)', `exit ${r.status} ${(r.stdout.match(/wrote .*/) || [r.stderr.slice(-200)])[0]}`);
  ok(after.startsWith(orig.slice(0, orig.indexOf('/* ================= AAV 2027'))) && after.includes('/* ================= END AAV 2027 ================= */'), 'aav write keeps the file header and END marker');
}
if(!NONET){
  const p = path.join(tmp, 'data', 'seed-2027.js'), orig = fs.readFileSync(p, 'utf8');
  const r = spawnSync('node', [path.join(ROOT, 'tools/sync-keepers.mjs'), '--write', '--seed', p], { encoding: 'utf8' });
  const after = fs.readFileSync(p, 'utf8');
  ok(r.status === 0 && /after write \(re-read\).*data\/seed-2027\.js/.test(r.stdout) && /MATCH/.test(r.stdout), 'sync-keepers --write --seed <copy>: writes data/seed-2027.js and re-read verifies', `exit ${r.status}`);
  ok(nonConst(after, 'SEED2026') === nonConst(orig, 'SEED2026'), 'sync-keepers write touches only the SEED2026 line (header comments kept)');
  const c = spawnSync('node', [path.join(ROOT, 'tools/sync-keepers.mjs'), '--check', '--html', path.join(tmp, 'index.html')], { encoding: 'utf8' });
  ok(c.status === 0 && /MATCH/.test(c.stdout), 'sync-keepers --html <dir>/index.html (old flag) reads <dir>/data/seed-2027.js');
}
fs.rmSync(tmp, { recursive: true, force: true });

/* ---------------- 4/5. headless Chrome ---------------- */
const PORT = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/data-split-${Date.now()}`, 'about:blank'], { stdio: 'ignore' });
let pages; for(let i = 0; i < 60; i++){ try{ pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if(pages.find(t => t.type === 'page')) break; }catch(e){} await sleep(200); }
const ws = new WebSocket(pages.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.on('open', r));
let id = 0; const pend = {}; let errs = [];
ws.on('message', m => { const d = JSON.parse(m);
  if(d.id && pend[d.id]){ pend[d.id](d); delete pend[d.id]; }
  if(d.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  if(d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push('console.error ' + d.params.args.map(a => a.value || a.description).join(' '));
  if(d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errs.push('log ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
  if(d.method === 'Fetch.requestPaused'){
    const u = d.params.request.url;   // keep the real room out of it: every Firebase call fails as offline
    if(/firebaseio\.com/.test(u)) send('Fetch.failRequest', { requestId: d.params.requestId, errorReason: 'InternetDisconnected' });
    else send('Fetch.continueRequest', { requestId: d.params.requestId });
  }
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if(r.result.exceptionDetails) throw new Error(expr.slice(0, 60) + ' -> ' + JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; };
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });

let hide = null, rewrite = null;   // failure-mode knobs for the server
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if(p === '/favicon.ico'){ r.writeHead(204); r.end(); return; }   // Chrome asks for it on its own; not the app's
  const f = path.join(ROOT, path.normalize(p === '/' ? '/index.html' : p));
  if(!f.startsWith(ROOT) || !fs.existsSync(f) || (hide && p === '/data/' + hide)){ r.writeHead(404, { 'content-type': 'text/html' }); r.end('<h1>404</h1>'); return; }
  let body = fs.readFileSync(f);
  if(rewrite && p === '/index.html') body = rewrite(body.toString());
  r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(body);
}).listen(0);
const HTTP = `http://127.0.0.1:${srv.address().port}/index.html?room=local`;
const open = async (url, wait = 4000) => { errs = []; await send('Page.navigate', { url }); for(let i = 0; i < wait / 200; i++){ await sleep(200); if(await ev(`document.readyState==='complete'`).catch(() => false)) break; } await sleep(1500); };

async function healthy(label, url){
  await open(url);
  const st = await ev(`(()=>{ try{ return {ok: DATA_FAIL==='' && !document.getElementById('dataFail'), players: S.players.length, bad: document.getElementById('hdrMark').classList.contains('bad'),
    stamp: document.getElementById('verStamp').textContent, logos: document.querySelectorAll('img[src^="data:image/png"]').length}; }catch(e){ return {err: String(e)}; } })()`);
  ok(st.ok && st.players > 600 && !st.bad, `${label}: app loads from data/*.js (${st.players} players, CTHL not red)`, JSON.stringify(st));
  ok(errs.length === 0, `${label}: 0 console errors`, errs.slice(0, 3).join(' | '));
  for(const [, name] of FILES){
    const s = JSON.stringify(stripCardVal(name, JSON.parse(await ev(`JSON.stringify(${name})`))));
    ok(s === OLDJSON[name], `${label}: in-page ${name} equals the old embedded object (${s.length} chars)`);
  }
}
async function broken(label, url, expect){
  await open(url);
  const st = await ev(`({box: (document.getElementById('dataFail')||{}).textContent||'', bad: document.getElementById('hdrMark').classList.contains('bad'),
    title: document.getElementById('hdrTitle').title, visible: !!(document.getElementById('dataFail')||{}).offsetHeight,
    started: (()=>{ try{ return !!S; }catch(e){ return false; } })()})`);
  ok(st.bad && st.visible && expect.test(st.box) && expect.test(st.title) && !st.started, `${label}: red CTHL + error box, app not started`, st.box.slice(0, 140));
}

await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
await healthy('http', HTTP);
await healthy('file://', 'file://' + path.join(ROOT, 'index.html'));
hide = 'cards-2027.js';
await broken('http, data/cards-2027.js 404', HTTP, /data\/cards-2027\.js did not load/);
hide = null; rewrite = t => t.replace(`data/logos.js?v=${APP_VER}`, 'data/logos.js?v=2020.01.01-1');
await broken('http, data/logos.js tagged for another build', HTTP, /data\/logos\.js is tagged data\/logos\.js\?v=2020\.01\.01-1, not this build/);
rewrite = null;
{
  const t2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cthl-split-file-'));
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(t2, 'index.html'));
  fs.mkdirSync(path.join(t2, 'data'));
  for(const [f] of FILES) if(f !== 'seed-2027.js') fs.copyFileSync(path.join(ROOT, 'data', f), path.join(t2, 'data', f));
  await broken('file://, data/seed-2027.js missing', 'file://' + path.join(t2, 'index.html'), /data\/seed-2027\.js did not load/);
  fs.rmSync(t2, { recursive: true, force: true });
}

ws.close(); chrome.kill(); srv.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
