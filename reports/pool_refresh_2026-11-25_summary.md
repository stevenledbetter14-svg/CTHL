# CTHL pool refresh 11/25: summary

Final state (pending write-ups + Draft List PDF on this same branch): `APP_VER` **2026.11.25-2**, `SEED_VER` **2027-actuals.11**, **722** seed players, Draft List **647**. Nine adds and two restorations. Steamer is still the **11/20** FanGraphs pull (11/25 re-pull blocked, Cloudflare 403). Solved pot **$3,043.96**, implied inflation **1.1844** (`reports/aav_run_2026-11-25.md`). Keepers **48 / $512**. Cash check $512 + $2,058 = **$2,570**.

Branch `build-1125` already had `6a93812` (room-restore seedVer fix) and `6c2c576` (p.pr on 9 AL Top 100; `APP_VER` 2026.11.25-1). This refresh is the next commits on that branch.

## Adds (new seed rows)

Ids are `p` + md5(`mlb` + MLBAM)[:7].

| Player | pool_id | MLBAM | Club | Elig (after CBS/statsapi) | Official? | Steamer 11/20 | val / AAV |
|---|---|---|---|---|---|---|---|
| Kaima Taira | p594ec5d | — (fgId sa3062990) | TOR | SP | No (MLB.com 11/24, unannounced) | 138.5 IP, 4.47 ERA, 115 SO | $0 / $0 |
| Tyrone Taylor | p4929ced | 621438 | CHW | OF | No (MLB.com 11/24) | 310 PA | $4 / $3 |
| Ha-Seong Kim | p449d239 | 673490 | DET | SS/MI | No (MLBTR 11/24) | 366 PA | $4 / $3 |
| Alec Bohm | p16d2bea | 664761 | KCR | 1B/3B/CI | No (MLB.com 11/25, pending physical) | 549 PA | $12 / $14 |
| Jonathan Loáisiga | p42761d6 | 642528 | NYY | RP | No (CBS signed 11/20; no statsapi tx) | 65 IP | $0 / $0 |
| Brent Suter | pf2c1fb7 | 608718 | NYY | RP | Yes, tx 950958 | 54 IP | $0 / $0 |
| Tim Hill | pea033c4 | 657612 | NYY | RP | Yes, tx 950957 | 55 IP | $0 / $0 |
| Caleb Thielbar | pd5d3116 | 573204 | KCR | RP | Yes, tx 950954 | 40 IP | $0 / $0 |
| Christian Koss | pe295c80 | 683766 | TBR | 2B/3B/SS/MI/CI | Yes, tx 950791 | 41 PA | $0 / $0 |

Taira has no MLBAM yet. Temp id is `p` + md5(`fgsa3062990`)[:7]; `fgId` is stored on the seed row for a later re-key. match/values/p27/AAV accept a FanGraphs playerid when `fg_mlbam` is not numeric.

## Reactivations

- Kris Bubic `p7bdc968`: removed status `fa`, team override **CLE**. Official, tx 951121. val $4 / AAV $4. Seed team is still `NL`; the override supplies CLE.
- Luis Gil `p2db3997`: removed status `fa`, team override **DET**. No statsapi tx yet (MLBTR/CBS 11/22). val $0 / AAV $0.

Rogers and Goldschmidt stay out (already `fa`). Minor-league signings were skipped.

## Recheck list (no official MLB transaction yet)

`/workspace/db2027/refresh-1125/recheck_unofficial_2026-11-25.csv`: Taira, Taylor, Kim, Bohm, Loáisiga, Gil.

## Eligibility

CBS 2027 is still the displayed source when a hitter has a row (`tools/apply-cbs-elig.mjs`). The four new hitters are not in the 11/23 CBS export, so they ship the statsapi backup (5 games this year): Taylor OF, Kim SS/MI, Bohm 1B/3B/CI (50 G at 1B), Koss 2B/3B/SS/MI/CI (2B is 5 G; 3B 20 / SS 41). Brent Rooker stays DH. Pitchers were not rewritten.

## Cards

`pending_adds.py scan` + `pull_adds_statsapi.py` pulled 49 stat rows for the nine MLBAM players (Taira skipped, no MLBAM). `build_card_data.py --inject`: **675** players, **3,196** rows. After renaming two AAA clubs in the stats CSV to the mlb-stats-pull spellings (Bubic `Okla. City` → `Oklahoma City`, Loáisiga `Scranton/WB` → `Scranton/Wilkes-Barre`, same as the 11/24 Bobby Miller fix), `pitch-hist-backfill.py` filled **349** pitchers, **1,686 / 1,686** rows, 0 unmatched, 0 stat differences.

## AAV

`tools/aav_single_pass.py --write`. Keepers **48 / $512** (unchanged, matches `SEED2026.picks`). Drafted-250 cash $2,058. 12 $1 stashes.

- Solved pot **$3,043.96** (H $2,257.74 / P $786.21), implied inflation **1.1844** (was $3,040.22 / 1.1830 on 11/24).
- 44 moved, max $1. Added to the 250: Bohm $14, Bubic $4, Kim $3, Taylor $3. Dropped: Zach McKinstry, Petey Halpin, Jace Jung, Jordan Hicks (all were $2).
- PA/IP vs the 11/20 JSON (and vs the 11/24 values file) is +0 for every returning player. New and restored names show "PA/IP new". Full list: `reports/aav_movers_2026-11-25.csv`.

Top 25 starts Junior Caminero $53 K, Bobby Witt Jr. $50, Nick Kurtz $48 K.

## What was skipped

- FanGraphs / Steamer re-pull (403).
- Rotoworld harvest (new players are unlinked; coverage test expect is 617/722 (one new add matched an existing ROTOID)).
- Draft List PDF and the 11/25 write-up batch (next on this branch).
- Room sync / merge / deploy (Steven's go is to ship when the whole branch is complete).
