# 11/20 package — progress log

Spec: `/workspace/db2027/specs/zuck_2026-11-20_package.md`. Branch `pkg-2026-11-20` (cut from app-v2 at e674299; live main f8aca68).
No push, no PR, no preview, no Firebase writes, no OneDrive. 3.6 (keeper-AAV fallback 658b277): hold released by Steven 12:21 PM ET 2026-11-20 for this round, but NOT in Phase A; later phase.

## Phase A — sections 1 + 4 (app code + builders) — DONE (2026-11-20), committed on pkg-2026-11-20 as ed02bb5

Baseline before any change (e674299): test-card-lines, test-seed-safety, test-data-split, tests/single_pass_test (36/36) all PASS.

### 1.3 $1 prospect-floor names (frozen, same 10 as today)
Computed from the current seed with today's rule (unpriced, `p.pr` set, sorted by best of MLB/P361 rank, top 10).
The app now carries these 10 ids as a fixed list (`PROSPECT_FLOOR_IDS`); no rank is read for the flag and none is shown.

| id | name | team |
|---|---|---|
| pdc823df | Franklin Arias | BOS |
| p6587b4a | Ryan Sloan | SEA |
| p6ccee2a | Grady Emerson | TBR |
| p96f7374 | Roch Cholowsky | CHW |
| p8985064 | Theo Gillen | TBR |
| p5b997e0 | Vahn Lackey | MIN |
| p9c8df46 | JoJo Parker | TOR |
| p4da2d2a | Zyhir Hope | DET |
| p5d22ea3 | Caleb Bonemer | CHW |
| pec92b6a | Arjun Nimmala | LAA |

### 4.2 write-up seed
`/workspace/db2027/writeups/writeups-2027.draft.js`: 10 entries, all `approved_by: Eno`, 2026-11-19; every text is byte-identical to a block in `pilot_2026-11-19.md` (checked by script). No Pouliot / RotoWire-roundtable sources.

### What changed (Phase A)
**index.html** (APP_VER 2026.11.18-1 -> 2026.11.20-1; SEED_VER unchanged 2027-actuals.8; APP_BUILT left as is)
- Future Stars front: `cfTag` blank (banner kept). "Provisional Top 100 #N" gone.
- Pick dialog: prospect pill (`cardProspectRank`/`cardProspectTitle`) removed; AAV-box `PR`+rank / "Top Prospect" branch dropped (falls through to the dash); "no ADP" title no longer says "Top 100 prospect".
- Removed `prospectTitle`, `prospectBadge`, `cardProspectRank`, `cardProspectTitle`, `.pill.prospect` CSS, the `★ Top Prospects` button, `poolProspectOnly` / `toggleProspectOnly` and its pool filter.
- `tailScore()` unchanged (still uses `bestProspectRank` internally as a sort input; never displayed).
- `computeProspectFloor()` now uses the frozen `PROSPECT_FLOOR_IDS` (10 names above); a name that gets a price drops the flag. $1 title says "Prospect with no market price".
- Card back `#cbWriteup` reads only `WRITEUPS2027[p.id].text`; no entry = blank; no `CARDS.w` fallback. Not on the Draft List / PDF.
- `data/writeups-2027.js` loaded with `?v=APP_VER` and added to the data-file guard. **Seven data files**, all `?v=2026.11.20-1`.

**data/** 
- `data/writeups-2027.js` new: the 10 pilots, values identical to the draft (one-line const, new header).
- `data/cards-2027.js`: `CARDS.t` removed (51 entries) + header comment updated; the 51 `CARDS.w` rank-lead recaps replaced with the rebuilt ones from `player_writeups.csv`. `CARDS.s` (incl. the statsapi pitching backfill), `f`, `l`, `rk` untouched (scripted edit, not a full `--inject`, so the backfill did not need a rerun). Builder output matches the file for w/f/l/rk.

**/workspace/db2027/cards** (outside the repo; backups in `cards/archive_2026-11-20_pre_rank_removal/`: player_writeups.csv, the 4 builders, writeups_sample.csv, writeups_check_flags.csv)
- `build_card_data.py`: no longer writes `CARDS.t`; Future Stars fronts still assigned from the provisional list (rank only picks the set).
- `build_writeups.py`: no rank lead sentence, provisional list no longer read; the 5 hard-coded SAMPLE/NOTE_ONLY texts stripped of it (and the T source).
- `player_writeups.csv`: exactly the 51 rank-lead rows replaced with the fixed builder's output (other 567 rows byte-identical; kept at 618 rows; the builder's 36 rows for 11/18 adds were NOT taken in, that is section 3). Note: the rebuilt recaps open with the first name and some gained one stat sentence from `card_stats_2025_2026.csv` (sentence budget freed). No `CARDS.w` text is displayed any more.
- `check_writeups.py`: inverted; "provisional", "Top 100", "Top N prospect", "No. N ... prospect", PR+digits, or a cthl_top100 source now FAIL. On the new csv: only the pre-existing flag (618 rows vs 654-player pool). On the archived old csv: all 51 rank rows fail.
- `build_writeups_sample.py` + `writeups_sample.csv`: same rule, 4 rows stripped, problems 0.
- Callis "long-term ranking of 2026 rookies" sentences remain in CARDS.w (cited-note rookie rank, not a prospect rank; not displayed anyway).

**tests**
- New `tools/test-no-ranks-writeups.mjs` (spec 1.4 + 4.4): Future Stars cfTag empty / banner kept, no Provisional / Top 100 prospect / PR+digits on any card, no Top Prospects button, PFLOOR = the 10 names, 10 write-ups exact (= pilot md), no CTHL $, other cards blank (no CARDS.w fallback), no write-up text on the Draft List, guard names a missing writeups file.
- `tools/test-card-lines.mjs`: "no $ on card back" now allows real money only inside an approved write-up (Caminero's $87,500 signing bonus, spec 4.1); bare $N still fails.
- `tests/single_pass_test.mjs` check 7: same CTHL-$ rule as test-card-lines (it failed on Caminero's $87,500 before the fix).
- `tools/test-data-split.mjs`: 7 data files (writeups has no old baseline); CARDS compared by value minus `t` and the 51 rebuilt recaps, which are checked on their own.

### Test results (after Phase A)
test-no-ranks-writeups 29/29 · test-card-lines ALL PASS · test-seed-safety ALL PASS · test-data-split 64/64 · single_pass_test 36/36.

## Phase B1 — section 2 (Rotoworld link harvest) — DONE (2026-11-20)

No re-crawl this phase (0 fetches): Eno's prototype mapping merged with `--from-csv`.
- `tools/rotoworld-harvest.py`: the prototype, adopted. Changes: repo default paths (`data/rotoid.js`, `data/seed-2027.js`); `--missing` optional (derived from the seed = players `rotoUrl()` cannot link); refuses robots-disallowed paths (`/api/`, `/cms/`, `/delivery/graphql/`, `/graphql/delivery/`); crawl-delay 10 kept (raised to robots.txt if higher); ambiguous rows now record candidate ids; writes `<out>_unresolved.csv`; `--from-csv` (merge an earlier run, no fetches; refuses rows for players who already have a link); `--write-rotoid` (adds keys, never replaces a stored one; refuses a knorm shared by two pool players -> needs a seed rwId/rwSlug override); `--prev-seed` team-changed rule (replace a ROTOID id only when the club changed and the new club's team page shows a different id; seed rwId rows are listed for a hand edit). Offline checks of refuse / team-changed paths done with synthetic data.
- `data/rotoid.js`: 478 -> 707 keys (+229: 166 numeric, 63 UUID), appended, all 478 stored keys byte-identical. Header comment notes the 11/20 harvest. `?v=2026.11.20-1` unchanged (APP_VER already bumped in Phase A).
- knorm collisions: **none** (no two pool players share a knorm; none of the 229 keys existed). No per-player rwId/rwSlug override needed.
- Coverage via the app's own `knorm()`+`rotoUrl()`: **387 -> 616 / 701** (85 seed rw + 531 ROTOID); 85 on the generic fallback.
- 7 of the 229 came from a *different club's* team page (unique slug): Tayler Saucedo LAA, Josh Walker BAL, Garrett Acton MIN, Carlos Duran KCR, Gabriel Arias NL, Chase Hampton BAL, James McArthur KCR. Taken per spec 2.3's 229; worth a look in review.
- reports/: `rotoid_harvest_2026-11-20.csv` (prototype mapping, verbatim), `rotoid_harvest_2026-11-20_spotcheck.csv` (10/10 pass, verbatim), `rotoworld_unresolved_2026-11-20.csv` (85: 42 ambiguous_sitemap, 2 ambiguous_team_pages, 41 unmatched). Candidate ids column is empty for all 85: the prototype run did not record them (the adopted script does now); getting them needs a re-crawl.
- Tests: new `tools/test-rotoworld-links.mjs` (`--expect 616/701` ALL PASS); `tools/test-data-split.mjs` ROTOID baseline = old + exactly the 229 csv keys, old entries a byte-identical prefix (64/64). Docs: harvest step in the `reports/README.md` refresh checklist; test listed in `tests/README.md`.

### Next step
- Phase B: section 2 (Rotoworld harvest), section 3 (pool refresh + AAV rerun + PDF), then 3.6 keeper-AAV fallback (Steven released the hold 12:21 PM ET 2026-11-20; do it as its own later phase, not merged/pushed without his go).
- Still no push / PR / preview until Steven says so in his own words.
