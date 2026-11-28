#!/usr/bin/env python3
"""Add the card-back 2027 line fields to the baked p27 projections in data/seed-2027.js.

The card back's 2027 projection row shows the same columns as the 2025-26
history table above it:
  hitters   G AB R H HR RBI SB AVG
  pitchers  G W L SV IP H ER BB K ERA WHIP K/BB
The seed p27 already holds PA HR R RBI SB AVG / IP ERA SO BB SV W GS. This adds
only the missing fields, read from the raw Steamer 2027 files:
  hitters   G AB H          (/workspace/db2027/steamer/2027_bat.json)
  pitchers  G L H ER WHIP   (/workspace/db2027/steamer/2027_pit.json)
            KBB             (2026-11-16 Eno: unrounded Steamer SO / BB, so the
                            card's K/BB is not a ratio of the rounded SO and BB)
Existing p27 values are never changed; new keys go on the end of each p27.

Players are matched the way the existing p27 was built: pool_id -> mlbam from
/workspace/db2027/steamer/values_2027_steamer.csv (else fg_mlbam in
match_report.csv, the Steamer match step), then xMLBAMID in the Steamer file (or playerid when fg_mlbam is not numeric, e.g. Taira sa3062990).
The side (bat/pit) is the side the p27 already carries ('PA' in p27 = hitter), so a card-only pitcher line (Jose Fermin) stays pitching.
Rounding: counts as the existing p27 counts (1 dp, then whole); WHIP 2 dp;
KBB 6 dp (the card shows 2), absent when the raw BB is 0.

  python3 tools/p27-card-fields.py            report only
  python3 tools/p27-card-fields.py --write    rewrite the SEED2026 line
  [--seed data/seed-2027.js] [--steamer /workspace/db2027/steamer]
Rerunning --write is a no-op once the fields are there.
"""
import argparse, csv, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADD = {'bat': ['G', 'AB', 'H'], 'pit': ['G', 'L', 'H', 'ER', 'WHIP', 'KBB']}
PREFIX = 'const SEED2026 = '


def cnt(x):
    return int(round(round(float(x), 1)))


def conv(k, x):
    if k == 'KBB':
        return round(float(x['SO']) / float(x['BB']), 6) if x.get('SO') is not None and x.get('BB') else None
    x = x.get(k)
    if x is None:
        return None
    return round(float(x), 2) if k == 'WHIP' else cnt(x)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', default=os.path.join(ROOT, 'data', 'seed-2027.js'))
    ap.add_argument('--steamer', default='/workspace/db2027/steamer')
    ap.add_argument('--write', action='store_true')
    a = ap.parse_args()

    text = open(a.seed, encoding='utf8').read()
    lines = text.split('\n')
    idx = [i for i, l in enumerate(lines) if l.startswith(PREFIX)]
    assert len(idx) == 1 and lines[idx[0]].endswith(';'), 'expected one SEED2026 line'
    body = lines[idx[0]][len(PREFIX):-1]
    seed = json.loads(body)
    assert json.dumps(seed, separators=(',', ':'), ensure_ascii=False) == body, 'SEED2026 line does not round-trip'

    fgkey = {r['pool_id']: r['fg_mlbam'] for r in csv.DictReader(open(os.path.join(a.steamer, 'match_report.csv'), encoding='utf8')) if r['fg_mlbam']}
    mlbam = dict(fgkey)
    mlbam.update({r['pool_id']: r['mlbam'] for r in csv.DictReader(open(os.path.join(a.steamer, 'values_2027_steamer.csv'), encoding='utf8')) if r['mlbam']})
    src = {}
    src_pid = {}
    for side in ('bat', 'pit'):
        for x in json.load(open(os.path.join(a.steamer, f'2027_{side}.json'), encoding='utf8')):
            if x.get('xMLBAMID'):
                src.setdefault(side, {})[int(x['xMLBAMID'])] = x
            if x.get('playerid'):
                src_pid.setdefault(side, {})[str(x['playerid'])] = x

    added = same = 0
    unmatched, missing = [], []
    for p in seed['players']:
        q = p.get('p27')
        if not q:
            continue
        side = 'bat' if 'PA' in q else 'pit'
        mid = mlbam.get(p['id'])
        row = None
        if mid:
            try:
                row = src[side].get(int(float(mid)))
            except ValueError:
                row = src_pid.get(side, {}).get(str(mid))
        if not row and fgkey.get(p['id']) and not str(fgkey[p['id']]).isdigit():
            # Steamer row keyed by FanGraphs playerid (no xMLBAMID yet), e.g. Taira sa3062990
            # after his 11/28 re-key to MLBAM 838343.
            row = src_pid.get(side, {}).get(str(fgkey[p['id']]))
        if not row:
            unmatched.append((p['id'], p['name'], p['team'], side, mid or ''))
            continue
        for k in ADD[side]:
            v = conv(k, row)
            if v is None:
                missing.append((p['name'], k))
                continue
            if k in q:
                assert q[k] == v, f'{p["name"]} p27.{k} is {q[k]}, Steamer gives {v}: refusing to change it'
                same += 1
            else:
                q[k] = v
                added += 1

    n = sum(1 for p in seed['players'] if p.get('p27'))
    print(f'{len(seed["players"])} pool players, {n} with p27; fields added {added}, already present {same}')
    print(f'unmatched {len(unmatched)}' + ''.join(f'\n  {u}' for u in unmatched))
    print(f'missing in Steamer {len(missing)}' + ''.join(f'\n  {m}' for m in missing))
    nop = [(p['id'], p['name'], p['team'], p['kind']) for p in seed['players'] if not p.get('p27')]
    print(f'no p27 at all (left as is, card says "No 2027 projection") {len(nop)}')
    if a.write and added:
        lines[idx[0]] = PREFIX + json.dumps(seed, separators=(',', ':'), ensure_ascii=False) + ';'
        open(a.seed, 'w', encoding='utf8').write('\n'.join(lines))
        print('wrote', a.seed)
    elif a.write:
        print('nothing to write')
    return 1 if unmatched else 0


if __name__ == '__main__':
    sys.exit(main())
