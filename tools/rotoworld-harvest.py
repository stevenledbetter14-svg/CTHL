#!/usr/bin/env python3
"""Harvest Rotoworld / NBC Sports player page ids for the CTHL pool.

Player pages live at:
  https://www.nbcsports.com/mlb/{slug}/{id}/news
The slug is derived from the name; the id is not. Two id formats exist:
numeric (48173) and UUID (00000188-9cf0-da6b-abd8-fcfd86be00a9). There is
no slug-only fallback (/mlb/bobby-witt-jr/news returns 404).

DO NOT use site search as a primary source. /search?q=Jose Ramirez returns
the wrong Jose Ramirez (three exist). Team-scoped pages disambiguate by club.

Discovery methods (all honored with robots.txt Crawl-delay: 10):
  1. /mlb/{team-slug}/stats          — server-rendered roster; primary,
                                       team-authoritative. Misses many
                                       minor leaguers.
  2. /mlb/{team-slug}/player-news    — additional org names, including some
                                       prospects with UUID ids.
  3. NBC Sports sitemaps             — monthly + sitemap-latest.xml include
                                       /mlb/{slug}/{id} profile URLs,
                                       including UUID prospect pages.
                                       No team on the URL; use only when
                                       the slug is unique or a team page
                                       already named the same slug.

Never overwrite an existing ROTOID / seed rwId+rwSlug entry unless the
player's team changed and the new team-page match disagrees.

Adopted into the repo 2026-11-20 from Eno's prototype
(/workspace/db2027/tools/rotoworld_harvest.py; spec zuck_2026-11-20_package.md
section 2). Run it on every pool refresh, after the new seed is in data/.

Usage (from the repo root; --rotoid / --seed default to data/rotoid.js and
data/seed-2027.js; without --missing the list is every pool player the app's
rotoUrl() cannot link: no seed rwId+rwSlug and no ROTOID[knorm(name)]):
  python3 tools/rotoworld-harvest.py --sitemap-years all \\
      --prev-seed /tmp/seed-2027.prev.js \\
      --out reports/rotoid_harvest_<date>.csv [--write-rotoid]

  # merge an existing harvest CSV without crawling:
  python3 tools/rotoworld-harvest.py --from-csv reports/rotoid_harvest_<date>.csv \\
      --out /tmp/merge.csv --write-rotoid

Writes --out, <out>_spotcheck.csv (crawl runs) and <out>_unresolved.csv
(ambiguous / unmatched, with candidate ids). --write-rotoid adds matched keys
to data/rotoid.js; it never replaces a stored key except the team-changed case
(--prev-seed), and refuses a key whose knorm(name) belongs to two pool players
(those need a per-player rwId/rwSlug on the seed row; listed, not written).
Bump APP_VER (every data/*.js?v= tag) when rotoid.js changes.

Respects --delay (default 10, raised to robots.txt Crawl-delay if higher).
Never fetches /api/, /cms/, /delivery/graphql/ or /graphql/delivery/.
--sitemap-years 2023-2026 limits which monthly sitemaps are pulled (pass
'all' for the full index).
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
import unicodedata
from collections import defaultdict
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
UA = "CTHL-research/1.0 (Rotoworld harvest; polite; honors crawl-delay 10)"
BASE = "https://www.nbcsports.com"
# robots.txt Disallow (2026-11-20); Fetcher.get refuses these paths.
DISALLOWED = ("/api/", "/cms/", "/delivery/graphql/", "/graphql/delivery/")
ROBOTS = BASE + "/robots.txt"
SITEMAP_INDEX = BASE + "/sitemap.xml"

TEAMS = {
    "baltimore-orioles": "BAL",
    "boston-red-sox": "BOS",
    "chicago-white-sox": "CHW",
    "cleveland-guardians": "CLE",
    "detroit-tigers": "DET",
    "houston-astros": "HOU",
    "kansas-city-royals": "KCR",
    "los-angeles-angels": "LAA",
    "minnesota-twins": "MIN",
    "new-york-yankees": "NYY",
    "athletics": "ATH",
    "seattle-mariners": "SEA",
    "tampa-bay-rays": "TBR",
    "texas-rangers": "TEX",
    "toronto-blue-jays": "TOR",
}

PLAYER_RE = re.compile(
    r"/mlb/([a-z0-9-]+)/([0-9a-f][0-9a-f-]{3,})(?=[/\"'?<>\s]|$)",
    re.I,
)
LOC_RE = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>", re.I)


def knorm(name: str) -> str:
    """Same rules as index.html knorm(): ROTOID lookup key."""
    s = unicodedata.normalize("NFD", str(name))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"\b(Jr\.?|Sr\.?|II|III|IV)\b", "", s, flags=re.I)
    return re.sub(r"[^a-z]", "", s.lower())


def slugify(name: str) -> str:
    """NBC Sports player-page slug rules (from rotoworld-id-harvest.md).

    Periods become hyphens (not deleted): J.P. Crawford -> j-p-crawford.
    Apostrophes are deleted: Tyler O'Neill -> tyler-oneill.
    Accents stripped. Trailing punctuation trimmed: Bobby Witt Jr. -> bobby-witt-jr.
    """
    s = unicodedata.normalize("NFD", str(name))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower()
    s = s.replace(".", "-").replace("'", "").replace("’", "")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def player_url(slug: str, pid: str) -> str:
    return f"{BASE}/mlb/{slug}/{pid}/news"


class Fetcher:
    def __init__(self, delay: float = 10.0, timeout: int = 60):
        self.delay = delay
        self.timeout = timeout
        self._last = 0.0
        self.n = 0

    def get(self, url: str) -> tuple[int, str]:
        path = urlparse(url).path
        if any(path.startswith(d) for d in DISALLOWED):
            raise SystemExit(f"refusing robots.txt-disallowed path: {url}")
        wait = self.delay - (time.time() - self._last)
        if self._last and wait > 0:
            time.sleep(wait)
        req = Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xml;q=0.9,*/*;q=0.8"})
        try:
            with urlopen(req, timeout=self.timeout) as r:
                status = getattr(r, "status", 200)
                body = r.read()
                # charset
                text = body.decode("utf-8", errors="replace")
        except Exception as e:
            self._last = time.time()
            self.n += 1
            print(f"  FETCH ERR {url} {type(e).__name__}: {e}", file=sys.stderr)
            return 0, ""
        self._last = time.time()
        self.n += 1
        print(f"  FETCH {status} {len(text):7d}  {url}", file=sys.stderr)
        return status, text


def extract_players(html: str) -> list[tuple[str, str]]:
    """Return (slug, id) in first-seen order."""
    out, seen = [], set()
    for slug, pid in PLAYER_RE.findall(html or ""):
        slug, pid = slug.lower(), pid.lower()
        key = (slug, pid)
        if key in seen:
            continue
        seen.add(key)
        out.append((slug, pid))
    return out


def parse_rotoid(path: Path) -> dict[str, list[str]]:
    txt = path.read_text(encoding="utf-8")
    m = re.search(r"const ROTOID\s*=\s*(\{.*\})\s*;", txt, re.S)
    if not m:
        raise SystemExit(f"no ROTOID object in {path}")
    return json.loads(m.group(1))


def parse_seed(path: Path) -> list[dict]:
    txt = path.read_text(encoding="utf-8")
    m = re.search(r"const SEED2026\s*=\s*(\{.*\})\s*;", txt, re.S)
    if not m:
        raise SystemExit(f"no SEED2026 object in {path}")
    return json.loads(m.group(1))["players"]


def existing_links(rotoid: dict, players: list[dict]) -> dict[str, dict]:
    """pool_id -> {slug,id,source} for anyone who already has a link."""
    have = {}
    rotoid_by_knorm = rotoid
    for p in players:
        pid = p["id"]
        if p.get("rwId") and p.get("rwSlug"):
            have[pid] = {
                "slug": p["rwSlug"],
                "id": str(p["rwId"]),
                "source": "seed_rw",
            }
            continue
        hit = rotoid_by_knorm.get(knorm(p["name"]))
        if hit:
            have[pid] = {"slug": hit[0], "id": str(hit[1]), "source": "rotoid"}
    return have


def harvest_team_pages(fetcher: Fetcher) -> dict[str, dict]:
    """slug|TEAM -> {slug,id,team,source,url} from /stats and /player-news."""
    found = {}
    for tslug, team in TEAMS.items():
        for path, method in (("/stats", "team_stats"), ("/player-news", "team_player_news")):
            url = f"{BASE}/mlb/{tslug}{path}"
            status, html = fetcher.get(url)
            if status != 200:
                continue
            for slug, pid in extract_players(html):
                key = f"{slug}|{team}"
                if key not in found:
                    found[key] = {
                        "slug": slug,
                        "id": pid,
                        "team": team,
                        "source": method,
                        "url": player_url(slug, pid),
                        "page": url,
                    }
    return found


def sitemap_urls(fetcher: Fetcher, years: set[str] | None) -> list[str]:
    status, xml = fetcher.get(SITEMAP_INDEX)
    if status != 200:
        return []
    locs = LOC_RE.findall(xml)
    # always include latest
    keep = []
    for loc in locs:
        fn = loc.rstrip("/").rsplit("/", 1)[-1]
        if fn == "sitemap-latest.xml":
            keep.append(loc)
            continue
        m = re.search(r"sitemap-(\d{4})\d{2}\.xml", fn)
        if m and (years is None or m.group(1) in years):
            keep.append(loc)
    return keep


def harvest_sitemaps(fetcher: Fetcher, urls: list[str]) -> dict[str, list[dict]]:
    """slug -> list of {slug,id,url,sitemap} (a slug may have more than one id)."""
    by_slug = defaultdict(list)
    seen = set()
    for sm_url in urls:
        status, xml = fetcher.get(sm_url)
        if status != 200:
            continue
        for loc in LOC_RE.findall(xml):
            m = PLAYER_RE.search(loc)
            if not m:
                continue
            slug, pid = m.group(1).lower(), m.group(2).lower()
            key = (slug, pid)
            if key in seen:
                continue
            seen.add(key)
            by_slug[slug].append(
                {
                    "slug": slug,
                    "id": pid,
                    "url": player_url(slug, pid),
                    "source": "sitemap",
                    "sitemap": sm_url,
                }
            )
    return by_slug


def load_missing(path: Path) -> list[dict]:
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    if not rows:
        raise SystemExit(f"no rows in {path}")
    return rows


def match_missing(
    missing: list[dict],
    team_hits: dict,
    sitemap: dict[str, list[dict]],
    already: dict,
) -> list[dict]:
    """Fill only players who do not already have a link."""
    out = []
    for row in missing:
        pool_id, name, team = row["id"], row["name"], row["team"]
        if pool_id in already:
            continue
        slug = slugify(name)
        rec = {
            "pool_id": pool_id,
            "name": name,
            "team": team,
            "slug": "",
            "id": "",
            "source_url": "",
            "match_method": "",
            "candidates": "",
        }
        # 1. exact slug|TEAM from a team-scoped page (authoritative)
        th = team_hits.get(f"{slug}|{team}")
        if th:
            rec.update(
                slug=th["slug"],
                id=th["id"],
                source_url=th["url"],
                match_method=th["source"],
            )
            out.append(rec)
            continue
        # 2. unique slug across all team pages (player maybe listed under a
        #    previous club). Only if that slug appears for exactly one team.
        team_alts = [v for k, v in team_hits.items() if k.startswith(slug + "|")]
        if len(team_alts) == 1:
            th = team_alts[0]
            rec.update(
                slug=th["slug"],
                id=th["id"],
                source_url=th["url"],
                match_method=th["source"] + "_unique_slug_other_team",
            )
            out.append(rec)
            continue
        if len(team_alts) > 1:
            rec["match_method"] = "ambiguous_team_pages"
            rec["candidates"] = ";".join(f"{v['team']}:{v['slug']}/{v['id']}" for v in team_alts)
            out.append(rec)
            continue
        # 3. sitemap: only if this slug maps to exactly one id
        sm = sitemap.get(slug) or []
        ids = {x["id"] for x in sm}
        if len(ids) == 1:
            hit = sm[0]
            rec.update(
                slug=hit["slug"],
                id=hit["id"],
                source_url=hit["url"],
                match_method="sitemap_unique_slug",
            )
            out.append(rec)
            continue
        if len(ids) > 1:
            rec["match_method"] = "ambiguous_sitemap"
            rec["candidates"] = ";".join(f"{x['slug']}/{x['id']}" for x in sm)
            out.append(rec)
            continue
        rec["match_method"] = "unmatched"
        out.append(rec)
    return out


def apply_known_overrides(rows: list[dict], overrides: list[dict]) -> None:
    """Verified URLs that the automated pass cannot discover (e.g. Steven's
    Joseph Dzierwa example, confirmed HTTP 200 + correct team on the page)."""
    by_id = {r["pool_id"]: r for r in rows}
    for o in overrides:
        r = by_id.get(o["pool_id"])
        if not r:
            continue
        if r.get("id") and r["id"] != o["id"]:
            # already matched something else; leave it and note
            r["match_method"] = r["match_method"] + "+override_conflict"
            continue
        if r.get("id"):
            continue
        r.update(
            slug=o["slug"],
            id=o["id"],
            source_url=o["url"],
            match_method="provided_example_verified",
        )


def spotcheck(fetcher: Fetcher, rows: list[dict], n: int = 10) -> list[dict]:
    """HEAD/GET n matched links; confirm 200 and the player name/team appear."""
    matched = [r for r in rows if r.get("id")]
    # prefer a mix: team_stats, sitemap, uuid, provided example
    picked, used = [], set()

    def take(pred, k):
        for r in matched:
            if r["pool_id"] in used:
                continue
            if pred(r):
                picked.append(r)
                used.add(r["pool_id"])
                if len([x for x in picked if pred(x)]) >= k:
                    break

    take(lambda r: r["match_method"] == "provided_example_verified", 1)
    take(lambda r: r["match_method"] == "team_stats", 3)
    take(lambda r: r["match_method"] == "team_player_news", 2)
    take(lambda r: r["match_method"] == "sitemap_unique_slug" and "-" in r["id"], 2)
    take(lambda r: r["match_method"] == "sitemap_unique_slug", 2)
    take(lambda r: True, n)
    picked = picked[:n]
    results = []
    for r in picked:
        url = r["source_url"]
        status, html = fetcher.get(url)
        name = r["name"]
        # loose name check: last token and first token should appear
        parts = re.sub(r"[^A-Za-z0-9 ]", " ", name).split()
        last = parts[-1] if parts else ""
        first = parts[0] if parts else ""
        blob = unicodedata.normalize("NFD", html)
        blob = "".join(c for c in blob if unicodedata.category(c) != "Mn").lower()
        name_ok = last.lower() in blob and first.lower() in blob
        # team word
        team_words = {
            "BAL": "orioles",
            "BOS": "red sox",
            "CHW": "white sox",
            "CLE": "guardians",
            "DET": "tigers",
            "HOU": "astros",
            "KCR": "royals",
            "LAA": "angels",
            "MIN": "twins",
            "NYY": "yankees",
            "ATH": "athletics",
            "SEA": "mariners",
            "TBR": "rays",
            "TEX": "rangers",
            "TOR": "blue jays",
        }
        team_ok = team_words.get(r["team"], r["team"].lower()) in blob
        results.append(
            {
                **r,
                "http": status,
                "name_ok": name_ok,
                "team_ok": team_ok,
                "pass": status == 200 and name_ok,
            }
        )
        print(
            f"  SPOT {status} name_ok={name_ok} team_ok={team_ok}  {r['name']} ({r['team']})  {url}",
            file=sys.stderr,
        )
    return results


def derive_missing(players: list[dict], already: dict) -> list[dict]:
    """Pool players rotoUrl() cannot link (no seed rwId+rwSlug, no ROTOID key)."""
    return [
        {"id": p["id"], "name": p["name"], "team": p.get("team", "")}
        for p in players
        if p["id"] not in already
    ]


def team_changed(
    players: list[dict],
    prev_players: list[dict],
    team_hits: dict,
    already: dict,
) -> list[dict]:
    """Linked players whose club changed since --prev-seed AND whose new club's
    team page names their slug with a different id. The only case in which a
    stored link may be replaced (spec 2.2)."""
    prev_team = {p["id"]: p.get("team", "") for p in prev_players}
    out = []
    for p in players:
        have = already.get(p["id"])
        old = prev_team.get(p["id"])
        if not have or old is None or old == p.get("team", ""):
            continue
        th = team_hits.get(f"{have['slug']}|{p.get('team', '')}") or team_hits.get(
            f"{slugify(p['name'])}|{p.get('team', '')}"
        )
        if not th or th["id"] == have["id"]:
            continue
        out.append(
            {
                "pool_id": p["id"],
                "name": p["name"],
                "team": p.get("team", ""),
                "slug": th["slug"],
                "id": th["id"],
                "source_url": th["url"],
                "match_method": f"team_changed_{old}_to_{p.get('team', '')}"
                + ("_seed_rw_edit_by_hand" if have["source"] == "seed_rw" else ""),
                "candidates": f"stored:{have['slug']}/{have['id']}",
                "_replace": have["source"] == "rotoid",
            }
        )
    return out


def load_harvest_csv(path: Path, players: list[dict], already: dict) -> list[dict]:
    """Rows of an earlier run (--from-csv). Matched rows must name a pool player
    who still has no link and whose name has not changed."""
    by_id = {p["id"]: p for p in players}
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    for r in rows:
        r.setdefault("candidates", "")
        p = by_id.get(r["pool_id"])
        if not p:
            raise SystemExit(f"{path}: pool id {r['pool_id']} ({r['name']}) is not in the seed")
        if knorm(p["name"]) != knorm(r["name"]):
            raise SystemExit(f"{path}: {r['pool_id']} is {p['name']!r} in the seed, {r['name']!r} in the csv")
        if r.get("id") and r["pool_id"] in already:
            raise SystemExit(f"{path}: {r['name']} ({r['pool_id']}) already has a link; refusing to overwrite")
    return rows


def write_rotoid(path: Path, rows: list[dict], players: list[dict], rotoid: dict) -> dict:
    """Add matched rows to data/rotoid.js. Returns counts + refused rows."""
    pool_by_key = defaultdict(list)
    for p in players:
        pool_by_key[knorm(p["name"])].append(p["id"])
    added, replaced, refused = 0, 0, []
    for r in rows:
        if not r.get("id"):
            continue
        k = knorm(r["name"])
        val = [r["slug"], r["id"]]
        if len(pool_by_key[k]) > 1:
            refused.append({**r, "reason": "knorm_shared_by_" + "+".join(pool_by_key[k]) + "_needs_rwId_override"})
            continue
        if k in rotoid:
            if rotoid[k] == val:
                continue
            if r.get("_replace"):
                rotoid[k] = val
                replaced += 1
                continue
            refused.append({**r, "reason": f"rotoid_key_exists:{rotoid[k][0]}/{rotoid[k][1]}"})
            continue
        if r["match_method"].startswith("team_changed_"):
            continue  # seed rwId row: edit by hand
        rotoid[k] = val
        added += 1
    txt = path.read_text(encoding="utf-8")
    m = re.search(r"const ROTOID\s*=\s*(\{.*\})\s*;", txt, re.S)
    body = json.dumps(rotoid, separators=(",", ":"), ensure_ascii=False)
    path.write_text(txt[: m.start(1)] + body + txt[m.end(1):], encoding="utf-8")
    return {"added": added, "replaced": replaced, "refused": refused}


def write_unresolved(path: Path, rows: list[dict]) -> int:
    fields = ["name", "pool_id", "team", "reason", "candidates"]
    left = [r for r in rows if not r.get("id")]
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in left:
            w.writerow(
                {
                    "name": r["name"],
                    "pool_id": r["pool_id"],
                    "team": r["team"],
                    "reason": r["match_method"],
                    "candidates": r.get("candidates", ""),
                }
            )
    return len(left)


# Steven's worked example, verified 2026-11-20: HTTP 200, page title
# "Joseph Dzierwa", team link /mlb/baltimore-orioles.
KNOWN = [
    {
        "pool_id": "pe7b3e25",
        "slug": "joseph-dzierwa",
        "id": "0000019f-dc26-de18-afdf-fc6e70270000",
        "url": "https://www.nbcsports.com/mlb/joseph-dzierwa/0000019f-dc26-de18-afdf-fc6e70270000/news",
    }
]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--missing", default="", help="csv id,name,team; default: derived from --seed/--rotoid")
    ap.add_argument("--rotoid", default=str(ROOT / "data" / "rotoid.js"))
    ap.add_argument("--seed", default=str(ROOT / "data" / "seed-2027.js"))
    ap.add_argument("--prev-seed", default="", help="previous seed-2027.js, for the team-changed rule")
    ap.add_argument("--out", required=True)
    ap.add_argument("--from-csv", default="", help="merge an earlier harvest csv; no fetches")
    ap.add_argument("--write-rotoid", action="store_true", help="add matched keys to --rotoid")
    ap.add_argument("--delay", type=float, default=10.0)
    ap.add_argument("--sitemap-years", default="2023-2026",
                    help="comma years, a range like 2023-2026, or 'all'")
    ap.add_argument("--skip-sitemaps", action="store_true")
    ap.add_argument("--skip-teams", action="store_true")
    ap.add_argument("--spotcheck", type=int, default=10)
    ap.add_argument("--cache-dir", default="")
    args = ap.parse_args()

    years = None
    if args.sitemap_years.strip().lower() == "all":
        years = None
    elif re.fullmatch(r"\d{4}-\d{4}", args.sitemap_years.strip()):
        a, b = args.sitemap_years.split("-")
        years = {str(y) for y in range(int(a), int(b) + 1)}
    else:
        years = {y.strip() for y in args.sitemap_years.split(",") if y.strip()}

    rotoid = parse_rotoid(Path(args.rotoid))
    players = parse_seed(Path(args.seed))
    already = existing_links(rotoid, players)
    missing = load_missing(Path(args.missing)) if args.missing else derive_missing(players, already)
    print(
        f"pool {len(players)}; existing links {len(already)}; missing {len(missing)}",
        file=sys.stderr,
    )

    fetcher = Fetcher(delay=args.delay)
    checks = []
    if args.from_csv:
        rows = load_harvest_csv(Path(args.from_csv), players, already)
        print(f"from-csv {args.from_csv}: {len(rows)} rows, no fetches", file=sys.stderr)
    else:
        # robots.txt once, to honor crawl-delay if it changes
        st, robots = fetcher.get(ROBOTS)
        m = re.search(r"Crawl-delay:\s*([0-9.]+)", robots or "", re.I)
        if m:
            cd = float(m.group(1))
            if cd > fetcher.delay:
                print(f"raising delay to robots.txt Crawl-delay {cd}", file=sys.stderr)
                fetcher.delay = cd

        team_hits = {} if args.skip_teams else harvest_team_pages(fetcher)
        print(f"team-page keys {len(team_hits)}", file=sys.stderr)

        sitemap = {}
        if not args.skip_sitemaps:
            sm_urls = sitemap_urls(fetcher, years)
            print(f"sitemaps to pull {len(sm_urls)} (years={sorted(years) if years else 'all'})", file=sys.stderr)
            sitemap = harvest_sitemaps(fetcher, sm_urls)
            print(f"sitemap unique slugs {len(sitemap)}", file=sys.stderr)

        rows = match_missing(missing, team_hits, sitemap, already)
        apply_known_overrides(rows, KNOWN)
        if args.prev_seed:
            moved = team_changed(players, parse_seed(Path(args.prev_seed)), team_hits, already)
            print(f"team-changed with a new team-page id: {len(moved)}", file=sys.stderr)
            rows.extend(moved)

    outp = Path(args.out)
    outp.parent.mkdir(parents=True, exist_ok=True)
    fields = ["pool_id", "name", "team", "slug", "id", "source_url", "match_method", "candidates"]
    with outp.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fields})

    matched = sum(1 for r in rows if r.get("id"))
    methods = defaultdict(int)
    for r in rows:
        methods[r.get("match_method") or ""] += 1
    print(f"wrote {outp}  matched {matched} of {len(rows)} missing", file=sys.stderr)
    for k, v in sorted(methods.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {v:4d}  {k}", file=sys.stderr)

    unres = outp.with_name(outp.stem + "_unresolved.csv")
    print(f"wrote {unres}  {write_unresolved(unres, rows)} unresolved (no auto-pick)", file=sys.stderr)

    if args.spotcheck and matched and not args.from_csv:
        checks = spotcheck(fetcher, rows, args.spotcheck)
        ok = sum(1 for c in checks if c["pass"])
        print(f"spotcheck {ok}/{len(checks)} passed (HTTP 200 + name on page)", file=sys.stderr)
        chk_path = outp.with_name(outp.stem + "_spotcheck.csv")
        sfields = fields[:-1] + ["http", "name_ok", "team_ok", "pass"]
        with chk_path.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=sfields)
            w.writeheader()
            for c in checks:
                w.writerow({k: c.get(k, "") for k in sfields})
        print(f"wrote {chk_path}", file=sys.stderr)

    if args.write_rotoid:
        res = write_rotoid(Path(args.rotoid), rows, players, rotoid)
        print(
            f"{args.rotoid}: +{res['added']} keys, {res['replaced']} replaced (team changed), "
            f"{len(res['refused'])} refused; now {len(rotoid)} keys",
            file=sys.stderr,
        )
        for r in res["refused"]:
            print(f"  REFUSED {r['name']} ({r['pool_id']} {r['team']}) {r['slug']}/{r['id']}: {r['reason']}",
                  file=sys.stderr)

    print(f"fetches {fetcher.n}", file=sys.stderr)


if __name__ == "__main__":
    main()
