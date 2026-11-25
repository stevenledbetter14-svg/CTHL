# CTHL pool refresh 11/24: summary

Branch `build-1124` (local only). Not pushed. No merge, no Firebase writes, `landing-preview` not touched.

Final state: `APP_VER` **2026.11.24-2**, `SEED_VER` **2027-actuals.10**, **713** pool players, Draft List **636**. Five adds (Freddy Peralta, Henry Godbout, Luke Hill, Bobby Miller, Francisco Espinoza). Displayed eligibility is CBS 2027 via `tools/apply-cbs-elig.mjs`: **95** hitters changed (`reports/elig_audit_2026-11-24.csv`). A hitter with no CBS row gets the statsapi backup, and an empty backup keeps the seed. The card-back footer strip carries one CTHL badge in the Topps spot. Solved pot **$3,040.22**, implied inflation **1.1830** (`reports/aav_run_2026-11-24_2032.md`). The Draft List PDF was rebuilt on this commit (15 pages, 636 players): `/workspace/db2027/rosters/CTHL 2027 Rosters DRAFT 2026-11-24.pdf`.

Phase 1 is `22ad47f` (overrides, Peralta, Godbout, Hill, and Bobby Miller, `SEED_VER` `2027-actuals.10`, values, cards, 105 write-ups). Phase 2 data is `f8a618c` (AAV rerun and movers). `73d3121` is the first reference board and test pins. `0ef7837` points displayed eligibility at CBS 2027 and sets `APP_VER` `2026.11.24-2`. `55b6180` puts the CTHL badge on the card back. Espinoza is `f554537` (seed, eligibility, cards) and `a657ac6` (AAV rerun; no price moved). This commit is the reference board of `a657ac6`, the test pins, and this file. The fixture records `git log -1` of `data/seed-2027.js` and `data/aav-2027.js`, so it cannot share a commit with the AAV write. `index.html` and `data/` are the same bytes as `a657ac6`, so the PDF archive of those files is that pool. Method: `reports/pool_refresh_2026-11-20_summary.md` and `reports/README.md`. Working notes: `/workspace/db2027/refresh-1124/phase1_notes.md`.

## Pool count
- SEED2026.players: **708 → 713** (+5). The fifth is Francisco Espinoza (`pd8ea18b`), added after the phase-1 four. No one else.
- Draft List (`S.players`, headless `file://?room=local`, standalone `ROOM ''`): **655 → 636**. Club-page row counts sum to 636. 0 console errors. 0 Firebase non-GET (none attempted; `?room=local` never opens a room).
- Before clubs: HOU 43, BAL 48, NYY 39, CHW 45, TBR 44, KCR 46, LAA 43, CLE 44, MIN 43, DET 46, TOR 43, SEA 42, BOS 43, ATH 45, TEX 41.
- After clubs (headless, final): HOU 42, BAL 49, NYY 37, CHW 43, TBR 43, KCR 43, LAA 43, CLE 44, MIN 41, DET 43, TOR 41, SEA 41, BOS 42, ATH 44, TEX 40.
- `SEED_VER` `2027-actuals.9` → **`2027-actuals.10`**. `APP_VER` is **`2026.11.24-2`** (`0ef7837`). `BAKED_KEEPER_SET` stays **`2027-keeperval.4`**.
- Money meter "In the pot" **$2088** (10 × $260 − $512). Keepers tab **48 / $512**, `keepFillCount` "— 48 of 50 declared".

## Keepers
Read-only. `node tools/sync-keepers.mjs --check --room steven-keepers-b442410a` and the default official room (`cthl-2027-draft-7dc86b95ad994b0e2663b4d963bd8551`) both **MATCH 48 / $512**. No `--write`. `KEEPERS_CSV` stays `/workspace/db2027/keepers/keeper_split_2026-11-20_room.csv`. The 11/24 GET is `/workspace/db2027/keepers/room_steven-keepers-b442410a_2026-11-24.json`. The keepers room is retired in the app (`RETIRED_ROOMS`); the GET still matches.

## Overrides (overrides-2027.json; backup overrides-2027.pre-2026-11-24.json)
Seed team of an existing player was not rewritten. `pool_overrides.py --apply`: **section 36 · team 17 · status 77 · exclude 0**, all names matched, no warnings. Status was 53. Section was 37: David Fry left the OF multi-pos list when he was struck. Luke Raley and Davis Schneider stay in that section list. Team overrides stay 17. No new team override this round. Names in the 11/18–11/20 window that were already applied on 11/20 (Garcia, McArthur, Bryce Miller, Evans, Ferrer, Gray, Fortes, Jung, Nett, Baumler, and the 11/20 adds May, Sullivan, Cairo) are not repeated here.

Status this round is `None` → the value below. Evidence: `/workspace/db2027/refresh-1124/pool_tx_2026-11-18_to_24.csv` (every strike) and `/workspace/db2027/refresh-1124/tx_evidence_2026-11-24.json` (a subset, plus the earlier DFA or activation on the same player). The deciding transaction is the one that sets the new status.

| Player | id | Seed team | New status | Transaction |
|---|---|---|---|---|
| Anthony Gose | p1276a52 | KCR | fa | 950834 · 2026-11-20 · Declared Free Agency: LHP Anthony Gose elected free agency. |
| Bailey Ober | pfcf00fe | MIN | fa | 950839 · 2026-11-20 · Declared Free Agency: RHP Bailey Ober elected free agency. |
| Chase Lee | p459c945 | TOR | nl:COL | 950685 · 2026-11-19 · Designated for Assignment: Toronto Blue Jays designated RHP Chase Lee for assignment. 950770 · 2026-11-20 · Trade: Toronto Blue Jays traded RHP Chase Lee to Colorado Rockies for cash. |
| Cole Sulser | pf179f2d | TBR | fa | 950842 · 2026-11-20 · Declared Free Agency: RHP Cole Sulser elected free agency. |
| Connor Wong | p6d76b07 | BOS | fa | 950611 · 2026-11-18 · Designated for Assignment: Boston Red Sox designated C Connor Wong for assignment. 950833 · 2026-11-20 · Declared Free Agency: C Connor Wong elected free agency. |
| David Fry | p47469a4 | CLE | fa | 950774 · 2026-11-20 · Declared Free Agency: RF David Fry elected free agency. Left the OF multi-pos section. |
| Davis Schneider | p44d82a5 | TOR | fa | 950776 · 2026-11-20 · Declared Free Agency: LF Davis Schneider elected free agency. |
| Fernando Cruz | pf26149e | NYY | fa | 950777 · 2026-11-20 · Declared Free Agency: RHP Fernando Cruz elected free agency. |
| Jake Miller | p303bef8 | DET | fa | 950425 · 2026-11-17 · Designated for Assignment: Detroit Tigers designated LHP Jake Miller for assignment. 950795 · 2026-11-20 · Declared Free Agency: LHP Jake Miller elected free agency. |
| Joey Bart | p838f5d1 | CHW | nl:CHC | 950370 · 2026-11-17 · Designated for Assignment: Chicago White Sox designated C Joey Bart for assignment. 950816 · 2026-11-20 · Claimed Off Waivers: Chicago Cubs claimed C Joey Bart off waivers from Chicago White Sox. |
| Johan Oviedo | p8f6d055 | BOS | nl:ARI | 950804 · 2026-11-20 · Trade: Arizona Diamondbacks traded LHP Luke Dotson and Future Considerations to Boston Red Sox for RHP Johan Oviedo. |
| Jordan Leasure | pc1d3fcf | CHW | nl:PHI | 950620 · 2026-11-18 · Designated for Assignment: Chicago White Sox designated RHP Jordan Leasure for assignment. 950779 · 2026-11-20 · Trade: Chicago White Sox traded RHP Jordan Leasure to Philadelphia Phillies for RHP Christian Coppola. |
| José Buttó | pa365141 | TEX | fa | 950775 · 2026-11-20 · Declared Free Agency: RHP José Buttó elected free agency. |
| Kyle Isbel | pb239f3c | KCR | fa | 950622 · 2026-11-18 · Designated for Assignment: Kansas City Royals designated CF Kyle Isbel for assignment. 950836 · 2026-11-20 · Declared Free Agency: CF Kyle Isbel elected free agency. |
| Luis Gil | p2db3997 | NYY | fa | 950778 · 2026-11-20 · Declared Free Agency: RHP Luis Gil elected free agency. |
| Luke Raley | p9b2bd6c | SEA | fa | 950790 · 2026-11-20 · Declared Free Agency: RF Luke Raley elected free agency. |
| Matt Vierling | pdfe0189 | DET | fa | 950427 · 2026-11-17 · Designated for Assignment: Detroit Tigers designated CF Matt Vierling for assignment. 950797 · 2026-11-20 · Declared Free Agency: CF Matt Vierling elected free agency. |
| Matt Wallner | pa91c243 | MIN | fa | 950838 · 2026-11-20 · Declared Free Agency: RF Matt Wallner elected free agency. |
| Nick Mears | pd42fddb | KCR | fa | 950377 · 2026-11-17 · Designated for Assignment: Kansas City Royals designated RHP Nick Mears for assignment. 950835 · 2026-11-20 · Declared Free Agency: RHP Nick Mears elected free agency. |
| Royce Lewis | pa72991b | MIN | nl:LAD | 950798 · 2026-11-20 · Trade: Minnesota Twins traded 1B Royce Lewis to Los Angeles Dodgers for RHP Bobby Miller and C Francisco Espinoza. 950948 · 2026-11-20 · Status Change: Los Angeles Dodgers activated 1B Royce Lewis. |
| Taylor Trammell | p2607679 | HOU | fa | 950771 · 2026-11-20 · Declared Free Agency: LF Taylor Trammell elected free agency. |
| Trevor Larnach | p330698a | MIN | fa | 950837 · 2026-11-20 · Declared Free Agency: LF Trevor Larnach elected free agency. |
| Trey Sweeney | p38fc373 | DET | fa | 950426 · 2026-11-17 · Designated for Assignment: Detroit Tigers designated SS Trey Sweeney for assignment. 950796 · 2026-11-20 · Declared Free Agency: SS Trey Sweeney elected free agency. |
| Yunior Tur | pacaab5e | ATH | nl:NYM | 950461 · 2026-11-17 · Designated for Assignment: Athletics designated RHP Yunior Tur for assignment. 950789 · 2026-11-20 · Claimed Off Waivers: New York Mets claimed RHP Yunior Tur off waivers from Athletics. |

Headless Draft List, both loads: none of these 24 ids is in `S.players` or on any club page.

## Steamer re-pull
The 11/24 FanGraphs re-pull was blocked (Cloudflare 403). Live `2027_bat.json` and `2027_pit.json` are the 11/20 pull, byte-identical to `steamer/archive_2026-11-20`. `match.py` and `valuation.py` were not edited. The AAV Projections line is exactly: `Steamer 2027 (FanGraphs, pulled 11/20/2026; 11/24 re-pull blocked).`

Phase 1 rebuilt `val` / `p27` from that pull (`project_1124.py`). **val26 untouched** (Gray still 29, Caminero still 40). Seven vals changed: Garrett Crochet 30→31, Jacob deGrom 26→27, Payton Tolle 16→17, Freddy Peralta 0→2, Hogan Harris 6→5, River Ryan 5→4, Jordan Hicks 1→0. Godbout, Hill, and Bobby Miller stayed $0. Match rows 653→633 on that pass. Espinoza made it **634** match rows and **634** value rows (hitter 303). Drafted-250 sum stayed $2,600.00. Replacement SGP H 3.45 / P 1.57 (P was 1.51). Ace Reese and Zion Rose still have no Steamer line (`val` null, no p27) and stay out of match, values, and AAV.

`tools/p27-card-fields.py --write` exited 1 because 31 struck players still hold an old p27 and are no longer in the match file. Those lines were left as they were. 52 players have no p27 (card says "No 2027 projection"), including Rose and Reese.

## AAV rerun (tools/aav_single_pass.py --write)
Commit `f8a618c`. Single pass, 250 slots (172H / 78P), keepers 48 / $512, cash **$512 + $2,058 = $2,570**. Keeper curve dollars are display only (48 `k` values sum to $986 and are not in the cash). `aav_enrich_1124.py` was not run.

- Solved pot **$3,040.22** (H $2,255.04 / P $785.18), implied inflation **1.1830** (H 1.1696 / P 1.2230).
- Vs 11/20 **$3,051.18 / 1.1872** (H 1.1761 / P 1.2207): **−$10.96 / −0.0042**. H inflation −0.0065, P inflation +0.0023. Reference pot stays 2570 × 1.1689 = $3,004.07.
- Curve: H pot $2,255.04, 38 keepers, $408, 122 paid, 12 stashes, replacement SGP 3.6918, scale 0.975097. P pot $785.18, 10 keepers, $104, 68 paid, 0 stashes, replacement SGP 2.5643, scale 1.579404.
- Generator diff vs `aav_run_2026-11-20.csv`: 78 moved (max $4), 6 added, 6 dropped. The `f8a618c` run CSV is the base columns only, 633 data rows (the `AAV_2027` key count at that commit). Report: `reports/aav_run_2026-11-24.md` and `.csv`. Current `AAV_2027` has **634** keys, matching `reports/aav_run_2026-11-24_2032.csv`.
- Into the 250: Ben Williamson $2, Ben Malgeri $2, Zach McKinstry $2, Petey Halpin $2, Freddy Peralta $2, Jace Jung $2. Out: Taylor Trammell (was $2), Trevor Larnach ($6), Drew Anderson ($2), Luke Raley ($3), Royce Lewis ($18), Kyle Isbel ($2).
- **Junior Caminero** `pabd0d7f` is `{k:52}` against his $32 salary (was `{k:56}`). Un-kept, the pool cell and the card box show $52, titled display-only. **Walker Jenkins** `p6377140` is `{a:9}` (was `{a:8}`), a regular non-keeper inside the $2,058. Setting every `k` to 999 does not move inflation, maxBid, `p.val`, the meter, or the money board.
- Espinoza rerun, same day (`reports/aav_run_2026-11-24_2032.md`, commit `a657ac6`): **0 moved, 0 added, 0 dropped** vs `aav_run_2026-11-24.csv`. Solved pot and inflation stay **$3,040.22 / 1.1830**. Vs 11/20 still **−$10.96 / −0.0042**. Cash still **$512 + $2,058 = $2,570**. His AAV cell is `{a:0}` (not in the 250). The 2032 CSV has **634** rows, the same count as `AAV_2027` keys. `reports/aav_movers_2026-11-24.csv` was not rewritten.

### Top 15 AAV movers
Ranked by absolute AAV change, including names that entered or left the 250. A player who was not in the 11/20 run shows —. Not in the 250 counts as $0. The tie at ±$2 is broken alphabetically. PA/IP vs the 11/20 JSON is +0 for every row because the live file is that pull. `new` was not used. Full list: `reports/aav_movers_2026-11-24.csv` (90 rows: keeper 22, paid 61, struck 5, none 1, added 1).

| # | Player | Team | Side | 11/20 | 11/24 | Change | Status | PA/IP vs 11/18 | PA/IP vs 11/20 |
|---:|---|---|---|---:|---:|---:|---|---|---|
| 1 | Royce Lewis | MIN | H | $18 | — | -18 | struck | PA +0 | PA +0 |
| 2 | Trevor Larnach | MIN | H | $6 | — | -6 | struck | PA +0 | PA +0 |
| 3 | Junior Caminero | TBR | H | $56 K | $52 K | -4 | keeper | PA +0 | PA +0 |
| 4 | Bobby Witt Jr. | KCR | H | $52 | $49 | -3 | paid | PA +0 | PA +0 |
| 5 | Jose Ramirez | CLE | H | $42 | $39 | -3 | paid | PA +0 | PA +0 |
| 6 | Luke Raley | SEA | H | $3 | — | -3 | struck | PA -42 | PA +0 |
| 7 | Nick Kurtz | ATH | H | $50 K | $47 K | -3 | keeper | PA +0 | PA +0 |
| 8 | Aaron Judge | NYY | H | $41 | $39 | -2 | paid | PA +0 | PA +0 |
| 9 | Ben Malgeri | DET | H | $0 (not in 250) | $2 | +2 | paid | PA -11 | PA +0 |
| 10 | Ben Williamson | TBR | H | $0 (not in 250) | $2 | +2 | paid | PA +0 | PA +0 |
| 11 | Drew Anderson | DET | P | $2 | $0 (not in 250) | -2 | none | IP +0 | IP +0 |
| 12 | Freddy Peralta | BAL | P | — | $2 | +2 | added | IP +0 | IP +0 |
| 13 | Jac Caglianone | KCR | H | $36 | $34 | -2 | paid | PA +0 | PA +0 |
| 14 | Jace Jung | LAA | H | $0 (not in 250) | $2 | +2 | paid | PA +183 | PA +0 |
| 15 | Julio Rodriguez | SEA | H | $41 K | $39 K | -2 | keeper | PA +0 | PA +0 |

The next names at ±$2, in alphabetical order: Kevin McGonigle -2, Kyle Isbel -2, Pete Alonso -2, Petey Halpin +2, Taylor Trammell -2, Yordan Alvarez -2, Zach McKinstry +2.

## The 5 adds
Ids are `p` + md5("mlb" + MLBAM)[:7]. Team and eligibility are the seed row. No one else was added. Peralta, Godbout, and Hill have no row in either transaction file. Miller and Espinoza are named inside the Lewis trade (950798) and have no transaction of their own.

| # | Name | Team | Elig | MLBAM | id | Steamer 11/20 line | AAV |
|---:|---|---|---|---:|---|---|---:|
| 1 | Freddy Peralta | BAL | SP | 642547 | pdf0a965 | Team/League None (did not yet show BAL). 168.7 IP, 30.8 GS, 4.33 ERA, 163 SO, 64 BB, 9.9 W. Seed `p27` rounds to 169 IP / 31 GS / 10 W. `val` $2. | $2 paid |
| 2 | Henry Godbout | BOS | 2B/MI | 804995 | p5163c4e | BOS AL, 7.7 PA. `val` $0, `p27` PA 8. | $0 |
| 3 | Luke Hill | CLE | 3B/CI | 702619 | p2838955 | CLE AL, 10.8 PA. `val` $0, `p27` PA 11. | $0 |
| 4 | Bobby Miller | MIN | RP | 676272 | pac24c44 | Still LAD/NL. 40 IP, GS 0, 4.18 ERA. `val` $0. | $0 |
| 5 | Francisco Espinoza | MIN | C | 821689 | pd8ea18b | Still LAD/NL. 1.0 PA. Near-zero PT. Seed `val` $0, `p27` PA 1, AVG .182. | $0 |

Headless Draft List: Peralta on Baltimore, Godbout on Boston, Hill on Cleveland, Miller and Espinoza on Minnesota. Espinoza is under Catchers. He has no CBS row. `data/elig-2027.js` ships `elig` `""`, source `statsapi`, 0 games at every position (no 2026 MLB fielding or DH). `tools/apply-cbs-elig.mjs` keeps the seed at `C`, which is his primary position. Drafted-250 stayed **$2,600.00**. Match rows 634. Values rows 634 (hitter 303).

## Flagged
- **Freddy Peralta**: Steamer Team/League None. Matched by MLBAM. Not overwritten. AAV $2.
- **Near-zero playing time**: Henry Godbout 7.7 PA, Luke Hill 10.8 PA. Both $0. Not overwritten.
- **Bobby Miller**: Steamer still LAD/NL. Matched by MLBAM onto MIN. AAV $0.
- **Francisco Espinoza**: Steamer still LAD/NL, 1.0 PA. Matched by MLBAM 821689 onto MIN. Primary position C. No 2026 MLB games, so the statsapi backup string is empty and the seed stays C. AAV $0. No write-up.
- **Jake Meyers** `p58ee857` (MLBAM 676694): 947667 · 2026-11-02 · Outrighted to Sugar Land Space Cowboys, parentOrgId 117 (HOU). No free agency. Left in the pool.
- **Hayden Juenger** `p19d435e` (MLBAM 696522): 950460 · 2026-11-17 · Designated for Assignment. 950832 · 2026-11-20 · Outrighted to Las Vegas Aviators, parentOrgId 133 (ATH). No free agency. Left in the pool.
- No contract dollars were added. Peralta's real contract dollars stay inside his write-up only.
- **Ace Reese** and **Zion Rose** remain with no Steamer line and no AAV entry.
- Crochet projections K/BB is still **4.29** (`p27.KBB` 4.294589). The pin was not moved.
- The $1 prospect flag still shows exactly Ryan Sloan (`p6587b4a`, `val` 1). `PROSPECT_FLOOR_IDS` was not edited.
- The frozen 11/14 spec pot in `tests/single_pass_test.mjs` stays **$3,041.48** (H $2,233.12 / P $808.37). That pin is the spec report, not this board.

## Eligibility (CBS 2027)
Commit `0ef7837`. `node tools/apply-cbs-elig.mjs --write` copied CBS 2027 eligibility onto Draft List hitters. Pitchers were not touched. `SEED_VER` stayed **`2027-actuals.10`**. `APP_VER` became **`2026.11.24-2`**.

**95** hitters changed. The audit is `reports/elig_audit_2026-11-24.csv` (99 rows: 95 elig strings changed, 4 left as they were). Source on the changed rows is CBS for 92 and statsapi for 3. A hitter with no CBS row gets the statsapi backup (5 or more games at a field position in the cached 2026 line, or DH when that is all he played). An empty backup keeps the seed. Of the four unchanged rows, Zach Morgan (seed stays C) and Christian Cairo (seed stays SS/MI) have an empty backup. Grant McCray (OF) and Michael Toglia (1B/CI) already matched their statsapi backup. Espinoza is not in that audit. He was added later, and his backup is empty, so the seed stays C.

Brent Rooker `pd3bf6d0` went OF → DH (CBS). His Draft List section was already DH. Seven sections moved with the new string: Ike Irish Infielders → Catchers, Kristian Campbell Outfielders → Infielders, Cooper Ingle Catchers → Outfielders, José Tena DH → Infielders (statsapi), Nelson Rada DH → Outfielders, Taitn Gray Infielders → Catchers, Anthony Santander Outfielders → DH.

Espinoza has no CBS row. `data/elig-2027.js` ships `elig` `""`, source `statsapi`, 0 games at every position. `tools/apply-cbs-elig.mjs` keeps the seed at `C`.

## Card-back footer
Commit `55b6180`. The card-back footer strip (`.cb-foot`) carries one CTHL badge in the Topps spot: navy `#13296b`, white, flush right (`.cb-foot .mk`). The cream band is `#f4f4b8` so the dialog purple sweep does not trip. `tools/test-card-back-1124.mjs` checks the badge on Isaac Paredes, Garrett Crochet, and Christian Encarnacion-Strand.

## Cards and write-ups
Phase 1 (`22ad47f`) injected Peralta, Godbout, Hill, and Bobby Miller: 665 players, 3,143 rows, 618 CARDS write-ups. Espinoza (`f554537`) is the only later card player: 666 players, 3,147 rows. CARDS keys `f`, `l`, `rk`, `s`, `w`. No `t`. He is not a rookie, all-star, or Top 100 front. `data/writeups-2027.js` still has **105** keys, byte-identical to the pre-Espinoza file (sha256 `2f665e687cdf2d804abc55c11fdc724721d756331c6643ee8cdb033cb9669152`). None is a struck player. Royce Lewis is not in the file. Espinoza has no write-up. `tools/pitch-hist-backfill.py --write` after the inject filled 344 pitchers, 1,665 / 1,665 rows, 0 unmatched, 0 stat differences.

## Tests
`node tools/build-ref-board.mjs --check` OK. Source commit **a657ac6**, `SEED_VER` `2027-actuals.10`, 634 rows, 202 priced non-keepers ($2,058) and 48 keepers ($512). Fixture `tests/fixtures/ref_board_2026-11-24.csv`. The 11/20 fixture is archived at `reports/archive/ref_board_2026-11-20.csv` (`b9b384d`). `tests/single_pass_test.mjs`: max diff $0, 0 of 202 moved, **36 passed, 0 failed**.

Every `tools/test-*.mjs` and `tests/single_pass_test.mjs` exited 0 in one run (`/tmp/cthl-tests-1124c.log`):

- `tools/test-card-back-1124.mjs` (CTHL badge on Paredes, Crochet, Encarnacion-Strand)
- `tools/test-card-lines.mjs` (Crochet K/BB 4.29)
- `tools/test-cbs-elig.mjs` (Rooker DH; seed elig matches a non-empty `elig-2027.js` string)
- `tools/test-data-split.mjs` (http and file:// both 636 players, 0 console errors; Caminero `{k:52}`, Jenkins `{a:9}`)
- `tools/test-elig-dh.mjs`
- `tools/test-elig-table.mjs`
- `tools/test-keeper-aav-fallback.mjs` (un-kept Caminero shows $52; Jenkins shows $9; `k` = 999 stays out of the pot)
- `tools/test-no-ranks-writeups.mjs` (105 write-ups; $1 floor shows Sloan only)
- `tools/test-rotoworld-links.mjs --expect 616/713` (616 / 713 direct: 85 seed rwId/rwSlug, 531 ROTOID; ROTOID 707 keys; 97 on the generic fallback)
- `tools/test-seed-safety.mjs`
- `tools/test-stale-keepers.mjs` (pot $2088, 48 / $512, seedVer `.10`)
- `tests/single_pass_test.mjs` (36/36)

Pins rebaselined because the new data moved them:

- `tests/single_pass_test.mjs`: `SEED_VER` `2027-actuals.9` → `2027-actuals.10`.
- `tests/single_pass_test.mjs` keeper centers: Nick Kurtz 50→47, Julio Rodriguez 41→39, Cam Schlittler 35→36, Ben Rice 38→37, Logan Gilbert 35→36. The $1 moves were rewritten to the new center, same as the 11/20 refresh. `compared === 202` stayed.
- `tools/test-data-split.mjs`: `REFRESH_REF` `f8a618c` → `a657ac6` (Espinoza in the seed, cards, and AAV). `SEED_VER_BASE` stays `.10`. Caminero `{k:52}`, Jenkins `{a:9}` unchanged.
- `tools/test-keeper-aav-fallback.mjs`: Caminero `{k:52}` / $52 and Jenkins `{a:9}` / $9, in the kept cell, the un-kept cell, and the card box.
- `tools/test-stale-keepers.mjs`: the current-version localStorage stamp `.9` → `.10`. `load()` only keeps a save whose `seedVer` equals `SEED_VER`.
- `tools/test-rotoworld-links.mjs` and `tests/README.md`: `--expect 616/712` → `616/713`. Espinoza did not add a link.

Harness fix, not a price pin: `keeperBase` in `tools/test-data-split.mjs` copies a `KEEPER_AAV_MOVED` id only when that id is in the current AAV object. Royce Lewis (`pa72991b`) is one of the 16 ids and is in neither object. `old[id] = structuredClone(undefined)` was inventing an own key. `util.isDeepStrictEqual` saw it. `JSON.stringify` dropped it, which is why the in-page JSON check had already passed. The 16-id list is unchanged.

Left as they were: Crochet K/BB 4.29, the $1 floor list, the frozen 11/14 pot $3,041.48, `KEEPERS_CSV`, `APP_VER` `2026.11.24-2`, `BAKED_KEEPER_SET`, keeper centers (Kurtz 47, Julio 39, Schlittler 36, Rice 37, Gilbert 36), and `compared === 202`. `73d3121` did not touch `index.html`, the seed, AAV, cards, or write-ups. Espinoza's later commits did touch the seed, eligibility, cards, and AAV. This commit touches the reference board, the pins above, and this file.

## Judgment calls
1. Steamer stayed on the 11/20 pull. The 11/24 re-pull was blocked. PA/IP vs that archive is +0 on every mover. Vs the 11/18 archive can still move (Raley −42, Malgeri −11, Jung +183).
2. Keepers were checked, not written. Salaries stayed $512, so non-keeper cash stayed $2,058 and the $2,570 total did not move.
3. The run CSV kept the base columns. `tests/single_pass_test.mjs` requires the run CSV row count to equal the `AAV_2027` key count. Movers are `reports/aav_movers_2026-11-24.csv`.
4. Peralta (Team None), Godbout (7.7 PA), Hill (10.8 PA), and Miller (still LAD/NL) were flagged, not overwritten. Meyers and Juenger were not struck.
5. The reference board is an independent snapshot of `a657ac6`. Espinoza is a $0 row, so the 202 priced non-keepers did not change. Rebaselined only the pins the new pool count moved (`REFRESH_REF`, Rotoworld 616/713). Lewis's missing AAV key is skipped in the comparison. It was not deleted from the 16-id list.
6. Espinoza's statsapi backup is an empty string. He has no 2026 MLB fielding or DH games, same as Zach Morgan and Christian Cairo. The seed stays `C` from his primary position. That string was not invented in `data/elig-2027.js`.

Files outside the repo (not committed): `cthl-backup/overrides-2027.json` and `overrides-2027.pre-2026-11-24.json`; `db2027/refresh-1124/` (notes, transaction evidence, match and project helpers); `db2027/steamer/` live files and `archive_2026-11-20/` (match and values include Espinoza; drafted-250 $2,600.00); `db2027/keepers/keeper_split_2026-11-20_room.csv` and `room_steven-keepers-b442410a_2026-11-24.json`; `db2027/cards/` (add-list helpers, stats, coverage, and QA files); `db2027/eligibility/` (Espinoza's cached-zero fielding row); `db2027/rosters/CTHL 2027 Rosters DRAFT 2026-11-24.pdf` and `build_pdf_2026-11-24.log.json`.
