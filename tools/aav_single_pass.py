#!/usr/bin/env python3
"""CTHL AAV single pass (Eno spec 2026-11-14, specs/single-pass-aav-spec-2026-11-14.md).

Replaces v3.1's two steps (price non-keepers from $2,570 - keeper salaries, then
a separate keeper display calc) with ONE pass: every one of the 250 slots per
side (keepers + paid non-keepers + $1 stashes) is priced on one curve.

  * Pot, keepers final: solved per side so the non-keeper AAVs total exactly
    $2,570 - keeper salaries (H 1928 - S_H, P 642 - S_P).
  * Pot, before keepers are final / sanity check: 2570 x 1.1689 (consistent-form
    keeper inflation, avg of 2025 1.1704 / 2026 1.1673), split 1928:642.
  * Unchanged from v3.1 (aav_v3.calculate): paid cohort + replacement SGP,
    gamma 1.40/1.55, K/BB tilt inside the scores, $31 RP ceiling, $2 floor,
    12 $1 stashes (Irish swap), largest-remainder rounding of the paid
    non-keepers to their cash. A keeper's curve price is display only (never
    cash); it is rounded on its own, so it can never move the cash total.
  * Keeper scenarios: only sets that respect the 5-per-team cap (42/47/48/50;
    the cap-breaking 50u set is not run). Each is re-solved.

Run (from the repo root):
  PYTHONDONTWRITEBYTECODE=1 python3 tools/aav_single_pass.py [--engine DIR] [--write]
--write regenerates the AAV_2027 block in index.html and the reports/ files.
Without it, the script only prints the report.
Reads (never writes) the v3.1 engine, its CSV and the keeper sets in /workspace/db2027.
"""
import sys, csv, json, re, argparse, warnings
from collections import Counter
from dataclasses import replace
from pathlib import Path
warnings.filterwarnings('ignore')

ROOT = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser()
ap.add_argument('--engine', default='/workspace/db2027/excel_method')
ap.add_argument('--keepers', default='/workspace/db2027/keepers')
ap.add_argument('--write', action='store_true')
args = ap.parse_args()
ENG = Path(args.engine); sys.path.insert(0, str(ENG))
import numpy as np
import aav_v3 as v
v2 = v.v2

BASIS = 2570
RATE_2025, RATE_2026 = 1.1704, 1.1673
RATE = 1.1689                      # avg, as published in keeper_inflation_2026-11-14.md
CAP = 5                            # keepers per team
POTS, SLOTS, GAMMA = v2.POTS, v2.SLOTS, v2.GAMMA
assert POTS == {'H': 1928, 'P': 642} and sum(POTS.values()) == BASIS and SLOTS == {'H': 172, 'P': 78}
assert abs((RATE_2025 + RATE_2026) / 2 - RATE) < 1e-4   # published avg uses unrounded yearly rates

# ---------- v3.1 board inputs, identical to aav_v3_1.py ----------
ps, rows, valid, scores, ranks, _, bb = v2.raw_current()
fixed = v.stash_ids(ps, ranks, rows)
irish = next(p for p in ps if p.name == 'Ike Irish')
removed = max([p for p in ps if p.id in fixed], key=lambda p: (ranks[rows[p.id]['mlbam']], p.id))
fixed.remove(removed.id); fixed.add(irish.id)
raw31, int31, disp31, meta31, _ = v.calculate(ps, fixed, valid, scores, current=True)
byname = {p.name: p for p in ps}; byid = {p.id: p for p in ps}
isrp = lambda p: p.side == 'P' and p.id in valid and v2.rp_type(valid[p.id])
v31csv = {r['player']: r for r in csv.DictReader(open(ENG / 'aav_2027_v3_1.csv'))}


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


def cash_total(keepers, out, ints):
    return int(sum(keepers.values()) + sum(ints[i] for i, (k, x) in out.items() if k != 'keeper'))


# ---------- the live 48 (Steven's keepers room, 11/6) ----------
k48 = {p.id: p.salary for p in ps if p.keeper}
assert len(k48) == 48 and sum(k48.values()) == 467
pots48, sal48 = solve(k48)
out48, meta48, int48 = board(k48, pots48, sal48)
assert cash_total(k48, out48, int48) == BASIS
assert sum(1 for i in out48 if int48[i] > 0 or out48[i][0] == 'keeper') == 250

nk31 = [p for p in ps if not p.keeper and int31[p.id] > 0]
diffs = [(p.name, p.side, int31[p.id], int48[p.id]) for p in nk31 if int48[p.id] != int31[p.id]]
dmax = max([abs(b - a) for _, _, a, b in diffs], default=0)
kdiffs = [(p.name, round(disp31[p.id]), int48[p.id]) for p in ps if p.keeper and int48[p.id] != round(disp31[p.id])]
unr_max = max(abs(out48[p.id][1] - raw31[p.id]) for p in nk31)
# every board entry also agrees with the published v3.1 CSV
for p in ps:
    r = v31csv[p.name]
    if p.keeper: assert abs(int(r['keeper display $']) - int48[p.id]) <= 1, p.name
    else: assert abs(int(r['CTHL AAV']) - int48.get(p.id, 0)) <= 1, p.name

# ---------- pre-final pot: 2570 x 1.1689, 1928:642 ----------
potsR = {s: POTS[s] * RATE for s in 'HP'}
outR, metaR = curve(k48, potsR)
nkR = {s: nonkeeper_sum(outR, s) for s in 'HP'}
rdiff = [abs(round(outR[p.id][1]) - int31[p.id]) for p in nk31]
prefinal = dict(rate=RATE, rate_2025=RATE_2025, rate_2026=RATE_2026, H=potsR['H'], P=potsR['P'], total=sum(potsR.values()),
                nonkeeper_H=nkR['H'], nonkeeper_P=nkR['P'], nonkeeper_total=sum(nkR.values()),
                cash_check=sum(k48.values()) + sum(nkR.values()),
                vs_v31_max_abs=int(max(rdiff)), vs_v31_moved=int(sum(d > 0 for d in rdiff)),
                keeper_curve_total=sum(x for k, x in outR.values() if k == 'keeper'))

# ---------- keeper scenarios, 5-per-team cap only ----------
html = (ROOT / 'index.html').read_text()
K27 = json.loads(re.search(r'const KEEPERS2027 = (\{.*?\});', html).group(1))
key = v2.inputs.key; bykey = {key(p.name): p for p in ps}
room = list(csv.DictReader(open(Path(args.keepers) / 'keeper_split_2026-11-06_room.csv')))
old42 = list(csv.DictReader(open(Path(args.keepers) / 'keeper_split_2026-11-06.csv')))
own48 = {byname[r['player']].id: r['owner'] for r in room}
set48 = {byname[r['player']].id: float(r['keeper_salary']) for r in room}; assert set48 == k48
set42 = {byname[r['player']].id: float(r['keeper_salary']) for r in old42}
own42 = {byname[r['player']].id: r['owner'] for r in old42}
surplus = sorted((round(disp31[i]) - s, byid[i].name, i) for i, s in set48.items())
set47 = {i: s for i, s in set48.items() if i != surplus[0][2]}
cnt = Counter(own48.values()); add = []
for c in sorted([dict(id=bykey[k].id, owner=e['team'], price=float(e['v']), surplus=int31[bykey[k].id] - e['v'])
                 for k, e in K27.items() if not e.get('traded') and k in bykey and not bykey[k].keeper and bykey[k].id not in fixed],
                key=lambda c: (-c['surplus'], -int31[c['id']], byid[c['id']].name)):
    if len(add) == 2: break
    if cnt[c['owner']] < CAP: add.append(c); cnt[c['owner']] += 1
set50 = {**set48, **{c['id']: c['price'] for c in add}}
own50 = {**own48, **{c['id']: c['owner'] for c in add}}
scen = {}
for name, ks, own in [('42', set42, own42), ('47', set47, own48), ('48', set48, own48), ('50', set50, own50)]:
    per = Counter(own[i] for i in ks); assert max(per.values()) <= CAP, (name, per)
    pots, sal = solve(ks); out, meta, ints = board(ks, pots, sal)
    tot = cash_total(ks, out, ints); assert tot == BASIS, (name, tot)
    scen[name] = dict(keepers=len(ks), keeper_salary=int(sum(ks.values())), max_per_team=max(per.values()),
                      pot_H=pots['H'], pot_P=pots['P'], pot_total=sum(pots.values()),
                      nonkeeper_total=tot - int(sum(ks.values())), cash_check=tot,
                      added_vs_48=sorted(byid[i].name for i in set(ks) - set(set48)),
                      dropped_vs_48=sorted(byid[i].name for i in set(set48) - set(ks)))

R = dict(spec='specs/single-pass-aav-spec-2026-11-14.md', keepers=48, keeper_salary=467,
         solved_pot=dict(H=pots48['H'], P=pots48['P'], total=sum(pots48.values())), prefinal_pot=prefinal,
         nonkeeper_total=cash_total(k48, out48, int48) - 467, cash_check=cash_total(k48, out48, int48),
         vs_v31=dict(compared=len(nk31), max_abs=dmax, moved=len(diffs), moved_players=diffs, unrounded_max_abs=unr_max),
         keepers_vs_display=dict(changed=kdiffs, checks={n: int48[byname[n].id] for n in
                                 ['Nick Kurtz', 'Julio Rodriguez', 'Cam Schlittler', 'Ben Rice', 'Logan Gilbert']}),
         meta=meta48, scenarios=scen, scenarios_dropped={'50u': 'breaks the 5-per-team cap; not run'})

f = lambda x: f'${x:,.2f}'
md = f"""# CTHL AAV single pass — report (2026-11-14)

Spec: `/workspace/db2027/{R['spec']}`. Generator: `tools/aav_single_pass.py`. Board: `AAV_2027` in `index.html`.
One curve prices all 250 slots (keepers included). Keepers' price = keeper AAV, display only, never counted in cash.

## Pot used

| Pot | H | P | Total | Non-keeper AAVs | Keeper $ + non-keeper | Max diff vs v3.1 | Moved |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Solved (keepers final, used for the board)** | {f(pots48['H'])} | {f(pots48['P'])} | **{f(R['solved_pot']['total'])}** | ${R['nonkeeper_total']:,} | **${R['cash_check']:,}** | ${dmax} | {len(diffs)} of {len(nk31)} |
| Pre-final 2570 x {RATE} | {f(potsR['H'])} | {f(potsR['P'])} | **{f(prefinal['total'])}** | {f(prefinal['nonkeeper_total'])} | {f(prefinal['cash_check'])} | ${prefinal['vs_v31_max_abs']} | {prefinal['vs_v31_moved']} of {len(nk31)} |

{RATE} = avg of 2025 {RATE_2025} / 2026 {RATE_2026} (consistent-form keeper inflation). It is the pot to use before keepers are final; once they are, the solved pot reconciles to $2,570 and is what the board uses.

## Acceptance (48 keepers / $467)

- Non-keeper prices vs v3.1 (`aav_2027_v3_1.csv`): max diff **${dmax}**, **{len(diffs)}** moved of {len(nk31)} (unrounded max {unr_max:.1e}).
- Keeper values: {', '.join(f'{n} ${x}' for n, x in R['keepers_vs_display']['checks'].items())}; {len(kdiffs)} keepers differ from the current display.
- Cash check: $467 keeper salaries + ${R['nonkeeper_total']:,} non-keeper AAVs = **${R['cash_check']:,}**.

## Keeper scenarios (5-per-team cap only; 50u dropped)

| Scenario | Keepers | Salary | Max/team | Solved pot (H / P) | Non-keeper | Cash check | Added vs 48 | Dropped vs 48 |
|---|---:|---:|---:|---|---:|---:|---|---|
""" + ''.join(f"| {n} | {s['keepers']} | ${s['keeper_salary']} | {s['max_per_team']} | {f(s['pot_total'])} ({f(s['pot_H'])} / {f(s['pot_P'])}) | ${s['nonkeeper_total']:,} | ${s['cash_check']:,} | {', '.join(s['added_vs_48']) or '-'} | {', '.join(s['dropped_vs_48']) or '-'} |\n" for n, s in scen.items())
print(md)

if args.write:
    blk = {}
    for p in sorted(ps, key=lambda p: p.id):
        k, _ = out48.get(p.id, ('none', 0.))
        if k == 'keeper': blk[p.id] = {'k': int48[p.id]}
        elif k == 'stash': blk[p.id] = {'a': 1, 's': 1}
        else: blk[p.id] = {'a': int48.get(p.id, 0)}
    js = json.dumps(blk, separators=(',', ':'))
    head = ('/* ================= AAV 2027 — DATA BLOCK =================\n'
            '   CTHL AAV = 2027 auction price, ONE pass (Eno single-pass spec, 11/14/2026;\n'
            '   tools/aav_single_pass.py on the v3.1 engine). All 250 slots, keepers included,\n'
            '   priced on one curve. Keyed by pool id.\n'
            '   a = auction AAV, k = keeper AAV (what a kept player would fetch if not kept;\n'
            '   display only, never cash), s = budgeted $1 prospect stash. Read at render time,\n'
            '   never written into S.players, so replacing this block needs no SEED_VER bump.\n'
            f"   Pot: solved ${R['solved_pot']['total']:,.2f} (H ${pots48['H']:,.2f} / P ${pots48['P']:,.2f}) vs\n"
            f"   pre-final 2570 x {RATE} = ${prefinal['total']:,.2f}. Report: reports/single_pass_aav_2026-11-14.md.\n"
            f"   Totals: $467 keepers/48 + ${R['nonkeeper_total']:,} auction = ${R['cash_check']:,} / 250 slots. */\n")
    new, n = re.subn(r'/\* =+ AAV 2027 — DATA BLOCK =+\n.*?\*/\nconst AAV_2027 = \{.*?\};\n',
                     lambda m: head + 'const AAV_2027 = ' + js + ';\n', html, count=1, flags=re.S)
    assert n == 1
    (ROOT / 'index.html').write_text(new)
    (ROOT / 'reports').mkdir(exist_ok=True)
    (ROOT / 'reports/single_pass_aav_2026-11-14.md').write_text(md)
    (ROOT / 'reports/single_pass_aav_2026-11-14.json').write_text(json.dumps(R, indent=1, default=str) + '\n')
    print('wrote index.html AAV_2027 block + reports/')
