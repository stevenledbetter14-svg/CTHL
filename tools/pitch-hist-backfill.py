#!/usr/bin/env python3
"""Backfill L, H, ER and WHIP on the card-back pitching history (2026-11-16, Eno spec).

  python3 tools/mlb-stats-pull.py --cache /workspace/db2027/statsapi_cache --out /tmp/pull/mlb-stats
  python3 tools/pitch-hist-backfill.py --pull /tmp/pull/mlb-stats.json            # dry run, report only
  python3 tools/pitch-hist-backfill.py --pull /tmp/pull/mlb-stats.json --write    # rewrite data/cards-2027.js

Source: the statsapi pull above (tools/mlb-stats-pull.py, MLBAM-keyed, MLB + MiLB by
level, gameType=R). Each baked CARDS.s pitching row [year,'P',kind,level,club, G GS IP W
SV ERA K BB K/BB] is matched to the pull row with the same year/kind/level/club (team
rows per club, "MLB Tot" / "MiLB Tot" = the season totals) and gets 4 cells appended:
  [14] L  [15] H  [16] ER  [17] WHIP = (BB+H)/IP from the outs, half-up, '' at 0 IP
G GS IP W SV ERA K BB are re-pulled as a cross-check: any difference is reported old vs
new and the pull's value is written (statsapi is the source of record), with the pull's
K/BB [13]. The card shows K/BB from the row's own K and BB, "—" when BB is 0. A row the pull has no
match for is left as it is and listed; nothing is guessed. Hitting rows are not touched.
Rerunnable: rows already carrying [14..17] are overwritten from the pull.

NOTE: /workspace/db2027/cards/build_card_data.py --inject rewrites the whole CARDS line
from its own 9-stat rows; rerun this tool after it, or the backfill is lost.
"""
import argparse, json, os, re, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARDS_JS = os.path.join(REPO, 'data', 'cards-2027.js')
SEED_JS = os.path.join(REPO, 'data', 'seed-2027.js')
CHECK = (('G', 5), ('GS', 6), ('IP', 7), ('W', 8), ('SV', 9), ('ERA', 10), ('K', 11), ('BB', 12))
RE_CARDS = re.compile(r'(/\*CARDS-BEGIN\*/\s*const CARDS=)(\{.*?\})(;\s*/\*CARDS-END\*/)', re.S)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--pull', required=True, help='mlb-stats-pull.py JSON output')
    ap.add_argument('--write', action='store_true', help='rewrite data/cards-2027.js (default: dry run)')
    a = ap.parse_args()

    pull = json.load(open(a.pull, encoding='utf-8'))
    api = pull['players']
    src = open(CARDS_JS, encoding='utf-8').read()
    m = RE_CARDS.search(src)
    cards = json.loads(m.group(2))
    seed = json.loads(re.search(r'const SEED2026 = (\{.*?\});\n', open(SEED_JS, encoding='utf-8').read(), re.S).group(1))
    name = {p['id']: p['name'] for p in seed['players']}

    filled = unmatched = 0
    diffs, missing, players = [], [], set()
    for pid, rows in cards['s'].items():
        prow = [r for r in rows if r[1] == 'P']
        if not prow:
            continue
        players.add(pid)
        am = {tuple(r[:5]): r for r in api.get(pid, {}).get('rows', []) if r[1] == 'P'}
        for r in prow:
            x = am.get(tuple(r[:5]))
            if x is None or len(x) < 18:
                unmatched += 1
                missing.append((pid, r[:5]))
                continue
            d = [(h, r[i], x[i]) for h, i in CHECK if str(r[i]) != str(x[i])]
            if d:
                diffs.append((pid, r[:5], d))
                for _, i in CHECK:
                    r[i] = x[i]
                r[13] = x[13]
            del r[14:]
            r += x[14:18]
            filled += 1

    print(f'pull: {pull["meta"]["source"]} · pulled {pull["meta"]["pulled"]}')
    print(f'{len(players)} pitchers · {filled} pitching rows filled (L H ER WHIP) · {unmatched} left as they are')
    for pid, k in missing:
        print(f'  no pull match: {name.get(pid, pid)} {k}')
    print(f'W/SV/IP/K (and G/GS/ERA/BB) differences vs current history: {len(diffs)} rows')
    for pid, k, d in diffs:
        print(f'  {name.get(pid, pid)} {k}: ' + ', '.join(f'{h} {o} -> {n}' for h, o, n in d))
    if a.write:
        out = src[:m.start(2)] + json.dumps(cards, ensure_ascii=False, separators=(',', ':')) + src[m.end(2):]
        tmp = CARDS_JS + '.tmp'
        open(tmp, 'w', encoding='utf-8').write(out)
        os.replace(tmp, CARDS_JS)
        print(f'wrote {CARDS_JS}')
    else:
        print('dry run (no --write)')


if __name__ == '__main__':
    main()
