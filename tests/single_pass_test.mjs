#!/usr/bin/env node
/* Headless acceptance test for the AAV single pass
   (/workspace/db2027/specs/single-pass-aav-spec-2026-11-14.md).
   Loads index.html in headless Chrome (fresh profile, file://) over the
   DevTools protocol and checks every acceptance item against the app itself.
   Run: node tests/single_pass_test.mjs [--v31 path/to/aav_2027_v3_1.csv]
   Needs node >= 22 (built-in WebSocket) and google-chrome. */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const V31 = argv.includes('--v31') ? argv[argv.indexOf('--v31') + 1] : '/workspace/db2027/excel_method/aav_2027_v3_1.csv';
const CHROME = process.env.CHROME || 'google-chrome';

let pass = 0, fail = 0;
const ok = (cond, label, detail = '') => {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
};

/* ---------- v3.1 reference board ---------- */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/), out = [];
  const split = l => { const r = []; let cur = '', q = false;
    for (const c of l) { if (c === '"') q = !q; else if (c === ',' && !q) { r.push(cur); cur = ''; } else cur += c; }
    r.push(cur); return r; };
  const head = split(lines[0]);
  for (const l of lines.slice(1)) { const c = split(l); out.push(Object.fromEntries(head.map((h, i) => [h, c[i]]))); }
  return out;
}
const v31 = parseCSV(readFileSync(V31, 'utf8'));
const report = JSON.parse(readFileSync(join(ROOT, 'reports/single_pass_aav_2026-11-14.json'), 'utf8'));
const reportMd = readFileSync(join(ROOT, 'reports/single_pass_aav_2026-11-14.md'), 'utf8');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

/* ---------- winter rerun command: latest run report + CSV ---------- */
const SCRIPT = join(ROOT, 'tools/aav_single_pass.py');
const runs = readdirSync(join(ROOT, 'reports')).filter(f => /^aav_run_.*\.csv$/.test(f)).sort();
const lastRun = runs.at(-1);
const runCsv = lastRun ? parseCSV(readFileSync(join(ROOT, 'reports', lastRun), 'utf8')) : [];
const runMd = lastRun ? readFileSync(join(ROOT, 'reports', lastRun.replace(/\.csv$/, '.md')), 'utf8') : '';
ok(!!lastRun, 'a dated run CSV + report exist in reports/', lastRun || 'none');
{
  const kSal = runCsv.filter(r => r.status === 'keeper').reduce((s, r) => s + Number(r.keeper_salary), 0);
  const nk = runCsv.filter(r => r.status !== 'keeper').reduce((s, r) => s + Number(r.aav), 0);
  ok(kSal + nk === 2570 && runCsv.filter(r => r.status !== 'none').length === 250,
    `run CSV cash: $${kSal} keepers + $${nk} non-keeper = $${kSal + nk}; 250 slots`);
  ok(/^Pot: solved \$[\d,.]+ \(H \$[\d,.]+ \/ P \$[\d,.]+\) \| reference 2570 x 1\.1689 = \$3,004\.07 .*\| implied inflation \d\.\d{4} /m.test(runMd),
    'run report has the pot line: solved (H/P), 2570 x 1.1689 reference, implied inflation');
  ok(/\*\*\$2,570\*\*/.test(runMd) && /## Diff vs previous\n\n\d+ moved .*\d+ added, \d+ dropped vs /.test(runMd), 'run report shows cash $2,570 and the diff-vs-previous summary');
}
{
  const blk = JSON.parse(html.match(/const AAV_2027 = (\{.*?\});\n/)[1]), bad = [];
  for (const r of runCsv) {
    const b = blk[r.pool_id], n = Number(r.aav);
    const good = b && (r.status === 'keeper' ? b.k === n && b.a == null : r.status === 'stash' ? b.a === 1 && b.s === 1 : b.a === n && b.k == null);
    if (!good) bad.push(`${r.player} ${r.status} ${n} vs ${JSON.stringify(b)}`);
  }
  ok(bad.length === 0 && runCsv.length === Object.keys(blk).length, `index.html AAV_2027 = latest run CSV for all ${runCsv.length} pool players`, bad.slice(0, 5).join('; '));
}
ok(/^CUTOFF_DATE = '2027-03-15'/m.test(readFileSync(SCRIPT, 'utf8')), 'CUTOFF_DATE default is 2027-03-15 (AAV lock after LABR 2027)');

/* cutoff gate + write path, in a temp copy (repo files untouched) */
{
  const tmp = mkdtempSync(join(tmpdir(), 'cthl-run-')); copyFileSync(join(ROOT, 'index.html'), join(tmp, 'index.html'));
  const { CTHL_AAV_CUTOFF: _, ...baseEnv } = process.env;   // no env override unless a check sets one
  const py = (env, ...a) => spawnSync('python3', [SCRIPT, '--root', tmp, ...a],
    { env: { ...baseEnv, PYTHONDONTWRITEBYTECODE: '1', ...env }, encoding: 'utf8' });
  const written = () => existsSync(join(tmp, 'reports')) ? readdirSync(join(tmp, 'reports')) : [];
  let r = py({ CTHL_AAV_CUTOFF: '2020-01-01' }, '--write');
  ok(r.status === 3 && /refusing to write.*after the cutoff 2020-01-01/.test(r.stderr) && written().length === 0,
    'past cutoff: --write refused, nothing written', `exit ${r.status}`);
  r = py({ CTHL_AAV_CUTOFF: '2020-01-01' }, '--write', '--override');
  const w1 = written();
  ok(r.status === 0 && w1.length === 2 && readFileSync(join(tmp, 'index.html'), 'utf8') === html && /index\.html unchanged/.test(r.stdout),
    'past cutoff + --override: writes run .md/.csv; index.html byte-identical (no price changed)', `exit ${r.status}, ${w1.join(' ')}`);
  const m1 = w1.length ? readFileSync(join(tmp, 'reports', w1.find(f => f.endsWith('.md'))), 'utf8') : '';
  ok(/vs v3\.1 baseline .* \(first run\)/.test(m1) && /PASSED, written with --override/.test(m1), 'first run diffs vs the v3.1 baseline; report notes the override');
  r = py({}, '--write');   // default CUTOFF_DATE, today before it
  const w2 = written(), md2 = w2.filter(f => f.endsWith('.md') && !w1.includes(f));
  const m2 = md2.length ? readFileSync(join(tmp, 'reports', md2[0]), 'utf8') : '';
  ok(r.status === 0 && w2.length === 4 && /_\d{4}\.md$/.test(md2[0] || '') && /0 moved \(max \$0\), 0 added, 0 dropped vs previous run `reports\/aav_run_[\d-]+\.csv`/.test(m2)
    && /Cutoff: 2027-03-15 \(not reached\)/.test(m2),
    'default cutoff 2027-03-15, today before it: --write works; second run same day gets _HHMM and diffs vs the previous run (0 moved)', `exit ${r.status}, ${md2.join(' ')}`);
  r = py({}, '--projections', 'atc', '--atc-dir', join(tmp, 'no-atc-here'));
  ok(r.status === 2 && /ATC 2027 data not found/.test(r.stderr) && !/^Pot:/m.test(r.stdout), '--projections atc without ATC data fails clearly (no values)');
  rmSync(tmp, { recursive: true, force: true });
}

/* ---------- headless Chrome over CDP ---------- */
const prof = mkdtempSync(join(tmpdir(), 'cthl-sp-'));
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
  '--remote-debugging-port=0', `--user-data-dir=${prof}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((res, rej) => {
  let buf = ''; const t = setTimeout(() => rej(new Error('chrome did not start')), 20000);
  chrome.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); res(m[1]); } });
});
const port = new URL(wsUrl).port;
const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0; const waiting = new Map(), errors = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise(r => { const id = ++seq; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expr => {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result.result.value;
};
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: 'file://' + join(ROOT, 'index.html') });
for (let i = 0; i < 100; i++) {
  await new Promise(r => setTimeout(r, 200));
  try { if (await evaluate(`return !!(window.S || (typeof S!=='undefined' && S)) && S.players.length>0 && document.readyState==='complete'`)) break; } catch (e) {}
}

try {
  /* ---------- pull the board as the app sees it ---------- */
  const app = await evaluate(`
    const kept = S.players.filter(p=>p.pick && p.pick.keeper);
    const seedName = Object.fromEntries(SEED2026.players.map(p=>[p.id,p.name]));   // v3.1 CSV uses seed names (pre-PRENAME)
    return {
      seedVer: SEED_VER,
      players: S.players.map(p=>({id:p.id, name:seedName[p.id]||p.name, team:p.team, a:AAV_2027[p.id]||null,
        kept: !!(p.pick && p.pick.keeper), salary: p.pick && p.pick.keeper ? Number(p.pick.price) : null,
        rank$: aav27Num(p)})),
      blockIds: Object.keys(AAV_2027).length,
      keeperCount: kept.length,
    };`);
  ok(app.seedVer === '2027-actuals.7', 'SEED_VER stays 2027-actuals.7', app.seedVer);

  const byName = new Map();
  for (const p of app.players) { if (!byName.has(p.name)) byName.set(p.name, []); byName.get(p.name).push(p); }
  const find = r => { const c = (byName.get(r.player) || []).filter(p => p.a); return c.length === 1 ? c[0] : c.find(p => p.team === r.team) || c[0]; };

  /* 1. non-keeper prices vs v3.1 */
  let maxDiff = 0, moved = 0, compared = 0, missing = [];
  const movedList = [];
  for (const r of v31) {
    if (r.kept) continue;
    const want = Number(r['CTHL AAV'] || 0); if (!(want > 0)) continue;
    const p = find(r); if (!p) { missing.push(r.player); continue; }
    const got = p.a.a || 0; compared++;
    const d = Math.abs(got - want); if (d) { moved++; movedList.push(`${r.player} ${want}->${got}`); }
    maxDiff = Math.max(maxDiff, d);
  }
  ok(missing.length === 0, 'every v3.1 priced non-keeper is on the board', missing.join(', '));
  ok(compared === 202 && maxDiff <= 1, `non-keeper prices vs v3.1: max diff $${maxDiff} (<= $1), ${moved} of ${compared} moved`, movedList.slice(0, 10).join('; '));
  ok(report.vs_v31.moved === moved && report.vs_v31.max_abs === maxDiff, 'report diff vs v3.1 matches the app board',
    `report max $${report.vs_v31.max_abs}, moved ${report.vs_v31.moved}`);

  /* 2. keeper values (board k and the app's rank $) */
  const want = { 'Nick Kurtz': 48, 'Julio Rodriguez': 39, 'Cam Schlittler': 37, 'Ben Rice': 37, 'Logan Gilbert': 37 };
  for (const [n, w] of Object.entries(want)) {
    const p = (byName.get(n) || []).find(p => p.kept);
    ok(p && Math.abs(p.a.k - w) <= 1 && Math.abs(p.rank$ - w) <= 1, `keeper value ${n} = $${w} (±$1)`, p ? `board k $${p.a.k}, app rank $${p.rank$}` : 'not kept');
  }
  let kMax = 0;
  for (const r of v31) if (r.kept) {
    const p = (byName.get(r.player) || []).find(p => p.kept);
    if (p) kMax = Math.max(kMax, Math.abs(p.a.k - Number(r['keeper display $'])));
  }
  ok(kMax <= 1, `all 48 keeper values within $1 of the v3.1 display`, `max diff $${kMax}`);

  /* 3. cash check: keeper salaries + non-keeper AAVs = $2,570 exactly; 250 slots */
  const kept = app.players.filter(p => p.kept);
  const sal = kept.reduce((s, p) => s + p.salary, 0);
  const auction = app.players.filter(p => !p.kept && p.a).reduce((s, p) => s + (p.a.a || 0), 0);
  const slots = kept.length + app.players.filter(p => !p.kept && p.a && p.a.a > 0).length;
  ok(kept.length === 48 && sal === 467, `48 keepers / $467 salary in the app`, `${kept.length} / $${sal}`);
  ok(kept.every(p => p.a && p.a.k != null && p.a.a == null), 'every keeper carries only its keeper AAV (never cash)');
  ok(sal + auction === 2570, `cash check: $${sal} keepers + $${auction} non-keeper AAVs = $${sal + auction}`, 'must be exactly $2,570');
  ok(slots === 250, `250 slots priced on the board`, String(slots));
  ok(report.cash_check === 2570, 'report cash check = $2,570');

  /* 4. pots: solved vs the pre-final 1.1689 pot, side by side */
  const sp = report.solved_pot, pf = report.prefinal_pot;
  ok(Math.abs(sp.total - 3041.48) < 0.01 && Math.abs(sp.H - 2233.12) < 0.01 && Math.abs(sp.P - 808.37) < 0.01,
    `solved pot $${sp.total.toFixed(2)} (H $${sp.H.toFixed(2)} / P $${sp.P.toFixed(2)})`, 'spec: $3,041.48 = $2,233.12 / $808.37');
  ok(pf.rate === 1.1689 && Math.abs(pf.total - 2570 * 1.1689) < 0.01, `pre-final pot 2570 x 1.1689 = $${pf.total.toFixed(2)}`);
  const lines = reportMd.split('\n'), iS = lines.findIndex(l => /Solved/.test(l) && l.includes('$3,041.48')),
    iR = lines.findIndex(l => l.includes('1.1689') && l.includes('$3,004.07'));
  ok(iS >= 0 && iR === iS + 1 && lines[iS].startsWith('|') && lines[iR].startsWith('|'),
    'report shows the 1.1689 pot next to the solved pot (adjacent rows, one table)');
  ok(/Pot: solved \$3,041\.48.*\n.*pre-final 2570 x 1\.1689 = \$3,004\.07/.test(html), 'AAV_2027 block header names both pots');

  /* 5. keeper scenarios: cap-respecting only, each reconciles */
  const sc = report.scenarios;
  ok(!('50u' in sc) && Object.values(sc).every(s => s.max_per_team <= 5), `scenarios ${Object.keys(sc).join('/')} all within 5 keepers/team; 50u not run`);
  ok(Object.values(sc).every(s => s.cash_check === 2570), 'every scenario cash check = $2,570');

  /* 6. sold box opens blank (and the corner AAV is hidden while entering a sale) */
  const sold = await evaluate(`
    const ids = S.players.filter(p=>!p.pick && AAV_2027[p.id] && AAV_2027[p.id].a>0).map(p=>p.id);
    const bad = [];
    for (const id of ids) {
      openPick(id);
      const v = document.getElementById('dlgPrice').value;
      const hidden = document.getElementById('dlgAav').parentElement.style.display==='none';
      if (v!=='' || !hidden) bad.push(id+':'+v);
      document.getElementById('pickDlg').close();
    }
    return {n: ids.length, bad};`);
  ok(sold.n > 0 && sold.bad.length === 0, `sold box opens blank for all ${sold.n} priced, undrafted players`, sold.bad.slice(0, 5).join(', '));

  /* 7. no $ on card backs (every player, keepers included) */
  const backs = await evaluate(`
    const bad = [];
    for (const p of S.players) { cardBack(p); const t = document.getElementById('cardBack').textContent; if (t.includes('$')) bad.push(p.name); }
    return {n: S.players.length, bad};`);
  ok(backs.bad.length === 0, `no $ on any card back (${backs.n} players)`, backs.bad.slice(0, 5).join(', '));

  /* 8. no $ on the printed list (Draft List): only the $$$ write-in header,
        and an owned row's actual sale/keeper price — never an AAV */
  const dl = await evaluate(`
    const clubs = [...new Set(S.players.map(p=>p.team))];
    const bad = []; let rows = 0;
    for (const c of clubs) {
      dlSet(c);
      const sheet = document.getElementById('dlSheet');
      sheet.querySelectorAll('.dlrow').forEach(r=>{
        rows++;
        const p = S.players.find(x=>x.id===r.dataset.pid), m = r.querySelector('.dlm').textContent;
        const k = p.pick, expect = (k && k.team && !k.taxi && k.price!=null && k.price!=='' && !(k.keeper && !(Number(k.price)>0))) ? '$'+k.price : '';
        if (m !== expect || r.textContent.replace(m,'').includes('$')) bad.push(p.name+':'+m);
      });
      const txt = sheet.textContent.split('$$$').join('');
      const extra = (txt.match(/\\$\\d+/g)||[]).length, owned = [...sheet.querySelectorAll('.dlrow .dlm')].filter(e=>e.textContent).length;
      if (extra !== owned) bad.push(c+': stray $');
    }
    return {rows, bad};`);
  ok(dl.rows > 0 && dl.bad.length === 0, `no AAV $ on the printed Draft List (${dl.rows} rows; only owner-entered prices)`, dl.bad.slice(0, 5).join(', '));

  ok(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
  ok(false, 'test harness', e.stack || String(e));
} finally {
  ws.close(); const gone = new Promise(r => chrome.once('exit', r)); chrome.kill(); await gone;
  try { rmSync(prof, { recursive: true, force: true, maxRetries: 5 }); } catch (e) {}
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
