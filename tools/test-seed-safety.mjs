#!/usr/bin/env node
// Headless self-test: a SEED_VER change never wipes, reorders or rolls back picks.
//   node tools/test-seed-safety.mjs [path/to/index.html]
// Runs index.html in headless Chrome (CDP). The room is a FAKE in-memory
// Firebase served through request interception: nothing touches the real
// database. A "bump" is simulated by giving the saved state / room an older
// seedVer than the build's SEED_VER.
import { spawn } from 'child_process'; import fs from 'fs'; import http from 'http'; import path from 'path';
import { createRequire } from 'module';
const require = createRequire('/home/box/.local/lib/node_modules/');
const WebSocket = require('ws');
const HTML = process.argv[2] || new URL('../index.html', import.meta.url).pathname;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- chrome ---------------- */
const PORT = 9400 + Math.floor(Math.random()*400);
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--disable-gpu',`--remote-debugging-port=${PORT}`,`--user-data-dir=/tmp/seed-safety-${Date.now()}`,'about:blank'], {stdio:'ignore'});
let tabs; for(let i=0;i<60;i++){ try{ tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if(tabs.find(t=>t.type==='page')) break; }catch(e){} await sleep(200); }
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r => ws.on('open', r));
let id = 0; const pend = {}; const errs = [];
const send = (method, params={}) => new Promise(r => { const i=++id; pend[i]=r; ws.send(JSON.stringify({id:i, method, params})); });
const ev = async expr => { const r = await send('Runtime.evaluate', {expression:expr, returnByValue:true, awaitPromise:true}); if(r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; };

/* ---------------- fake room (RTDB REST) ---------------- */
let ROOMDB = null; const writes = [];
function nodeAt(path){ let n = ROOMDB; for(const s of path){ if(n == null) return null; n = n[s]; } return n ?? null; }
function setAt(path, val){ if(!path.length){ ROOMDB = val; return; } ROOMDB = ROOMDB || {}; let n = ROOMDB; path.slice(0,-1).forEach(s => { n[s] = n[s] || {}; n = n[s]; }); if(val == null) delete n[path.at(-1)]; else n[path.at(-1)] = val; }
ws.on('message', m => { const d = JSON.parse(m);
  if(d.id && pend[d.id]){ pend[d.id](d); delete pend[d.id]; }
  if(d.method==='Runtime.exceptionThrown') errs.push('EXC '+(d.params.exceptionDetails.exception?.description||d.params.exceptionDetails.text));
  if(d.method==='Runtime.consoleAPICalled' && d.params.type==='error') errs.push('console.error '+d.params.args.map(a=>a.value||a.description).join(' '));
  if(d.method==='Page.javascriptDialogOpening'){ dialogs.push(d.params.message); send('Page.handleJavaScriptDialog', {accept:true}); }
  if(d.method !== 'Fetch.requestPaused') return;
  const {requestId, request} = d.params; const u = new URL(request.url);
  if(!/firebaseio\.com$/.test(u.hostname)){ send('Fetch.continueRequest', {requestId}); return; }
  const path = decodeURIComponent(u.pathname).replace(/^\/drafts\/[^/]+/, '').replace(/\.json$/, '').split('/').filter(Boolean);
  const cors = [{name:'access-control-allow-origin',value:'*'},{name:'access-control-allow-methods',value:'GET,PUT,PATCH,DELETE'},{name:'access-control-allow-headers',value:'*'}];
  if(request.method === 'OPTIONS'){ send('Fetch.fulfillRequest', {requestId, responseCode:204, responseHeaders:cors, body:''}); return; }
  let body = 'null';
  const isStream = (request.headers.Accept||request.headers.accept||'').includes('event-stream');
  if(request.method === 'GET'){
    body = isStream ? '' : JSON.stringify(nodeAt(path));
  } else {
    writes.push(request.method+' /'+path.join('/'));
    const val = request.postData ? JSON.parse(request.postData) : null;
    if(request.method === 'PUT') setAt(path, val);
    if(request.method === 'PATCH') Object.entries(val).forEach(([k,v]) => setAt([...path, k], v));
    if(request.method === 'DELETE') setAt(path, null);
  }
  if(isStream){ send('Fetch.failRequest', {requestId, errorReason:'Failed'}); return; }  // app falls back to polling
  send('Fetch.fulfillRequest', {requestId, responseCode:200, responseHeaders:[{name:'content-type',value:'application/json'},...cors], body:Buffer.from(body).toString('base64')});
});
const dialogs = [];
await send('Runtime.enable'); await send('Page.enable');
await send('Fetch.enable', {patterns:[{urlPattern:'*'}]});

/* serve the page (and its data/*.js files) over http so localStorage persists across navigations */
const ROOT = path.dirname(HTML);
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  const f = p === '/index.html' ? HTML : path.join(ROOT, path.normalize(p));
  if(!f.startsWith(ROOT) || !fs.existsSync(f)){ r.writeHead(404); r.end(); return; }
  r.writeHead(200, {'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html'}); r.end(fs.readFileSync(f));
}).listen(0);
const BASE = `http://127.0.0.1:${srv.address().port}/index.html`;
const go = async (qs, wait=3500) => { await send('Page.navigate', {url: BASE + qs}); await sleep(wait); };

let fails = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '\n      ' + detail}`); if(!ok) fails++; };
const key = k => [String(k.pid), k.team, +k.price, !!k.keeper, !!k.taxi, k.t || 0].join('|');

/* ---------------- 1. local state, simulated SEED_VER bump ---------------- */
await go('?room=local');
const SEED_VER = await ev('SEED_VER');
const fresh = await ev(`JSON.parse(localStorage.getItem('cthl-auction'))`);
const P = fresh.players.filter(p => !p.pick && p.kind === 'H');
const baked = fresh.picks.filter(k => k.keeper && !(k.t > 0));
const team = 'Dealers', team2 = 'Xpress';
const declared = {pid:String(P[0].id), name:P[0].name, team, price:7, keeper:true, taxi:false, t:1794000000001};
const taxiPick = {pid:String(P[1].id), name:P[1].name, team:team2, price:0, keeper:false, taxi:true, t:1794000000002};
const added = {id:'zzadd1', name:'Test Addedplayer', kind:'H', elig:'OF', val:0, pick:null, added:true};
const addedKeep = {pid:'zzadd1', name:added.name, team:team2, price:3, keeper:true, taxi:false, t:1794000000003};
const taxiRow = {pid:String(P[2].id), name:P[2].name, team, round:2};
const hat = {club:'NYY', idx:4, done:['BAL','BOS']};

// 1a: no auction sales yet (the branch that used to reset to the new seed)
{
  const saved = JSON.parse(JSON.stringify(fresh));
  saved.seedVer = 'old-seed.0';
  saved.picks = [declared, taxiPick, ...baked, addedKeep];
  saved.players.push(added);
  saved.taxi = [taxiRow]; saved.hat = hat;
  await ev(`localStorage.setItem('cthl-auction', ${JSON.stringify(JSON.stringify(saved))})`);
  await go('?room=local');
  const s = await ev(`({picks:S.picks, taxi:S.taxi, hat:S.hat, seedVer:S.seedVer, addedIn:S.players.some(p=>p.id==='zzadd1'), declPick:(S.players.find(p=>String(p.id)===${JSON.stringify(declared.pid)})||{}).pick})`);
  const mine = [declared, taxiPick, addedKeep].map(key);
  const have = s.picks.map(key);
  check('1a bump, no sales: declared keeper / taxi-flag pick / added-player keeper survive', mine.every(k => have.includes(k)), JSON.stringify({mine, have:have.slice(0,6)}));
  check('1a order kept: carried picks stay in saved order', JSON.stringify(have.filter(k => mine.includes(k))) === JSON.stringify(mine), have.join(' , '));
  check('1a taxi list and hat survive', JSON.stringify(s.taxi) === JSON.stringify([taxiRow]) && JSON.stringify(s.hat) === JSON.stringify(hat), JSON.stringify({taxi:s.taxi, hat:s.hat}));
  check('1a added player kept in pool; p.pick rebuilt', s.addedIn && s.declPick && s.declPick.team === team, JSON.stringify(s.declPick));
  check('1a adopts new seed version', s.seedVer === SEED_VER, s.seedVer);
}
// 1b: auction underway on an older seed: everything kept byte-for-byte, same order
{
  const saved = JSON.parse(JSON.stringify(fresh));
  saved.seedVer = 'old-seed.0';
  const sale1 = {pid:String(P[3].id), name:P[3].name, team, price:41, keeper:false, taxi:false, t:1794000000010};
  const sale2 = {pid:String(P[4].id), name:P[4].name, team:team2, price:12, keeper:false, taxi:false, t:1794000000011};
  saved.picks = [sale2, declared, ...baked, sale1];
  saved.taxi = [taxiRow]; saved.hat = hat;
  await ev(`localStorage.setItem('cthl-auction', ${JSON.stringify(JSON.stringify(saved))})`);
  await go('?room=local');
  const s = await ev(`({picks:S.picks, taxi:S.taxi})`);
  check('1b bump mid-auction: every pick kept, same order', JSON.stringify(s.picks.map(key)) === JSON.stringify(saved.picks.map(key)), `${saved.picks.length} saved vs ${s.picks.length} now`);
  check('1b taxi list kept', JSON.stringify(s.taxi) === JSON.stringify([taxiRow]), JSON.stringify(s.taxi));
}

/* ---------------- 2. room, simulated SEED_VER bump ---------------- */
const ROOM = 'zz-test-seed-safety-fake';
const roomSale = {pid:String(P[5].id), name:P[5].name, team:'Domers', price:33, keeper:false, taxi:false, t:1794000000020};
const roomPicks = {}; [...baked.slice(0,10), roomSale].forEach(k => { roomPicks[k.pid] = k; });
const roomTaxi = {[taxiRow.pid]: taxiRow};
const localStale = (() => { const s = JSON.parse(JSON.stringify(fresh)); s.picks = [...baked, {pid:roomSale.pid, name:roomSale.name, team:'BozOs', price:5, keeper:false, taxi:false, t:1}]; return s; })();
async function roomCase(roomSeed, label){
  ROOMDB = {meta:{seedVer:roomSeed, lastWriter:'device-room', t:1}, picks:JSON.parse(JSON.stringify(roomPicks)), taxi:JSON.parse(JSON.stringify(roomTaxi)), hat:{idx:0}};
  writes.length = 0; dialogs.length = 0;
  await ev(`localStorage.removeItem('cthl-sync-pending'); localStorage.setItem('cthl-auction', ${JSON.stringify(JSON.stringify(localStale))})`);
  await go('?room=' + ROOM, 6000);
  // poke every write path: a plain save(), then an attempted sale
  await ev(`save()`); await sleep(1500);
  const target = P[6];
  await ev(`(()=>{ try{ openPick(${JSON.stringify(target.id)}); const s=$('dlgTeam'); s.value='Dealers'; s.dispatchEvent(new Event('change')); const i=$('dlgPrice'); i.value='9'; i.dispatchEvent(new Event('input',{bubbles:true})); confirmPick(); }catch(e){ return String(e); } })()`);
  await sleep(2500);
  return {
    s: await ev(`({picks:S.picks.map(k=>k.pid+'|'+k.team+'|'+k.price), mismatch:SY.seedMismatch, canWrite:SY.canWrite, taxi:S.taxi})`),
    room: JSON.parse(JSON.stringify(ROOMDB)), writes: [...writes], dialogs: [...dialogs], target: String(target.id)
  };
}
{
  const r = await roomCase('old-seed.0', 'bump');
  const roomKeys = Object.values(roomPicks).map(k => k.pid+'|'+k.team+'|'+k.price).sort();
  check('2a room on older seed: device goes read-only (seedMismatch)', r.s.mismatch === true && r.s.canWrite === false, JSON.stringify({mismatch:r.s.mismatch, canWrite:r.s.canWrite}));
  check('2a room board shown, stale local board dropped (room picks win)', JSON.stringify([...r.s.picks].sort()) === JSON.stringify(roomKeys), `local now: ${r.s.picks.length}, room: ${roomKeys.length}; sale shows as ${r.s.picks.find(x=>x.startsWith(roomSale.pid))}`);
  check('2a nothing written to the room (no stale pick push, meta.seedVer untouched)', r.writes.length === 0 && r.room.meta.seedVer === 'old-seed.0', r.writes.join(', '));
  check('2a room picks unchanged', JSON.stringify(r.room.picks) === JSON.stringify(roomPicks) && JSON.stringify(r.room.taxi) === JSON.stringify(roomTaxi), 'room data changed');
  check('2a sale entry blocked with a message', !r.s.picks.some(x => x.startsWith(r.target+'|')) && r.dialogs.some(m => /different player pool/.test(m)), JSON.stringify(r.dialogs));
}
{
  const r = await roomCase(SEED_VER, 'same');
  check('2b control, same seed: sale is written, room picks kept', r.room.picks[r.target] && r.room.picks[r.target].team === 'Dealers' && Object.keys(roomPicks).every(k => JSON.stringify(r.room.picks[k]) === JSON.stringify(roomPicks[k])), r.writes.join(', '));
}

{
  // 2c: room with no picks yet, this device has sales but no keepers: sales stay, baked keepers added alongside
  const sale = {pid:String(P[7].id), name:P[7].name, team, price:21, keeper:false, taxi:false, t:1794000000030};
  const local = JSON.parse(JSON.stringify(fresh)); local.picks = [sale];
  ROOMDB = {meta:{seedVer:SEED_VER, lastWriter:'device-room', t:1}};
  await go('?room=local', 2500); writes.length = 0;
  await ev(`localStorage.removeItem('cthl-sync-pending'); localStorage.setItem('cthl-auction', ${JSON.stringify(JSON.stringify(local))})`);
  await go('?room=' + ROOM, 6000);
  const s = await ev(`S.picks.map(k=>k.pid+'|'+k.team+'|'+k.price)`);
  check('2c empty room: local sale kept, baked keepers added alongside', s.includes(sale.pid+'|'+team+'|21') && s.length === 1 + baked.filter(b => b.pid !== sale.pid).length, `${s.length} picks; sale ${s.includes(sale.pid+'|'+team+'|21') ? 'kept' : 'LOST'}`);
}

check('no page errors', errs.length === 0, errs.join('\n      '));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
ws.close(); chrome.kill(); srv.close(); process.exit(fails ? 1 : 0);

