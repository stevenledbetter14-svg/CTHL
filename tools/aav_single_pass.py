#!/usr/bin/env python3
"""CTHL AAV single pass: the ONE winter rerun command (Eno spec 2026-11-14,
specs/single-pass-aav-spec-2026-11-14.md; rerun requirements Steven via Eno 11/14).

USAGE (from the repo root)
  PYTHONDONTWRITEBYTECODE=1 python3 tools/aav_single_pass.py [--write] [--override] [--projections steamer|atc]

  (no flags)          rebuild values from the current pool + projections, print the
                      run report and the diff vs the previous run; writes nothing.
  --write             also write reports/aav_run_YYYY-MM-DD[_HHMM].md + .csv and, only
                      if any price changed, the AAV_2027 block in data/aav-2027.js.
  --override          allow --write after CUTOFF_DATE (below; 2027-03-15, the AAV lock).
  --projections atc   use ATC 2027 instead of Steamer. Needs ATC_DIR/2027_bat.json and
                      2027_pit.json (FanGraphs JSON export, same format as the Steamer
                      pull). Missing -> the run stops; it never falls back to Steamer.
  --root DIR          where data/ and reports/ live (default: this repo; tests use a copy).

  Winter refresh order: drop new projection JSON in /workspace/db2027/steamer (or atc/),
  run steamer/match.py and steamer/valuation.py there, then this script. If the stored
  pool values don't match the JSON, the run stops and says so.

WHERE TO EDIT
  * Likely keepers: KEEPERS_CSV below (11/20 set, 48 / $512, same set as the
    app's SEED2026.picks and the v3.1 engine). From 2026-11-24 the official
    room and the seed are the keeper source of record. Columns used: pid,
    owner, keeper_salary, kind. If you change it, also change SEED2026.picks in
    data/seed-2027.js (+ BAKED_KEEPER_SET in index.html); --write refuses while the two disagree.
  * Cutoff: CUTOFF_DATE below, the AAV lock right after LABR 2027. Currently 2027-03-15,
    a placeholder until LABR publishes its date; move that one value. Env
    CTHL_AAV_CUTOFF overrides it (tests only).

METHOD (unchanged v3.1 mechanics, aav_v3.calculate): 75/25 H/P (pots $1,928 / $642,
172H / 78P slots), paid cohort + replacement SGP, gamma 1.40 / 1.55, K/BB tilt inside
the pitcher score, $31 RP ceiling, $2 floor, 12 $1 stashes (Ike Irish swap, Steven
11/6), largest-remainder rounding of the paid non-keepers to their exact cash.
ONE pass prices all 250 slots per side, keepers included; the pot is solved per side so
the non-keeper AAVs total exactly $2,570 - keeper salaries. A keeper's curve price is
display only (never cash) and is rounded on its own, so it can never move the cash total.
Reference pot (before keepers are final): 2570 x 1.1689 (keeper inflation 2025/2026 avg).

Each run diffs against the previous reports/aav_run_*.csv; the first run diffs against
the v3.1 baseline (excel_method/aav_2027_v3_1.csv). Reads, never writes, /workspace/db2027.
"""
import sys, os, csv, json, re, argparse, warnings
from collections import Counter
from dataclasses import replace
from datetime import date, datetime
from pathlib import Path
warnings.filterwarnings('ignore')

# ==================== CONFIG — edit here ====================
# AAV lock: set right after LABR 2027. PLACEHOLDER until LABR publishes its date; move this
# one value then (it is the only place the date lives). After it, --write needs --override.
CUTOFF_DATE = '2027-03-15'
DB = Path('/workspace/db2027')
KEEPERS_CSV = DB / 'keepers/keeper_split_2026-11-20_room.csv'   # the likely-keeper list
ATC_DIR = DB / 'atc'               # expects 2027_bat.json + 2027_pit.json
V31_BASELINE = DB / 'excel_method/aav_2027_v3_1.csv'
STASH_SWAP_IN = 'Ike Irish'        # Steven 11/6 (AFL): replaces the lowest-ranked of the 12 stashes
BASIS = 2570
RATE_2025, RATE_2026 = 1.1704, 1.1673
RATE = 1.1689                      # avg, as published in keeper_inflation_2026-11-14.md
CAP = 5                            # keepers per team
# =============================================================

ROOT = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser(description='CTHL AAV single pass winter rerun (see the docstring for usage).')
ap.add_argument('--write', action='store_true', help='write the run report/CSV and, if prices changed, data/aav-2027.js')
ap.add_argument('--override', action='store_true', help='allow --write after CUTOFF_DATE')
ap.add_argument('--projections', choices=['steamer', 'atc'], default='steamer')
ap.add_argument('--engine', default=str(DB / 'excel_method'), help='v3.1 engine dir')
ap.add_argument('--keepers', default=str(KEEPERS_CSV), help='likely-keeper CSV')
ap.add_argument('--atc-dir', default=str(ATC_DIR))
ap.add_argument('--root', default=str(ROOT), help='dir holding data/ and reports/')
args = ap.parse_args()
OUT = Path(args.root)


def die(msg, code=2):
    print('aav_single_pass: ' + msg, file=sys.stderr); sys.exit(code)


# ---------- cutoff gate (before any work) ----------
cutoff = os.environ.get('CTHL_AAV_CUTOFF', CUTOFF_DATE).strip()
if cutoff:
    try: cutoff_d = date.fromisoformat(cutoff)
    except ValueError: die(f'CUTOFF_DATE {cutoff!r} is not YYYY-MM-DD')
    past_cutoff = date.today() > cutoff_d
else:
    cutoff_d, past_cutoff = None, False
if args.write and past_cutoff and not args.override:
    die(f'refusing to write: today {date.today()} is after the cutoff {cutoff_d}. '
        'Values are frozen; rerun with --override to write anyway.', 3)
cutoff_note = ('none' if not cutoff_d else
               f"{cutoff_d} ({'PASSED, written with --override' if past_cutoff and args.write else 'passed' if past_cutoff else 'not reached'})")

# ---------- projections present? (ATC never fakes it) ----------
if args.projections == 'atc':
    atc = Path(args.atc_dir)
    missing = [f for f in ('2027_bat.json', '2027_pit.json') if not (atc / f).is_file()]
    if missing:
        die(f"--projections atc: ATC 2027 data not found ({', '.join(str(atc / f) for f in missing)}). "
            'Export ATC 2027 batters/pitchers from FanGraphs as JSON (same format as steamer/2027_*.json) '
            'into that dir. Note /workspace/fantasy-baseball/inspect/ATC Projections.xlsx is 2026 '
            'preseason ATC with no MLBAM ids; it is not usable. No values were computed.')

ENG = Path(args.engine); sys.path.insert(0, str(ENG))
import numpy as np
import aav_v3 as v
v2 = v.v2

POTS, SLOTS, GAMMA = v2.POTS, v2.SLOTS, v2.GAMMA
assert POTS == {'H': 1928, 'P': 642} and sum(POTS.values()) == BASIS and SLOTS == {'H': 172, 'P': 78}
assert abs((RATE_2025 + RATE_2026) / 2 - RATE) < 1e-4   # published avg uses unrounded yearly rates

# ---------- pool + Steamer (v3.1 inputs, identical to aav_v3_1.py) ----------
try:
    ps, rows, valid, scores, ranks, _, team_bb = v2.raw_current()
except AssertionError as e:
    die('the pool values (steamer/values_2027_steamer.csv) do not match the projection JSON '
        f'(steamer/2027_bat.json, 2027_pit.json): {str(e)[:300]}. Rerun steamer/match.py and '
        'steamer/valuation.py in /workspace/db2027 first.')


def raw_scores(bat_rows, pit_rows):
    """The exact unpadded SGP equations of aav_v2.raw_current (K/BB tilt in the pitcher term),
    on any FanGraphs-format projection set. Returns (valid, scores, team_bb, side_mismatch)."""
    def mid(r):
        v = (r.get('fg_mlbam') or '').strip()
        if not v: return None
        try: return int(float(v))
        except ValueError: return v
    match = {r['pool_id']: r for r in csv.DictReader((DB / 'steamer/match_report.csv').open())}
    poolids = {mid(r) for r in match.values() if mid(r) is not None}
    def al(x):
        if x['League'] == 'AL': return True
        if x.get('xMLBAMID') and int(x['xMLBAMID']) in poolids: return True
        if x.get('playerid') and x['playerid'] in poolids: return True
        return False
    def index_side(rr):
        d = {}
        for x in rr:
            if x.get('xMLBAMID') and al(x):
                d[int(x['xMLBAMID'])] = x
            elif not x.get('xMLBAMID') and x.get('playerid') in poolids:
                d[x['playerid']] = x
        return d
    bat = index_side(bat_rows)
    pit = index_side(pit_rows)
    top = sorted(pit.values(), key=lambda x: -x['IP'])[:78]
    bb = sum(x['BB'] for x in top) / sum(x['IP'] for x in top) * 862
    raw, roles = {}, {}
    for i in set(bat) | set(pit):
        role = 'P' if (pit.get(i, {}).get('IP', 0) >= 20 and bat.get(i, {}).get('PA', 0) < 100) or i not in bat else 'H'
        roles[i] = role
        if role == 'H':
            x = bat[i]; raw[i] = (x['H'] - .2444 * x['AB']) / 6378 / .002 + x['HR'] / 6.25 + x['R'] / 17.7 + x['RBI'] / 18 + x['SB'] / 6.43
        else:
            x = pit[i]; raw[i] = (3.822 * x['IP'] / 9 - x['ER']) * 9 / 862 / .123 + (x['SO'] - 3.02 * x['BB']) / bb / .078 + x['SV'] / 5.99 + x['W'] / 1.75
    val, sc, mismatch = {}, {}, []
    for p in ps:
        i = int(rows[p.id]['mlbam']) if rows[p.id]['mlbam'] else mid(match.get(p.id, {}))
        if i in raw:
            if roles[i] != p.side: mismatch.append(p.name); continue    # projected on the other side: no line
            sc[p.id] = raw[i]; val[p.id] = bat[i] if p.side == 'H' else pit[i]
    return val, sc, bb, mismatch


# self-check: the scorer reproduces the engine's Steamer scores bit for bit (so ATC uses the same math)
_load = lambda d: (json.loads((d / '2027_bat.json').read_text()), json.loads((d / '2027_pit.json').read_text()))
_v, _s, _bb, _mm = raw_scores(*_load(DB / 'steamer'))
assert _s == scores and _bb == team_bb and not _mm and all(_v[i] is valid[i] or _v[i] == valid[i] for i in valid)
side_mismatch = []
if args.projections == 'atc':
    b, p_ = _load(Path(args.atc_dir))
    need = {'xMLBAMID', 'League', 'PA', 'AB', 'H', 'HR', 'R', 'RBI', 'SB'}, {'xMLBAMID', 'League', 'IP', 'ER', 'SO', 'BB', 'SV', 'W', 'G', 'GS'}
    for name, rr, cols in (('2027_bat.json', b, need[0]), ('2027_pit.json', p_, need[1])):
        gone = cols - set(rr[0] if rr else {})
        if gone: die(f'ATC {name} is missing columns {sorted(gone)}; expected the FanGraphs JSON export format.')
    valid, scores, team_bb, side_mismatch = raw_scores(b, p_)
PROJ_LABEL = {'steamer': 'Steamer 2027 (steamer/2027_bat.json, 2027_pit.json)',
              'atc': f'ATC 2027 ({args.atc_dir}/2027_bat.json, 2027_pit.json)'}[args.projections]

# ---------- likely keepers ----------
byname = {p.name: p for p in ps}; byid = {p.id: p for p in ps}
kpath = Path(args.keepers)
if not kpath.is_file(): die(f'keeper list not found: {kpath}')
krows = list(csv.DictReader(kpath.open()))
bad = [r.get('pid') for r in krows if r.get('pid') not in byid]
if bad: die(f'keeper list {kpath.name}: pid not in the pool: {bad}')
for r in krows:
    if r['kind'] != byid[r['pid']].side: die(f"keeper list: {r['player']} kind {r['kind']} but pool side {byid[r['pid']].side}")
keepers = {r['pid']: float(r['keeper_salary']) for r in krows}
owner = {r['pid']: r['owner'] for r in krows}
if len(keepers) != len(krows): die('keeper list has duplicate pids')
per_team = Counter(owner.values())
if per_team and max(per_team.values()) > CAP: die(f'keeper list breaks the {CAP}-per-team cap: {per_team.most_common(3)}')
ps = [replace(p, keeper=p.id in keepers, salary=keepers.get(p.id, 0.)) for p in ps]
byname = {p.name: p for p in ps}; byid = {p.id: p for p in ps}

# app's baked keeper set must be the same list (else the app's cash check can't total $2,570)
# (the baked data blocks live in data/*.js since 2026-11-16, not in index.html)
seed_path, aav_path = OUT / 'data' / 'seed-2027.js', OUT / 'data' / 'aav-2027.js'
seed = json.loads(re.search(r'const SEED2026 = (\{.*?\});\n', seed_path.read_text(encoding='utf-8')).group(1))
aav_js = aav_path.read_text(encoding='utf-8')
app_k = {k['pid']: float(k['price']) for k in seed.get('picks', []) if k.get('keeper')}
app_match = app_k == keepers

# ---------- $1 stashes (v3.1: 12 top-ranked zero-base AL prospects, Irish swap) ----------
fixed = v.stash_ids(ps, ranks, rows)
irish = byname[STASH_SWAP_IN]
if irish.id not in fixed and not irish.keeper:
    removed = max([p for p in ps if p.id in fixed], key=lambda p: (ranks[rows[p.id]['mlbam']], p.id))
    fixed.remove(removed.id); fixed.add(irish.id)
isrp = lambda p: p.side == 'P' and p.id in valid and v2.rp_type(valid[p.id])


def curve(keepers, pots):
    """ONE pass per side over all slots at `pots`. keepers: {id: salary}.
    Returns {id: (kind, unrounded $)} and per-side meta."""
    P = {p.id: replace(p, keeper=p.id in keepers, salary=float(keepers.get(p.id, 0.))) for p in ps}
    assert not (set(keepers) & fixed), 'keeper in stash set'
    out, meta = {}, {}
    for side in 'HP':
        kept = [p for p in P.values() if p.side == side and p.keeper]
        stash = [p for p in P.values() if p.side == side and p.id in fixed]
        need = SLOTS[side] - len(kept) - len(stash)
        elig = sorted([p for p in P.values() if p.side == side and not p.keeper and p.id not in fixed and p.id in valid],
                      key=lambda p: (-scores[p.id], p.id))
        chosen = elig[:need]; repl = scores[elig[need].id]
        wt = lambda p: max(scores.get(p.id, float('-inf')) - repl, 0) ** GAMMA[side]
        kpos = [p for p in kept if wt(p) > 0]; kzero = [p for p in kept if wt(p) == 0]
        pool = chosen + kpos
        caps = [v.RP_CAP if isrp(p) else float('inf') for p in pool]
        vals, scale = v.bounded([wt(p) for p in pool], pots[side] - len(stash), caps)
        for p, x in zip(pool, vals): out[p.id] = ('keeper' if p.keeper else 'paid', float(x))
        for p in stash: out[p.id] = ('stash', 1.)
        for p in kzero: out[p.id] = ('keeper', 0.)       # below replacement: holds a slot at $0, as v3.1
        meta[side] = dict(pot=float(pots[side]), keepers=len(kept), keeper_salary=sum(p.salary for p in kept),
                          paid=len(chosen), stashes=len(stash), scale=float(scale), replacement_sgp=float(repl),
                          zero_weight_keepers=[p.name for p in kzero])
        assert len(pool) + len(stash) + len(kzero) == SLOTS[side]
    return out, meta


def nonkeeper_sum(out, side):
    return sum(x for i, (k, x) in out.items() if k != 'keeper' and byid[i].side == side)


def solve(keepers):
    """Per side: bisect the pot until the non-keeper AAVs total POTS - keeper salaries."""
    sal = {s: sum(x for i, x in keepers.items() if byid[i].side == s) for s in 'HP'}
    pots = {}
    for side in 'HP':
        cash = POTS[side] - sal[side]
        lo, hi = float(cash), float(cash) * 3
        for _ in range(200):
            mid = (lo + hi) / 2
            pp = dict(POTS); pp[side] = mid
            if nonkeeper_sum(curve(keepers, pp)[0], side) > cash: hi = mid
            else: lo = mid
        pots[side] = (lo + hi) / 2
    return pots, sal


def board(keepers, pots, sal):
    """Integer board: paid non-keepers largest-remainder to their exact cash (v2.integerize);
    stashes $1; keeper curve price rounded on its own (display only)."""
    out, meta = curve(keepers, pots)
    ints = {}
    for side in 'HP':
        paid = sorted([i for i, (k, x) in out.items() if k == 'paid' and byid[i].side == side])
        nst = sum(1 for i, (k, x) in out.items() if k == 'stash' and byid[i].side == side)
        money = POTS[side] - sal[side] - nst
        for i, n in zip(paid, v2.integerize(np.array([out[i][1] for i in paid]), money, paid)): ints[i] = int(n)
    for i, (k, x) in out.items():
        if k == 'stash': ints[i] = 1
        elif k == 'keeper': ints[i] = int(round(x))
    return out, meta, ints


# ---------- the run ----------
ksal = int(sum(keepers.values()))
pots, sal = solve(keepers)
out, meta, ints = board(keepers, pots, sal)
nonkeeper = int(sum(ints[i] for i, (k, x) in out.items() if k != 'keeper'))
cash = ksal + nonkeeper
assert cash == BASIS, cash
assert sum(1 for i in out if ints[i] > 0 or out[i][0] == 'keeper') == 250
potR = {s: POTS[s] * RATE for s in 'HP'}
pot_tot, potR_tot = sum(pots.values()), sum(potR.values())

now = datetime.now()
cur = {}
for p in ps:
    k, x = out.get(p.id, ('none', 0.))
    cur[p.id] = dict(pool_id=p.id, player=p.name, team=p.team, side=p.side, status=k, aav=ints.get(p.id, 0),
                     unrounded=round(x, 6), keeper_salary=int(p.salary) if p.keeper else '', owner=owner.get(p.id, ''),
                     rp='Y' if isrp(p) else '', projections=args.projections)

# ---------- previous run (or the v3.1 baseline) ----------
rep = OUT / 'reports'
runs = sorted(rep.glob('aav_run_*.csv')) if rep.is_dir() else []
if runs:
    prev_label = f'previous run `reports/{runs[-1].name}`'
    prev = {r['pool_id']: dict(player=r['player'], status=r['status'], aav=int(r['aav'])) for r in csv.DictReader(runs[-1].open())}
else:
    prev_label = f'v3.1 baseline `{V31_BASELINE}` (first run)'
    prev = {}
    for r in csv.DictReader(V31_BASELINE.open()):
        p = byname.get(r['player'])
        if not p: continue
        if r['kept']: st, a = 'keeper', int(r['keeper display $'] or 0)
        elif r['prospect$1 flag']: st, a = 'stash', 1
        elif int(r['CTHL AAV'] or 0) > 0: st, a = 'paid', int(r['CTHL AAV'])
        else: st, a = 'none', 0
        prev[p.id] = dict(player=p.name, status=st, aav=a)
on = lambda d: d is not None and d['status'] != 'none'
ids = sorted(set(cur) | set(prev))
added = [i for i in ids if on(cur.get(i)) and not on(prev.get(i))]
dropped = [i for i in ids if on(prev.get(i)) and not on(cur.get(i))]
moved = sorted([i for i in ids if on(cur.get(i)) and on(prev.get(i)) and
                (cur[i]['aav'] != prev[i]['aav'] or cur[i]['status'] != prev[i]['status'])],
               key=lambda i: (-abs(cur[i]['aav'] - prev[i]['aav']), cur[i]['player']))
pool_new = [i for i in cur if i not in prev]; pool_gone = [i for i in prev if i not in cur]
nm = lambda i: (cur.get(i) or prev[i])['player']
dmax = max([abs(cur[i]['aav'] - prev[i]['aav']) for i in moved], default=0)
diff_line = (f"{len(moved)} moved (max ${dmax}), {len(added)} added, {len(dropped)} dropped vs {prev_label}"
             + (f"; pool: +{len(pool_new)} / -{len(pool_gone)} players" if prev and (pool_new or pool_gone) and runs else ''))

# ---------- report ----------
f = lambda x: f'${x:,.2f}'
infl = pot_tot / BASIS
pot_line = (f"Pot: solved {f(pot_tot)} (H {f(pots['H'])} / P {f(pots['P'])}) | reference 2570 x {RATE} = {f(potR_tot)} "
            f"(H {f(potR['H'])} / P {f(potR['P'])}) | implied inflation {infl:.4f} (H {pots['H'] / POTS['H']:.4f} / "
            f"P {pots['P'] / POTS['P']:.4f}) vs reference {RATE}")
ranked = sorted((r for r in cur.values() if r['status'] != 'none'), key=lambda r: (-r['aav'], r['player']))
st = lambda d: '-' if not on(d) else (f"${d['aav']}" + {'keeper': ' K', 'stash': ' S'}.get(d['status'], ''))
stamp = now.strftime('%Y-%m-%d') + (f" {now.strftime('%H:%M')}" if args.write else '')
md = f"""# CTHL AAV run — {stamp}

Generator: `tools/aav_single_pass.py{' --projections ' + args.projections if args.projections != 'steamer' else ''}` (one pass, all 250 slots, keepers included).
Projections: {PROJ_LABEL}. Keepers: `{kpath}` ({len(keepers)} / ${ksal}; {'matches' if app_match else '**DOES NOT MATCH**'} the app's SEED2026.picks). Cutoff: {cutoff_note}.

## Pot / inflation

{pot_line}

Solved pot = the per-side pot at which non-keeper AAVs total exactly $2,570 - keeper salaries; it is what prices the board. The reference pot is the keeper-inflation estimate to use before keepers are final; implied inflation = solved pot / $2,570.

## Cash check

${ksal} keeper salaries ({len(keepers)}) + ${nonkeeper:,} non-keeper AAVs = **${cash:,}**; 250 slots (172H / 78P), {sum(1 for k, _ in out.values() if k == 'stash')} $1 stashes. Keeper AAVs are display only (never cash).

## Diff vs previous

{diff_line}.

""" + (('| Player | Side | Was | Now | Change |\n|---|---|---:|---:|---:|\n' +
        ''.join(f"| {nm(i)} | {cur[i]['side']} | {st(prev[i])} | {st(cur[i])} | {cur[i]['aav'] - prev[i]['aav']:+d} |\n" for i in moved) + '\n')
       if moved else 'No price moved.\n\n') + \
    f"Added (now in the 250): {', '.join(f'{nm(i)} {st(cur[i])}' for i in added) or 'none'}.\n\n" + \
    f"Dropped (out of the 250): {', '.join(f'{nm(i)} (was {st(prev[i])})' for i in dropped) or 'none'}.\n\n" + \
    (f"Pool changes: new {', '.join(nm(i) for i in pool_new) or 'none'}; gone {', '.join(nm(i) for i in pool_gone) or 'none'}.\n\n" if runs and (pool_new or pool_gone) else '') + \
    (f"Projected on the other side (no line, unpriced): {', '.join(side_mismatch)}.\n\n" if side_mismatch else '') + \
    "## Top 25 by AAV (K = keeper AAV, display only)\n\n| # | Player | Team | Side | AAV |\n|---:|---|---|---|---:|\n" + \
    ''.join(f"| {n} | {r['player']} | {r['team']} | {r['side']} | ${r['aav']}{' K' if r['status'] == 'keeper' else ''} |\n" for n, r in enumerate(ranked[:25], 1)) + \
    f"""
## Curve

| Side | Pot | Keepers | Keeper $ | Paid | Stashes | Replacement SGP | Scale |
|---|---:|---:|---:|---:|---:|---:|---:|
""" + ''.join(f"| {s} | {f(m['pot'])} | {m['keepers']} | ${m['keeper_salary']:.0f} | {m['paid']} | {m['stashes']} | {m['replacement_sgp']:.4f} | {m['scale']:.6f} |\n" for s, m in meta.items())
print(md)

# ---------- write ----------
if args.write:
    if not app_match:
        die(f"refusing to write: keeper list {kpath.name} ({len(keepers)} / ${ksal}) differs from the app's "
            f"SEED2026.picks ({len(app_k)} / ${sum(app_k.values()):.0f}). Update one to match the other first.")
    blk = {}
    for p in sorted(ps, key=lambda p: p.id):
        k = cur[p.id]['status']
        if k == 'keeper': blk[p.id] = {'k': ints[p.id]}
        elif k == 'stash': blk[p.id] = {'a': 1, 's': 1}
        else: blk[p.id] = {'a': ints.get(p.id, 0)}
    rep.mkdir(exist_ok=True)
    stem = f"aav_run_{now:%Y-%m-%d}"
    if (rep / f'{stem}.md').exists() or (rep / f'{stem}.csv').exists(): stem += f"_{now:%H%M}"
    if (rep / f'{stem}.csv').exists(): die(f'reports/{stem}.csv already exists; wait a minute and rerun')
    old = json.loads(re.search(r'const AAV_2027 = (\{.*?\});\n', aav_js).group(1))
    if old == blk:
        data_note = 'data/aav-2027.js unchanged (no price changed)'
    else:
        js = json.dumps(blk, separators=(',', ':'))
        head = ('/* ================= AAV 2027 — DATA BLOCK =================\n'
                '   CTHL AAV = 2027 auction price, ONE pass (Eno single-pass spec, 11/14/2026;\n'
                f'   tools/aav_single_pass.py, {args.projections}, run {now:%Y-%m-%d %H:%M}). All 250 slots,\n'
                '   keepers included, priced on one curve. Keyed by pool id.\n'
                '   a = auction AAV, k = keeper AAV (what a kept player would fetch if not kept;\n'
                '   display only, never cash), s = budgeted $1 prospect stash. Read at render time,\n'
                '   never written into S.players, so replacing this block needs no SEED_VER bump.\n'
                f"   Pot: solved {f(pot_tot)} (H {f(pots['H'])} / P {f(pots['P'])}) vs\n"
                f"   pre-final 2570 x {RATE} = {f(potR_tot)}. Report: reports/{stem}.md.\n"
                f"   Totals: ${ksal} keepers/{len(keepers)} + ${nonkeeper:,} auction = ${cash:,} / 250 slots. */\n")
        new, n = re.subn(r'/\* =+ AAV 2027 — DATA BLOCK =+\n.*?\*/\nconst AAV_2027 = \{.*?\};\n',
                         lambda m: head + 'const AAV_2027 = ' + js + ';\n', aav_js, count=1, flags=re.S)
        assert n == 1
        aav_path.write_text(new, encoding='utf-8')
        data_note = f'data/aav-2027.js AAV_2027 block updated ({sum(old.get(i) != b for i, b in blk.items())} entries changed)'
    md += f"\n## Written\n\n`reports/{stem}.md`, `reports/{stem}.csv`; {data_note}.\n"
    (rep / f'{stem}.md').write_text(md)
    cols = ['pool_id', 'player', 'team', 'side', 'status', 'aav', 'unrounded', 'keeper_salary', 'owner', 'rp', 'projections']
    with (rep / f'{stem}.csv').open('w', newline='') as fh:
        w = csv.DictWriter(fh, cols); w.writeheader()
        w.writerows(sorted(cur.values(), key=lambda r: (r['status'] == 'none', -r['aav'], r['player'])))
    print(f'wrote reports/{stem}.md + reports/{stem}.csv; {data_note}')
