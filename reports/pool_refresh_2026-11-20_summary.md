# CTHL pool refresh 11/20: summary

Branch `pkg-2026-11-20` (cut from app-v2 at e674299; live main is f8aca68). Not pushed. Spec: /workspace/db2027/specs/zuck_2026-11-20_package.md section 3, plus the 11/18 refresh method in /workspace/db2027/specs/refresh_2026-11-18_spec.md. Draft List PDF was not built.

## Pool count
- SEED2026.players: 701 before → 708 after (+7).
- Counted in the app after overrides (S.players = Draft List rows, all 15 AL clubs; headless load): 650 on the 11/18 refresh → **655** (+7 adds, +Sonny Gray restored from `fa`, −3 newly struck Luis Castillo, Davis Martin, Jesse Scholtens).
- SEED_VER `2027-actuals.8` → **`2027-actuals.9`**. APP_VER stays **`2026.11.20-1`** (already bumped in section 1). All seven data `?v=` tags stay on that version.
- BAKED_KEEPER_SET `2027-keeperval.3` → `2027-keeperval.4`. Walker Jenkins (`p6377140`, Money Bags) added to `CLEARED_BAKED_KEEPERS`.

## Keepers
Read-only GET of `drafts/steven-keepers-b442410a.json`. Saved pull matches the live room. meta.t **2026-11-20 13:39:24 ET**, lastWriter `admin-swap`. No Firebase write.
- **48 keepers / $512**. Junior Caminero `pabd0d7f` kept, Money Bags, **$32**. Walker Jenkins is not in the room.
- `node tools/sync-keepers.mjs --write`: before 48 / $485; after re-read MATCH 48 / $512.
- Money Bags: Caminero $32, Gavin Williams $8, Nick Kurtz $5, Chase DeLauter $3, Spencer Jones $3.

## Overrides (overrides-2027.json; backup overrides-2027.pre-2026-11-20.json)
Seed team of an existing player was not rewritten. The app shows the override. New adds have the new team on the seed row.
- Team set this round: Maikel Garcia SEA, James McArthur SEA, Bryce Miller KCR, Logan Evans KCR, José A. Ferrer KCR, Sonny Gray MIN (his `fa` status removed), Nick Fortes BOS, Jace Jung LAA, Braden Nett BAL, Carter Baumler BAL.
- Status set this round: Luis Castillo nl:COL, Davis Martin nl:COL, Jesse Scholtens fa.
- Spec 3.3 checked against statsapi transactions 2026-11-17 through 2026-11-21. Meyers has no transaction (current club Sugar Land, parent HOU). **Do not set fa.** Vierling, Bart, Mears, Juenger, Tur, Jake Miller, Sweeney, Isbel, Leasure, Wong, and Chase Lee show designation only. No status change.
- `pool_overrides.py --apply`: section 37 · team 17 · status 53 · exclude 0, all names matched, no warnings.

## Steamer re-pull (FanGraphs, pulled 11/20/2026)
- The 11/18 files (`2027_bat.json`, `2027_pit.json`, `match_report.csv`, `values_2027_steamer.csv`) are in `steamer/archive_2026-11-18/`. SHA256SUMS checks OK. Current bat 4,165 and pit 5,170 (same counts as 11/18, contents changed). No duplicate xMLBAMID.
- `METHOD.md` and the valuation.py source column already said **pulled 11/20/2026** before this session. The AAV report's Projections line is stamped the same way. The app UI shows no pull date.
- `match.py` was not edited. It still reads the stale cthl-live pool. A wrapper over this seed plus the overrides matched existing players from the 11/18 report (0 `fg_mlbam` flips, Fermin stays the 820862 pitcher). New and restored players were matched by the given MLBAM only. Then `valuation.py`: **653** rows, drafted-250 sum **$2,600.00**, replacement SGP H 3.45 / P 1.51, team BB 302. Groups: hitter 312, RP 235, SP 102, blank 4. The only drafted name outside the pool is Ramón Urías ($2).
- Seed `val` (`cthl_$_no750adj`) and `p27` rebuilt for the 649 players in the new values file. **val26 untouched** (Gray still 29, Caminero still 40). 46 vals changed. `tools/p27-card-fields.py --write` added 2,958 card fields on those 649. It exits 1 because 7 struck players still hold an old p27 and are no longer in the match file (Castillo, Martin, Scholtens, Foster, Abner, Hinds, Valera). Those old lines were left as they were.
- Zion Rose and Ace Reese have no Steamer line, so they are not in the match or values files (`val` null, no p27). The AAV engine cannot side a no-line player.

## AAV rerun (tools/aav_single_pass.py --write)
`KEEPERS_CSV` is `keeper_split_2026-11-20_room.csv`. Single pass, 250 slots, keepers 48 / $512, cash **$512 + $2,058 = $2,570**. Keeper curve dollars are display only (48 `k` values sum to $990 and are not in the cash).
- Solved pot **$3,051.18** (H $2,267.50 / P $783.68), implied inflation **1.1872** (H 1.1761 / P 1.2207), vs 11/18 **$3,033.93 / 1.1805** (**+$17.25 / +0.0067**).
- Generator diff vs `aav_run_2026-11-18.csv`: 75 moved (max $6 among names in the 250 both times), 5 added, 5 dropped; AAV board +7 / −3. Report: `reports/aav_run_2026-11-20.md` and `.csv` (`aav_1118`, `aav_change`, `proj_change_vs_1118`). 164 players changed rounded PA or IP vs the 11/18 JSON. 488 current board players are unchanged at the rounded PA or IP.
- Into the 250: Sonny Gray $16, Dustin May $3, Carson Roccaforte $4, Anthony Kay $2, Drew Burress $1 S (Ryan Sloan left the $1 stash and is $2 paid). Out: Ben Williamson, Luis Castillo, Ben Malgeri, Connor Prielipp, Dean Kremer, $2 each.
- **Walker Jenkins** `p6377140` is `{a:8}`, a regular non-keeper. The $8 is inside the $2,058. He is not a `{k}` fallback. Un-kept, the app shows $8. **Junior Caminero** is `{k:56}` against his $32 salary. Un-kept, the pool cell and the card box show $56, titled display-only. Setting every `k` to 999 does not move inflation, maxBid, `p.val`, the meter, or the money board.

### Top 15 AAV movers
Ranked by absolute AAV change, including names that entered or left the 250. A player who was not in the 11/18 run shows —. PA/IP is the rounded Steamer change, 11/20 JSON vs the 11/18 JSON, by MLBAM. The tie at ±$2 is broken alphabetically.

| # | Player | Team | Side | 11/18 | 11/20 | Change | PA/IP change vs 11/18 Steamer |
|---:|---|---|---|---:|---:|---:|---|
| 1 | Sonny Gray | MIN | P | — | $16 | +16 | IP +7 |
| 2 | Lazaro Montes | SEA | H | $10 K | $4 K | -6 | PA -102 |
| 3 | Maikel Garcia | SEA | H | $20 | $15 | -5 | PA -19 |
| 4 | Nick Loftin | KCR | H | $2 | $7 | +5 | PA +226 |
| 5 | Carson Roccaforte | KCR | H | $0 (not in 250) | $4 | +4 | PA +202 |
| 6 | Michael Arroyo | SEA | H | $6 K | $2 K | -4 | PA -83 |
| 7 | Dustin May | CHW | P | — | $3 | +3 | IP +9 |
| 8 | Michael Massey | KCR | H | $7 | $10 | +3 | PA +47 |
| 9 | Anthony Kay | CHW | P | $0 (not in 250) | $2 | +2 | IP +31 |
| 10 | Ben Malgeri | DET | H | $2 | $0 (not in 250) | -2 | PA -11 |
| 11 | Ben Williamson | TBR | H | $2 | $0 (not in 250) | -2 | PA +0 |
| 12 | Brendan Donovan | SEA | H | $9 | $7 | -2 | PA -43 |
| 13 | Bryce Miller | KCR | P | $4 | $2 | -2 | IP +29 |
| 14 | Cam Schlittler | NYY | P | $37 K | $35 K | -2 | IP +0 |
| 15 | Connor Prielipp | MIN | P | $2 | $0 (not in 250) | -2 | IP -27 |

## The 7 adds
Ids are `p` + md5("mlb" + MLBAM)[:7]. Team and position come from statsapi `people/{id}?hydrate=currentTeam(parent)`. No `pr`. No one else was added. May's transaction text has no contract dollars, so the "$52.5M" figure is not in the app.

| # | Name | Team | Pos (elig) | MLBAM | id | Steamer line | Stats pulled | AAV 11/20 |
|---:|---|---|---|---:|---|---|---|---:|
| 1 | Dustin May | CHW | SP | 669160 | pba6785e | yes, SP, IP 151 → 160 | yes | $3 |
| 2 | Sean Sullivan | CHW | RP | 807743 | pd57810d | yes, RP, IP 108 → 30 | yes | $0 |
| 3 | Christian Cairo | TOR | SS/MI | 686551 | pece81c2 | yes, hitter, PA 11 → 51 | yes | $0 |
| 4 | Zion Rose | KCR | OF | 805799 | p18b962a | no | yes | — |
| 5 | Justin Lamkin | KCR | SP | 703610 | p86b38f3 | yes, SP, IP 1 → 1 | yes | $0 |
| 6 | Vance Honeycutt | BAL | OF | 701689 | pf977fae | yes, hitter, PA 1 → 1 | yes | $0 |
| 7 | Kyle DeBarge | MIN | 2B/MI | 814414 | p7c99a58 | yes, hitter, PA 12 → 12 | yes | $0 |

Sonny Gray was already in the seed (team still BOS). The override puts him on MIN and back on the board: MLBAM 543243, SP, IP 168 → 175, AAV **$16**. He had no 2025-26 card row, so his stats were pulled with the adds.

## Flagged
- **Zion Rose** (KCR OF, MLBAM 805799): no Steamer line on either pull. Current club Surprise Saguaros, parentOrgId 118 (KCR). In the pool with `val` null and no p27. Left out of match, values, and AAV, same as Ace Reese. Card shows "No 2027 projection". 2026 A+ Quad Cities is on the card; no 2025 line.
- **Sean Sullivan**: the AL line is real and was not overwritten. IP fell from 108 (COL) to 30 (CHW). AAV $0.
- **Near-zero playing time**: Justin Lamkin 1 IP, Vance Honeycutt 1 PA, Kyle DeBarge 12 PA. All $0. Not overwritten.
- **Ace Reese** remains with no Steamer line and no AAV entry.
- Ryan Sloan's Steamer `val` is now 1, so the $1 prospect flag drops. `PROSPECT_FLOOR_IDS` still lists him. The frozen list was not edited.
- No add is missing an MLBAM id.

## Cards
- `pending_adds.py scan` queued 7 (Gray plus the six adds who have a values row). Rose was queued with a second scan via `--values` (one row). 8 pending, one batch: 8 pulled, 28 stat rows, 0 errors, 0 no_mlbam. 50 Stats API calls.
- QA: Sullivan 2025 A Fresno K/BB left blank (BB=0, the existing rule). Lamkin and Rose have no 2025 qualifying line. Lamkin's AA club was `NW Arkansas` from the adds pull and `Northwest Arkansas` from `mlb-stats-pull`; renamed so the pitch-hist match works. Fresno and Hartford are new clubs and were left as the API spelled them.
- `build_card_data.py --inject`: 661 players with stat rows, 3,126 rows, 618 write-ups. CARDS keys are `f`, `l`, `rk`, `s`, `w`. **No `t`.**
- `tools/mlb-stats-pull.py --cache /workspace/db2027/statsapi_cache`: 662 ids, 6 API calls, 5.7s. 46 pool players have no mapped MLBAM and were skipped, not guessed.
- `tools/pitch-hist-backfill.py --write`: 342 pitchers, **1,657 / 1,657** pitching rows filled, 0 unmatched, 0 stat differences. The previous 653 players' `s`, `w`, `f`, `l`, and `rk` are unchanged. Only the 8 new ids were added.

## Tests
- `tests/single_pass_test.mjs` 36/36. Reference board `tests/fixtures/ref_board_2026-11-20.csv` (source `3e75f73`). `compared === 202`, max diff $0. The 11/18 fixture was removed. `node tools/build-ref-board.mjs --check` OK.
- `tools/test-data-split.mjs` ALL PASS. Baseline for SEED2026 / AAV_2027 / CARDS is `b4f19a6`. CARDS check asserts no `t` and no "provisional" or "Top 100" in `w`.
- `tools/test-keeper-aav-fallback.mjs` ALL PASS. Un-kept subject is Caminero (`{k:56}`, salary $32). Jenkins is the priced `{a:8}` control. `k` set to 999 does not enter the pot.
- `tools/test-no-ranks-writeups.mjs` ALL PASS. Top Prospects button kept, tooltip "Show only top prospects". No rank on cards. 10 write-ups exact. $1 floor shows 9 names.
- `tools/test-card-lines.mjs` ALL PASS. Crochet projections K/BB is 4.29, which is `p27.KBB`. Rose is one of 6 cards with "No 2027 projection".
- `tools/test-rotoworld-links.mjs --expect 616/708` ALL PASS. The 7 adds did not add a link (was 616/701).
- `tools/test-seed-safety.mjs` ALL PASS.

## Judgment calls
1. Refreshed `val` / `p27` for every player in the new values file, not just the adds. val26 was not copied over. Keepers come from the room via `sync-keepers`, not from a hard-coded total.
2. Used a match.py-equivalent wrapper. `match.py` was not edited. The match report's team column is the override when one exists, else the seed team. Dollars do not use team.
3. Rose and Reese stay out of match and values so `aav_model.current()` does not raise on a missing side. Their cards were still pulled.
4. The PA/IP section of the AAV report was appended after `aav_single_pass.py --write`. The script's only edit is `KEEPERS_CSV` (and the docstring) pointing at the 11/20 room file.
5. Gray was included in the card pull because he had no 2025-26 row. He is not one of the seven seed adds.
6. Sullivan's IP drop and the three near-zero lines were flagged, not replaced.
7. May's reported contract dollars are not in the app. The transaction text does not include them.
8. The $1 prospect-floor id list was not edited. Sloan drops off the displayed flag because `val` is now 1.

Files outside the repo (not committed): `cthl-backup/overrides-2027.json` and `overrides-2027.pre-2026-11-20.json`; `db2027/steamer/match_report.csv` and `values_2027_steamer.csv` (the 11/18 copies stay in the archive); `db2027/cards/` pending, stats, coverage, and QA files; `db2027/keepers/` room json and `keeper_split_2026-11-20_room.csv`.
