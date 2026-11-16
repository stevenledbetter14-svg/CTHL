#!/usr/bin/env python3
"""Pull season stat lines by MLBAM id from MLB's official Stats API.

  python3 tools/mlb-stats-pull.py                       # whole pool, 2025-26
  python3 tools/mlb-stats-pull.py --ids 691406,815908   # MLBAM ids (or pool ids)
  python3 tools/mlb-stats-pull.py --seasons 2025,2026 --out /tmp/stats.json
  python3 tools/mlb-stats-pull.py --compare             # diff against baked CARDS

Read-only on data/: the pool (SEED2026, data/seed-2027.js) and the baked CARDS
block (data/cards-2027.js) are read for ids and comparison, never written.
Nothing here pushes anywhere.

Source: statsapi.mlb.com only. Baseball-Reference is spot-check by hand only and
is never requested by this tool. Regular season (gameType=R), yearByYear,
hitting + pitching, one request per level per batch of ids:
  /people?personIds=...&hydrate=stats(group=[hitting,pitching],type=[yearByYear],gameType=R,sportId=N)
  N = 1 MLB, 11 AAA, 12 AA, 13 A+, 14 A, 16 Rookie (ACL/FCL/DSL)
No AFL, winter ball or WBC (other sports / game types, never requested).

MLBAM ids: the pool (data/seed-2027.js) carries no MLBAM field (id is the pool hash,
rwId is Rotoworld), so pool_id -> mlbam comes from --map CSVs (pool_id,mlbam
columns; default: the db2027 card coverage + Steamer values files). Pool players
with no mapped MLBAM are listed and skipped, never matched by name.

Output rows are the card back's CARDS.s shape (see data/cards-2027.js PLAYER CARD DATA):
  [year, side, kind(0 team/1 mlb_tot/2 milb_tot), level, club, ...stats]
  H: G AB R H HR RBI SB AVG       P: G GS IP W SV ERA K BB K/BB
Same conventions as db2027/cards/build_card_data.py: per-team rows, MiLB rows
(by level) then "MiLB Tot" when 2+, MLB rows then "MLB Tot" when 2+; AVG/ERA
recomputed half-up, K/BB blank when BB is 0; primary side from the pool's kind,
the other side kept only at >=30 PA / >=10 IP across the requested seasons.

Cache: tools/.cache/mlb-stats/ holds one raw file per (level, player) plus the
team tables. A rerun only requests what is missing, so an interrupted run just
resumes. --refresh ignores (and overwrites) the cache.
"""
import argparse, csv, json, os, re, sys, time, urllib.error, urllib.request
from decimal import Decimal, ROUND_HALF_UP

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SEED_JS = os.path.join(REPO, 'data', 'seed-2027.js')
CARDS_JS = os.path.join(REPO, 'data', 'cards-2027.js')
CACHE = os.path.join(HERE, '.cache', 'mlb-stats')
DEFAULT_OUT = os.path.join(HERE, 'out', 'mlb-stats')
DEFAULT_MAPS = ['/workspace/db2027/cards/card_stats_coverage.csv',
                '/workspace/db2027/steamer/values_2027_steamer.csv']

API = 'https://statsapi.mlb.com/api/v1'
UA = 'CTHL Auction Manager stats pull (python urllib; low volume, paced)'
SPORTS = {1: 'MLB', 11: 'AAA', 12: 'AA', 13: 'A+', 14: 'A', 16: 'Rk'}
BATCH = 50
DELAY = 0.6        # seconds between requests
TIMEOUT = 20
RETRIES = 4

ORG = {'NYA': 'NYY', 'NYN': 'NYM', 'CHA': 'CHW', 'CHN': 'CHC', 'LAN': 'LAD', 'ANA': 'LAA', 'SLN': 'STL',
       'SDN': 'SDP', 'SD': 'SDP', 'SFN': 'SFG', 'SF': 'SFG', 'TBA': 'TBR', 'TB': 'TBR', 'KCA': 'KCR',
       'KC': 'KCR', 'WAS': 'WSN', 'WSH': 'WSN', 'OAK': 'ATH', 'FLA': 'MIA', 'AZ': 'ARI', 'CWS': 'CHW'}
# Stats API abbreviations -> the club labels already on the cards (BBRef-era build)
CLUB_ALIAS = {'Scranton/WB': 'Scranton/Wilkes-Barre', 'NW Arkansas': 'Northwest Arkansas'}
COMPLEX = {'Arizona Complex League': 'ACL', 'Florida Complex League': 'FCL', 'Dominican Summer League': 'DSL'}
LVL_ORDER = {'MLB': 0, 'AAA': 1, 'AA': 2, 'A+': 3, 'A': 4, 'Rk': 6, 'FCL': 7, 'ACL': 7, 'DSL': 8}
H_MAP = dict(g='gamesPlayed', pa='plateAppearances', ab='atBats', r='runs', h='hits', hr='homeRuns',
             rbi='rbi', sb='stolenBases')
P_MAP = dict(g='gamesPitched', gs='gamesStarted', w='wins', sv='saves', er='earnedRuns', so='strikeOuts',
             bb='baseOnBalls')
CSV_COLS = ['pool_id', 'mlbam', 'name', 'year', 'side', 'kind', 'level', 'club',
            'G', 'AB', 'R', 'H', 'HR', 'RBI', 'SB', 'AVG', 'GS', 'IP', 'W', 'SV', 'ERA', 'K', 'BB', 'K/BB']


# ------------------------------------------------------------- data/*.js (read-only)

def read_data():
    s = open(SEED_JS, encoding='utf-8').read()
    seed = json.loads(re.search(r'const SEED2026 = (\{.*?\});\n', s, re.S).group(1))
    s = open(CARDS_JS, encoding='utf-8').read()
    m = re.search(r'/\*CARDS-BEGIN\*/\s*const CARDS=(\{.*?\});\s*/\*CARDS-END\*/', s, re.S)
    cards = json.loads(m.group(1))['s'] if m else {}
    return seed['players'], cards


def read_maps(paths):
    m = {}
    for p in paths:
        if not os.path.exists(p):
            continue
        for r in csv.DictReader(open(p, encoding='utf-8')):
            pid, v = (r.get('pool_id') or '').strip(), (r.get('mlbam') or '').strip()
            if pid and v.isdigit():
                if m.get(pid, v) != v:
                    sys.exit(f'map conflict for {pid}: {m[pid]} vs {v} ({p})')
                m[pid] = v
    return m


# ------------------------------------------------------------------ HTTP + cache

class Api:
    def __init__(self):
        self.calls = 0
        self.last = 0.0

    def get(self, path):
        url = API + path
        err = None
        for attempt in range(RETRIES):
            wait = self.last + DELAY - time.time()
            if wait > 0:
                time.sleep(wait)
            self.calls += 1
            try:
                req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
                with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                    data = json.load(r)
                self.last = time.time()
                return data
            except urllib.error.HTTPError as e:
                self.last = time.time()
                err = e
                if e.code not in (429, 500, 502, 503, 504):
                    raise RuntimeError(f'HTTP {e.code} {url}')
                ra = e.headers.get('Retry-After')
                backoff = float(ra) if ra and ra.isdigit() else 2 * 2 ** attempt
            except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
                self.last = time.time()
                err = e
                backoff = 2 * 2 ** attempt
            if attempt < RETRIES - 1:
                print(f'  retry {attempt + 1} in {backoff:.0f}s: {err}', file=sys.stderr)
                time.sleep(backoff)
        raise RuntimeError(f'{url}: {err}')


def write_json_atomic(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, separators=(',', ':'))
    os.replace(tmp, path)


def teams_table(api, season, refresh):
    path = os.path.join(CACHE, 'teams', f'{season}.json')
    if refresh or not os.path.exists(path):
        d = api.get(f'/teams?sportIds={",".join(map(str, SPORTS))}&season={season}')
        keep = ('abbreviation', 'franchiseName', 'shortName', 'teamName', 'name', 'parentOrgId')
        write_json_atomic(path, {str(t['id']): {k: t.get(k) for k in keep} | {'sport': t['sport']['id']}
                                 for t in d.get('teams', [])})
    return json.load(open(path))


def player_cache(sid, mlbam):
    return os.path.join(CACHE, str(sid), f'{mlbam}.json')


def fetch(api, ids, refresh):
    """Fill the per-(level, player) cache. Returns ids the API did not know."""
    unknown = set()
    for sid, lvl in SPORTS.items():
        todo = [i for i in ids if refresh or not os.path.exists(player_cache(sid, i))]
        for k in range(0, len(todo), BATCH):
            chunk = todo[k:k + BATCH]
            hyd = f'stats(group=[hitting,pitching],type=[yearByYear],gameType=R,sportId={sid})'
            d = api.get(f'/people?personIds={",".join(chunk)}&hydrate={hyd}')
            got = {str(p['id']): p for p in d.get('people', [])}
            for i in chunk:
                p = got.get(i)
                if p is None:
                    unknown.add(i)
                    continue
                write_json_atomic(player_cache(sid, i), {'name': p.get('fullName', ''), 'stats': p.get('stats', [])})
            print(f'  {lvl:<3} {min(k + BATCH, len(todo))}/{len(todo)}  (calls {api.calls})', file=sys.stderr)
    return unknown


# ------------------------------------------------------------------ build card rows

def iv(x):
    try:
        return int(x)
    except (TypeError, ValueError):
        return None


def outs_of(st):
    if st.get('outs') is not None:
        return iv(st['outs'])
    ip = str(st.get('inningsPitched') or '')
    if not ip:
        return None
    whole, _, frac = ip.partition('.')
    return int(whole or 0) * 3 + (int(frac) if frac else 0)


def rate(n, d, mult=1, nd=3, half_up=True):
    if not d or n is None:
        return ''
    if half_up:
        v = (Decimal(n) * mult / Decimal(d)).quantize(Decimal(1).scaleb(-nd), rounding=ROUND_HALF_UP)
        s = f'{v:.{nd}f}'
    else:
        s = f'{n * mult / d:.{nd}f}'
    return s[1:] if nd == 3 and s.startswith('0.') else s


def lines_for(mlbam, seasons, teams):
    lines, name = [], ''
    for sid, lvl in SPORTS.items():
        path = player_cache(sid, mlbam)
        if not os.path.exists(path):
            continue
        raw = json.load(open(path))
        name = name or raw.get('name', '')
        for s in raw['stats']:
            side = {'hitting': 'H', 'pitching': 'P'}.get(s.get('group', {}).get('displayName'))
            if not side:
                continue
            for sp in s.get('splits', []):
                yr = str(sp.get('season'))
                if yr not in seasons or sp.get('gameType', 'R') != 'R' or not sp.get('team'):
                    continue  # no team = the API's multi-team total; totals are built below
                if sp.get('sport', {}).get('id', sid) != sid:
                    continue
                tm = teams.get(yr, {}).get(str(sp['team']['id']), {})
                lg = sp.get('league', {}).get('name', '')
                level = COMPLEX.get(lg, 'Rk') if sid == 16 else lvl
                if sid == 1:
                    ab = tm.get('abbreviation') or ''
                    club = ORG.get(ab, ab) or sp['team'].get('name', '')
                    org = club
                else:
                    # franchiseName ("Scranton/Wilkes-Barre") reads like the baked labels; shortName
                    # abbreviates ("Scranton/WB"), so it is only the fallback
                    club = tm.get('franchiseName') or tm.get('shortName') or sp['team'].get('name', '')
                    club = CLUB_ALIAS.get(club, club)
                    parent = teams.get(yr, {}).get(str(tm.get('parentOrgId')), {})
                    if level in ('ACL', 'FCL') and club.startswith(level + ' '):
                        club = club[len(level) + 1:]
                    elif level == 'DSL' and parent.get('teamName'):
                        club = 'Dominican ' + parent['teamName']   # "DSL Royals Ventura" -> "Dominican Royals"
                    par = parent.get('abbreviation', '')
                    org = ORG.get(par, par)
                st = sp.get('stat', {})
                ln = dict(year=int(yr), side=side, level=level, club=club, org=org)
                for k, f in (H_MAP if side == 'H' else P_MAP).items():
                    ln[k] = iv(st.get(f))
                if side == 'H':
                    ln['h_'] = ln.pop('h')
                else:
                    if ln['g'] is None:
                        ln['g'] = iv(st.get('gamesPlayed'))
                    ln['outs'] = outs_of(st)
                lines.append(ln)
    return lines, name


def pick_sides(lines, primary):
    vol = {'H': sum(l.get('pa') or 0 for l in lines if l['side'] == 'H'),
           'P': sum(l.get('outs') or 0 for l in lines if l['side'] == 'P') / 3}
    has = {s: any(l['side'] == s for l in lines) for s in 'HP'}
    if primary not in ('H', 'P'):
        primary = 'H' if has['H'] and (not has['P'] or vol['H'] >= vol['P'] * 4.3) else ('P' if has['P'] else None)
    keep = {primary} if primary else set()
    other = 'P' if primary == 'H' else 'H'
    if has.get(other) and vol[other] >= (10 if other == 'P' else 30):
        keep.add(other)
    return [l for l in lines if l['side'] in keep]


def card_row(l, kind, level, club):
    if l['side'] == 'H':
        v = [l['g'], l['ab'], l['r'], l['h_'], l['hr'], l['rbi'], l['sb'], rate(l['h_'], l['ab'])]
    else:
        o = l['outs']
        v = [l['g'], l['gs'], f'{o // 3}.{o % 3}' if o is not None else '', l['w'], l['sv'],
             rate(l['er'], o, 27, 2) if o else '', l['so'], l['bb'], rate(l['so'], l['bb'], 1, 2, False)]
    return [l['year'], l['side'], kind, level, club] + ['' if x is None else x for x in v]


def card_rows(lines):
    out = []
    keys = ('g', 'ab', 'r', 'h_', 'hr', 'rbi', 'sb', 'pa', 'gs', 'w', 'sv', 'er', 'so', 'bb', 'outs')
    for yr in sorted({l['year'] for l in lines}):
        for side in 'HP':
            for mlb in (False, True):
                ls = [l for l in lines if l['year'] == yr and l['side'] == side and (l['level'] == 'MLB') == mlb]
                if not ls:
                    continue
                ls.sort(key=lambda l: (LVL_ORDER.get(l['level'], 9), l['org'], l['club']))
                out += [card_row(l, 0, l['level'], l['club']) for l in ls]
                if len(ls) >= 2:
                    t = dict(year=yr, side=side)
                    for k in keys:
                        vals = [l.get(k) for l in ls]
                        t[k] = None if any(x is None for x in vals) else sum(vals)
                    lv = []
                    for l in ls:
                        lv += [l['level']] if l['level'] not in lv else []
                    out.append(card_row(t, 1 if mlb else 2, 'MLB' if mlb else '-'.join(lv),
                                        'MLB Tot' if mlb else 'MiLB Tot'))
    return out


# ------------------------------------------------------------------ main

def write_outputs(out, result, meta):
    base, ext = os.path.splitext(out)
    targets = [out] if ext in ('.json', '.csv') else [base + '.json', base + '.csv']
    for t in targets:
        os.makedirs(os.path.dirname(os.path.abspath(t)), exist_ok=True)
        tmp = t + '.tmp'
        if t.endswith('.json'):
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump({'meta': meta, 'players': result}, f, indent=1)
        else:
            with open(tmp, 'w', encoding='utf-8', newline='') as f:
                w = csv.writer(f)
                w.writerow(CSV_COLS)
                for key, p in result.items():
                    for r in p['rows']:
                        head = [p['pool_id'], p['mlbam'], p['name'], r[0], r[1], r[2], r[3], r[4]]
                        if r[1] == 'H':
                            w.writerow(head + r[5:13] + [''] * 8)
                        else:  # G GS IP W SV ERA K BB K/BB
                            w.writerow(head + [r[5]] + [''] * 7 + r[6:14])
        os.replace(tmp, t)
        print(f'wrote {t}', file=sys.stderr)


def compare(result, cards):
    same = diff = 0
    for key, p in result.items():
        pid = p['pool_id']
        if not pid or pid not in cards:
            continue
        a = [[str(x) for x in r] for r in cards[pid]]
        b = [[str(x) for x in r] for r in p['rows']]
        if a == b:
            same += 1
            continue
        diff += 1
        print(f'\nMISMATCH {pid} {p["name"]} ({p["mlbam"]})')
        for r in a:
            if r not in b:
                print('  baked:', r)
        for r in b:
            if r not in a:
                print('  api:  ', r)
        if sorted(a) == sorted(b):
            print('  (same rows, different order)')
    print(f'\ncompare vs baked CARDS: {same} match, {diff} differ')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--ids', help='comma list of MLBAM ids and/or pool ids, or @file (one per line); '
                                  'default: every pool player in data/seed-2027.js with a mapped MLBAM')
    ap.add_argument('--seasons', default='2025,2026')
    ap.add_argument('--out', default=DEFAULT_OUT, help='path.json, path.csv, or a base path (writes both)')
    ap.add_argument('--map', action='append', help='pool_id,mlbam CSV (repeatable); default: db2027 files')
    ap.add_argument('--refresh', action='store_true', help='ignore the cache and re-request everything')
    ap.add_argument('--compare', action='store_true', help='print a diff against the CARDS rows baked in data/cards-2027.js')
    a = ap.parse_args()

    seasons = [s.strip() for s in a.seasons.split(',') if s.strip()]
    pool, cards = read_data()
    by_pid = {p['id']: p for p in pool}
    pmap = read_maps(a.map or DEFAULT_MAPS)
    by_mlbam = {v: k for k, v in pmap.items() if k in by_pid}

    if a.ids:
        raw = open(a.ids[1:]).read().split() if a.ids.startswith('@') else a.ids.split(',')
        want = []
        for x in (t.strip() for t in raw if t.strip()):
            if x.isdigit():
                want.append(x)
            elif x in pmap:
                want.append(pmap[x])
            else:
                print(f'skip {x}: not an MLBAM id and no mapped MLBAM for that pool id', file=sys.stderr)
    else:
        want = [pmap[p['id']] for p in pool if p['id'] in pmap]
        missing = [p for p in pool if p['id'] not in pmap]
        if missing:
            print(f'{len(missing)} pool players have no mapped MLBAM (skipped, not guessed):', file=sys.stderr)
            print('  ' + ', '.join(f'{p["name"]} ({p["id"]})' for p in missing), file=sys.stderr)
    want = list(dict.fromkeys(want))
    print(f'{len(want)} ids · seasons {",".join(seasons)} · cache {CACHE}', file=sys.stderr)

    t0 = time.time()
    api = Api()
    teams = {s: teams_table(api, s, a.refresh) for s in seasons}
    unknown = fetch(api, want, a.refresh)

    result = {}
    for m in want:
        if m in unknown:
            continue
        pid = by_mlbam.get(m, '')
        pl = by_pid.get(pid, {})
        lines, name = lines_for(m, seasons, teams)
        rows = card_rows(pick_sides(lines, pl.get('kind')))
        result[pid or f'mlbam:{m}'] = dict(pool_id=pid, mlbam=m, name=pl.get('name') or name, rows=rows)
    meta = dict(source='MLB Stats API (statsapi.mlb.com), yearByYear, gameType=R, sportId ' +
                       ','.join(map(str, SPORTS)), seasons=seasons, pulled=time.strftime('%Y-%m-%d %H:%M:%S'),
                row_shape='[year, side, kind(0 team/1 mlb_tot/2 milb_tot), level, club, ...] '
                          'H: G AB R H HR RBI SB AVG · P: G GS IP W SV ERA K BB K/BB',
                players=len(result), no_lines=sum(1 for p in result.values() if not p['rows']),
                unknown_ids=sorted(unknown), api_calls=api.calls)
    write_outputs(a.out, result, meta)
    print(f'{len(result)} players ({meta["no_lines"]} with no {"/".join(seasons)} line), '
          f'{len(unknown)} unknown ids, {api.calls} API calls, {time.time() - t0:.1f}s', file=sys.stderr)
    if unknown:
        print('unknown ids: ' + ','.join(sorted(unknown)), file=sys.stderr)
    if a.compare:
        compare(result, cards)


if __name__ == '__main__':
    main()
