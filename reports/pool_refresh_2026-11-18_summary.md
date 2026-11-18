# CTHL pool refresh 11/18 (Rule 5): summary

Branch `pool-refresh-1118` (from app-v2 d58019a). Preview only: not pushed, not deployed, not merged. Spec: /workspace/db2027/specs/refresh_2026-11-18_spec.md, plus Eno's Steamer re-pull addition.

## Pool count
- SEED2026.players: 667 before → 701 after (+34).
- Counted in the app after overrides (S.players = Draft List rows, all 15 AL clubs; headless file:// load): 618 before → 650 after (+34 adds, +2 restored Bednar/Jeffers, −4 newly struck Foster/Abner/Hinds/Valera).
- SEED_VER 2027-actuals.7 → 2027-actuals.8. APP_VER 2026.11.17-1 → 2026.11.18-1, and the six data `?v=` tags to match.

## Overrides (overrides-2027.json; backup overrides-2027.pre-2026-11-18.json)
- Restored: David Bednar (NYY), Ryan Jeffers (MIN). Status removed and team entry set.
- Team: Raymond Burgos ATH, Chase Hampton NYY, Josh White TEX. Tsung-Che Cheng DET and Nate Eaton ATH were already set (no change).
- Status: Cameron Foster nl:ATL, Philip Abner nl:WSH, Rece Hinds fa, George Valera fa. Tarik Skubal was already fa (no change).
- **Casey Mize: not in the pool** (no SEED2026 entry), so no status was set. pool_overrides.py would stop on NOT FOUND.
- The 9 DFA-pending players are unchanged. The 7 NRIs were skipped.
- pool_overrides.py: section 37 · team 7 · status 51 · exclude 0, all names matched. Re-run against the new pool: no change.

## Steamer re-pull (FanGraphs, 2026-11-18)
- The 11/4 files (2027_bat.json, 2027_pit.json, match_report.csv, values_2027_steamer.csv) were copied to /workspace/db2027/steamer/archive_2026-11-04/ (checksums match).
- Fetched https://www.fangraphs.com/api/projections?type=steamer&stats=bat and &stats=pit. A plain curl GET returned HTTP 200 application/json with the full raw array (no Cloudflare block, no workaround needed), saved as-is.
- Record counts: bat 4,166 (11/4) → 4,165 (11/18); pit 5,169 → 5,170. Column sets identical.
- BOS sanity checks (all PASS): Jarren Duran 345.3 PA (was 522.8) PASS; Jake Bauers 502.4 PA, BOS PASS; Adley Rutschman BOS PASS; Caleb Durbin BOS PASS; Willson Contreras BOS PASS (William Contreras is MIL); Curtis Mead BOS PASS.
- Stamped "pulled 11/18/2026" in steamer/METHOD.md, in the valuation.py `source` column (values_2027_steamer.csv), and on the AAV report's Projections line. The app UI shows no pull date anywhere.
- match/valuation: steamer/match.py reads its pool from the stale /workspace/cthl-live 11/4 build, so I ran an equivalent wrapper over the CTHL-v2 live pool. Existing players keep their 11/4 MLBAM match, including the Fermin 820862 fix; restored and new players are matched by MLBAM. Then valuation.py: 649 rows, the drafted 250 sum to $2,600.
- Seed: `val` (cthl_$_no750adj) and `p27` were rebuilt from the new pull for all 649 live priced players (same logic as steamer_2027.py; val26 untouched), then tools/p27-card-fields.py --write. 645 have a p27 line; no line: Booth, Rojas, Emerson, Cholowsky (as before) and Ace Reese.

## AAV rerun (tools/aav_single_pass.py --write)
Same method: single pass, 250 slots, keepers 48 / $485 from keeper_split_2026-11-16_room.csv, cash $485 + $2,085 = $2,570.
- Solved pot **$3,033.93** (H $2,242.36 / P $791.57), implied inflation **1.1805** (H 1.1631 / P 1.2330), vs 11/16 $3,054.11 / 1.1884 (−$20.18 / −0.0079).
- 64 moved (max $13), 7 added to the 250, 7 dropped. See reports/aav_run_2026-11-18.md for why only 7 were added vs +35 pool.

### Top 15 AAV movers
| # | Player | Team | Side | 11/16 | 11/18 | Change | PA/IP change vs 11/4 Steamer |
|---:|---|---|---|---:|---:|---:|---|
| 1 | David Bednar | NYY | P | — | $23 | +23 | IP -1 |
| 2 | Jake Bauers | BOS | H | — | $18 | +18 | PA -9 |
| 3 | Grant Taylor | CHW | P | $20 K | $7 K | -13 | IP +61 |
| 4 | Jarren Duran | BOS | H | $16 | $5 | -11 | PA -177 |
| 5 | Ryan Jeffers | MIN | H | — | $11 | +11 | PA +37 |
| 6 | Emilio Pagán | DET | P | — | $10 | +10 | IP +1 |
| 7 | Brent Headrick | NYY | P | $9 | $2 | -7 | IP +0 |
| 8 | Ryan Weathers | NYY | P | $8 | $2 | -6 | IP -19 |
| 9 | Tyler Holton | DET | P | $5 | $0 | -5 | IP +0 |
| 10 | Wilyer Abreu | BOS | H | $24 | $19 | -5 | PA -42 |
| 11 | Clarke Schmidt | NYY | P | $6 | $2 | -4 | IP -3 |
| 12 | Isaac Paredes | HOU | H | $18 | $22 | +4 | PA +52 |
| 13 | Christian Encarnacion-Strand | BAL | H | $9 | $12 | +3 | PA +42 |
| 14 | Yordan Alvarez | HOU | H | $40 | $43 | +3 | PA +23 |
| 15 | Bryan Hudson | CHW | P | $0 (not in 250) | $2 | +2 | IP +0 |

The tie at ±$2 for #15 is broken alphabetically. Bednar and Jeffers show — because they were struck on 11/16 and not in that run.

## The 34 adds
All 34 have an MLBAM id. Team/pos for the 30 come from snapshot_2026-11-18_1113.json; the 4 prospects come from statsapi people/{id}. Pitcher SP/RP comes from the Steamer group. Ids are p+md5("mlb<MLBAM>")[:7]. None was already in the pool.

| # | Name | Team | Pos (elig) | MLBAM | Steamer line | MLBAM yes/no | Stats pulled | AAV 11/18 |
|---:|---|---|---|---|---|---|---|---:|
| 1 | Cole Conn | ATH | C | 813833 | yes | yes | yes | $0 |
| 2 | Yaqui Rivera | ATH | RP | 700072 | yes | yes | yes | $0 |
| 3 | Xavier Isaac | TBR | 1B/CI | 800060 | yes | yes | yes | $0 |
| 4 | Daniel Guerra | TOR | RP | 806413 | yes | yes | yes | $0 |
| 5 | RJ Schreck | TOR | OF | 702302 | yes | yes | yes | $0 |
| 6 | Jaden Woods | CHW | RP | 692243 | yes | yes | yes | $0 |
| 7 | William Bergolla Jr. | CHW | 2B/MI | 703151 | yes | yes | yes | $0 |
| 8 | Carlos Lagrange | NYY | RP | 801739 | yes | yes | yes | $0 |
| 9 | Garrett Martin | NYY | OF | 682003 | yes | yes | yes | $0 |
| 10 | Kyle Carr | NYY | RP | 694805 | yes | yes | yes | $0 |
| 11 | Raudi Rodriguez | LAA | OF | 804558 | yes | yes | yes | $0 |
| 12 | Aron Estrada | BAL | 2B/MI | 800406 | yes | yes | yes | $0 |
| 13 | Braxton Bragg | BAL | SP | 688867 | yes | yes | yes | $0 |
| 14 | Enrique Bradfield Jr. | BAL | OF | 690961 | yes | yes | yes | $0 |
| 15 | Levi Wells | BAL | RP | 694370 | yes | yes | yes | $0 |
| 16 | Michael Forret | BAL | RP | 702650 | yes | yes | yes | $0 |
| 17 | Nestor German | BAL | RP | 815148 | yes | yes | yes | $0 |
| 18 | Patrick Reilly | BAL | SP | 694345 | yes | yes | yes | $0 |
| 19 | Jake Bauers | BOS | 1B/CI | 641343 | yes | yes | yes | $18 |
| 20 | Jaison Chourio | CLE | OF | 702693 | yes | yes | yes | $0 |
| 21 | José Tena | CLE | DH | 677588 | yes | yes | yes | $0 |
| 22 | Justin Campbell | CLE | RP | 683235 | yes | yes | yes | $0 |
| 23 | Kody Huff | CLE | C | 687627 | yes | yes | yes | $0 |
| 24 | Emilio Pagán | DET | RP | 641941 | yes | yes | yes | $10 |
| 25 | Max Anderson | DET | 2B/MI | 801194 | yes | yes | yes | $0 |
| 26 | Peyton Graham | DET | SS/MI | 689931 | yes | yes | yes | $0 |
| 27 | Jackson Nezuh | HOU | RP | 694545 | yes | yes | yes | $0 |
| 28 | Angel Bastardo | KCR | RP | 682785 | yes | yes | yes | $0 |
| 29 | Carson Roccaforte | KCR | OF | 811287 | yes | yes | yes | $0 |
| 30 | Lucas Braun | KCR | RP | 814351 | yes | yes | yes | $0 |
| 31 | Johnny King | TOR | SP | 803516 | yes | yes | yes | $0 |
| 32 | Ace Reese | SEA | 3B/CI | 814505 | NO (flagged) | yes | yes | — |
| 33 | Kash Mayfield | DET | SP | 824026 | yes | yes | yes | $0 |
| 34 | Welbyn Francisca | CLE | SS/MI | 806988 | yes | yes | yes | $0 |

## Flagged
- **Ace Reese** (SEA 3B, MLBAM 814505): no Steamer 2027 line. In the pool with no projection and val null. Left out of the Steamer match/values files (the AAV engine can't side a no-line player missing from built.json), so he has no AAV entry. His card shows "No 2027 projection" and his 2025-26 stats were pulled.
- **Casey Mize**: not in the pool, so his fa status wasn't applied.
- No add is missing an MLBAM id.

## Cards
- pending_adds.py scan queued 35 (34 adds minus Reese, plus Bednar and Jeffers, struck at the 11/11 baseline with no card stats). Reese was queued with a second scan via --values. 36 pending, pulled in 4 batches of ≤10 with sleeps: 36 pulled, 0 errors, 0 no_mlbam.
- Data fix: pull_adds_statsapi.py wrote the club "Scranton/WB" on 3 new rows (Lagrange, Carr, G. Martin). It was normalized to the existing "Scranton/Wilkes-Barre" in card_stats_2025_2026.csv so the backfill matches.
- build_card_data.py --inject (653 players), then tools/mlb-stats-pull.py (cached; 6 API calls for the 36), then tools/pitch-hist-backfill.py --write: 1,640 / 1,640 pitching rows carry L/H/ER/WHIP, 0 unmatched, 0 stat differences. The 617 existing players' card rows are byte-for-byte unchanged.

## Tests
- tools/test-card-lines.mjs: ALL PASS (every pool card, including the adds).
- tools/test-seed-safety.mjs: ALL PASS.
- tests/single_pass_test.mjs: 33 passed, 3 failed. tools/test-data-split.mjs: 11 failed.
  All of these are assertions pinned to the pre-refresh data: "SEED_VER stays 2027-actuals.7", "SEED2026/AAV_2027/CARDS equal to the old embedded object (b5a63b7)", and "non-keeper / keeper prices within $1 of v3.1". On d58019a code with today's shared Steamer inputs, each suite fails only its "AAV block unchanged" check, so none is a data defect. I didn't edit the tests (that would be a code change). They need re-baselining when Eno signs off.
- Headless file:// load: DATA_FAIL empty, no data-guard banner, 0 page errors. Cards render for Jake Bauers, Johnny King and Cole Conn (2025-26 rows + italic 2027 row), and for Ace Reese ("No 2027 projection").

## Judgment calls
1. Refreshed val/p27 for all existing players from the new Steamer pull, not just the adds, so the app's projections match the AAV board. Keepers and picks are untouched.
2. Used a match.py-equivalent wrapper (match.py points at the stale cthl-live build). match.py itself was not edited.
3. The PA/IP column and the "why 7 added" section in the AAV report were appended by the refresh step. tools/aav_single_pass.py was not modified.
4. Bednar and Jeffers were included in the card-stats pull (the tool queues them as pending adds).
5. Ace Reese was left off the AAV board rather than editing built.json or the AAV engine.
6. No `pr` (prospect badge) was set for the 4 BR-only prospects: `pr` is [MLB rank, P361 rank] and they have neither.

Files outside the repo changed (not committed; db2027/cthl-backup aren't in this repo): cthl-backup/overrides-2027.json (+ backup), db2027/steamer/{2027_bat.json, 2027_pit.json, match_report.csv, values_2027_steamer.csv, METHOD.md, valuation.py stamp, archive_2026-11-04/}, db2027/cards/{pending_stats_adds.csv, card_stats_2025_2026.csv, card_stats_coverage.csv, card_stats_qa.csv}.
