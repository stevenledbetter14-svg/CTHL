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

## Phase B1 — section 2 (Rotoworld link harvest) — DONE (2026-11-20), committed as 8bd4bc1

No re-crawl this phase (0 fetches): Eno's prototype mapping merged with `--from-csv`.
- `tools/rotoworld-harvest.py`: the prototype, adopted. Changes: repo default paths (`data/rotoid.js`, `data/seed-2027.js`); `--missing` optional (derived from the seed = players `rotoUrl()` cannot link); refuses robots-disallowed paths (`/api/`, `/cms/`, `/delivery/graphql/`, `/graphql/delivery/`); crawl-delay 10 kept (raised to robots.txt if higher); ambiguous rows now record candidate ids; writes `<out>_unresolved.csv`; `--from-csv` (merge an earlier run, no fetches; refuses rows for players who already have a link); `--write-rotoid` (adds keys, never replaces a stored one; refuses a knorm shared by two pool players -> needs a seed rwId/rwSlug override); `--prev-seed` team-changed rule (replace a ROTOID id only when the club changed and the new club's team page shows a different id; seed rwId rows are listed for a hand edit). Offline checks of refuse / team-changed paths done with synthetic data.
- `data/rotoid.js`: 478 -> 707 keys (+229: 166 numeric, 63 UUID), appended, all 478 stored keys byte-identical. Header comment notes the 11/20 harvest. `?v=2026.11.20-1` unchanged (APP_VER already bumped in Phase A).
- knorm collisions: **none** (no two pool players share a knorm; none of the 229 keys existed). No per-player rwId/rwSlug override needed.
- Coverage via the app's own `knorm()`+`rotoUrl()`: **387 -> 616 / 701** (85 seed rw + 531 ROTOID); 85 on the generic fallback.
- 7 of the 229 came from a *different club's* team page (unique slug): Tayler Saucedo LAA, Josh Walker BAL, Garrett Acton MIN, Carlos Duran KCR, Gabriel Arias NL, Chase Hampton BAL, James McArthur KCR. Taken per spec 2.3's 229; worth a look in review.
- reports/: `rotoid_harvest_2026-11-20.csv` (prototype mapping, verbatim), `rotoid_harvest_2026-11-20_spotcheck.csv` (10/10 pass, verbatim), `rotoworld_unresolved_2026-11-20.csv` (85: 42 ambiguous_sitemap, 2 ambiguous_team_pages, 41 unmatched). Candidate ids column is empty for all 85: the prototype run did not record them (the adopted script does now); getting them needs a re-crawl.
- Tests: new `tools/test-rotoworld-links.mjs` (`--expect 616/701` ALL PASS); `tools/test-data-split.mjs` ROTOID baseline = old + exactly the 229 csv keys, old entries a byte-identical prefix (64/64). Docs: harvest step in the `reports/README.md` refresh checklist; test listed in `tests/README.md`.

## Phase B2 — section 3.6 (keeper-AAV fallback) — DONE (2026-11-20), committed as b64a021

Released by Steven 12:21 PM ET 2026-11-20 ("send it with these changes"). Cherry-picked 658b277 from `keeper-aav-fallback` (`-x`; that branch untouched).
- Conflicts: only the 6 data `<script>` `?v=` tags and `APP_VER` (source had 2026.11.19-1). Kept HEAD: APP_VER **2026.11.20-1**, all **7** data tags `?v=2026.11.20-1` (writeups-2027.js kept). The section 1 removal of the prospect-rank card-box branch did not come back. Net change: 9+/4- in index.html (`aav27Shown()` helper used by the pool column `aav27CellHTML()` and the card box in `openPick()`).
- Display-only verified: `aav27Shown()` has exactly 3 call sites (openPick x2, aav27CellHTML); `inflationFactors()`, `fullPoolVal()`, `maxBid()`, `renderMeter()`, `renderMoney()` never read AAV_2027 / aavOf / aav27*. Setting all 48 keeper k to 999 leaves inflation, every maxBid, every p.val, the meter and the money board byte-identical while the cell follows k. SEED_VER unchanged (2027-actuals.8); no data file changed.
- Source commit had no test. New `tools/test-keeper-aav-fallback.mjs` (headless Chrome, room=local, Firebase failed offline): Walker Jenkins (p6377140, AAV {k:8}, kept $5): kept = lock $5; after `removePick` = $8 in pool cell (titled display-only) and card box, not "—"; Caminero (a=54) unchanged; no-entry players still "—". Mutation check: reverting the k fallback makes 3 checks fail.

### Test results (after Phase B2)
test-keeper-aav-fallback ALL PASS · test-rotoworld-links --expect 616/701 ALL PASS · test-no-ranks-writeups ALL PASS · test-card-lines ALL PASS · test-seed-safety ALL PASS · test-data-split 64/64 · single_pass_test 36/36.

## Phase C — section 1 correction (Top Prospects button restored) — DONE (2026-11-20)

Steven 1:08 PM ET 11/20 (relayed by Eno): "The Top Prospect button stays in the projections tab the verbiage Provisional Top 100 and the #rank is to be removed."
- `index.html`: restored from ed02bb5's removal: `poolProspectOnly`, `toggleProspectOnly()`, the `★ Top Prospects` button on the Projections position row, and `.filter(p=>!poolProspectOnly || isProspect(p))`. Tooltip is now **"Show only top prospects"** (was "Show only Top 100 prospects (P361 + MLB.com union)"). Filters on the seed's `p.pr` (unchanged, 42 players: 31 hitters, 11 pitchers).
- Rank display NOT restored: no `prospectBadge` / PR pill, no `prospectTitle`, no `cardProspectRank/Title`, no `.pill.prospect`, cfTag stays blank. isProspect comment updated.
- The pool's `#N` column is the whole-pool overall rank (every player, value order). It is not a prospect rank and the spec doesn't mention it, so it stays. In the filtered view a prospect shows their overall rank (e.g. #211), not a 1..N prospect order. Flag for Steven in case "#rank" meant that column too.
- `tools/test-no-ranks-writeups.mjs` check 4 inverted: button present with that tooltip (H and P); clicking filters to prospects only (H 31 of 313, P 11 of 337) and clicking again restores; tab text + every `[title]`, filter on and off, has no Provisional / Top 100 / PR+digits / #N (the overall-rank cells are checked to equal `'#'+overallRank(p)`). The static check still forbids prospectBadge/prospectTitle/cardProspect*.
- APP_VER unchanged 2026.11.20-1; SEED_VER unchanged; no data file changed.

### Test results (after Phase C)
test-no-ranks-writeups ALL PASS · test-keeper-aav-fallback ALL PASS · test-rotoworld-links --expect 616/701 ALL PASS · test-card-lines ALL PASS · test-seed-safety ALL PASS · test-data-split ALL PASS · single_pass_test 36/36.

### Next step
- Sections 1 (incl. the 1:08 PM Top Prospects button correction), 2, 4 and 3.6 are committed on pkg-2026-11-20. Remaining: section 3 (re-pull Steamer, keepers from the room read-only, pool changes, SEED_VER bump, AAV rerun, cards + pitch-hist backfill, Draft List PDF; the operator uploads it to OneDrive). Note for section 3: the AAV rerun will re-price Jenkins once he is out of the room's keeper list; the 3.6 test pins him as a kept {k:8}, so update its fixture ids/values then.
- Section 2 follow-up: 85 names in `reports/rotoworld_unresolved_2026-11-20.csv` need a hand review (or a `--sitemap-years all` re-crawl, which also records candidate ids).
- Still no push / PR / preview until Steven says so in his own words.

## Phase D — section 3 (pool refresh + AAV rerun) — STOPPED at step 1 (2026-11-20 13:31 ET)

Keeper room re-pull, read-only (anonymous GET `drafts/steven-keepers-b442410a.json`, 2026-11-20 13:31:15 ET). Saved as-is: `/workspace/db2027/keepers/room_steven-keepers-b442410a_2026-11-20.json`. No keeper_split csv written (the pull fails the gate).
- Room: **48 keepers / $485**, meta.t **2026-11-17 17:47:18 ET** (lastWriter device-itkav, seedVer 2027-actuals.7).
- Picks are **identical** (pid, name, team, price) to the 11/16 pull `room_steven-keepers-b442410a_2026-11-16.json`; only meta.t moved (11/16 14:40 -> 11/17 17:47).
- **Junior Caminero is NOT kept** (not in the room at all). **Walker Jenkins IS kept**: Money Bags, **$5** (spec's "$8" is his AAV curve k:8, not his salary).
- Money Bags in the room: Jenkins $5, Spencer Jones $3, Chase DeLauter $3, Gavin Williams $8, Nick Kurtz $5.
- `node tools/sync-keepers.mjs --check`: MATCH with data/seed-2027.js (48 / $485).
- Per the hard rule ("if the room does not show that, STOP and report") nothing else in section 3 was done: no Steamer archive/re-pull, no overrides, no SEED_VER bump, no AAV rerun, no cards, no tests rebaselined. No repo data file changed.

### Next step
- Steven needs to make the Caminero-for-Jenkins swap in the keeper room (or confirm another room id). Then rerun Phase D from step 1. If Jenkins's salary is really $5, the expected keeper total is 485 + 32 - 5 = **$512**, not ~$509.

## Phase D2 (Grok Build) — keeper gate passes; continuing section 3 (2026-11-20)

Claude stopped at the 13:31 ET keeper gate. Grok Build resumed after Steven's swap. Verified before any new write:

### Keepers — GATE PASSES
- Saved pull `/workspace/db2027/keepers/room_steven-keepers-b442410a_2026-11-20.json` and `keeper_split_2026-11-20_room.csv` (48 rows).
- Live read-only GET of `drafts/steven-keepers-b442410a.json` is **identical** to the saved room json (picks and meta).
- meta.t **2026-11-20 13:39:24 ET**, lastWriter `admin-swap`, seedVer still `2027-actuals.7` (not written back; no Firebase write).
- **48 keepers / $512**. Junior Caminero `pabd0d7f` kept, Money Bags, **$32**. Walker Jenkins `p6377140` is **not** in the room.
- Money Bags now: Caminero $32, Gavin Williams $8, Nick Kurtz $5, Chase DeLauter $3, Spencer Jones $3.

### Steamer archive + re-pull — verified, already done (13:45 ET)
- `steamer/archive_2026-11-18/SHA256SUMS` checks OK for `2027_bat.json`, `2027_pit.json`, `match_report.csv`, `values_2027_steamer.csv`.
- Current `2027_bat.json` / `2027_pit.json` differ from that archive. Counts: bat 4,165, pit 5,170 (same counts as 11/18, contents changed). No duplicate xMLBAMID.
- `METHOD.md` and `valuation.py` source column already say **pulled 11/20/2026**. `values_2027_steamer.csv` is still the 11/18 file (valuation not re-run yet).
- `match.py` was not edited.

### Stats API re-check (this session, not yet applied)
- 3.2 moves are in transactions 11/17–11/21: Garcia/McArthur to SEA; Miller/Evans/Ferrer to KCR; Gray signed MIN; Fortes to BOS; Jung to LAA; Nett claimed BAL; Baumler returned BAL; Castillo + Martin to COL; Sullivan to CHW; Cairo claimed TOR; Scholtens released. May signed CHW (transaction text has **no** contract dollars; $52.5M not confirmed, not invented).
- 3.3: Meyers has no 11/17–11/21 transaction; current team Sugar Land, parent HOU. **Do not set fa.** The other open DFAs (Vierling, Bart, Mears, Juenger, Tur, J. Miller, Sweeney, Isbel, Leasure, Wong, Lee) show designation only — no claim, outright, or release. **No status change.**
- Steamer 11/20 lines: May CHW AL 159.8 IP SP; Sullivan CHW AL 30.0 IP (was COL 108.1); Cairo TOR AL 51.4 PA (was LAD 11.0); Rose **no line**; Lamkin KCR 1.0 IP; Honeycutt BAL 1.0 PA; DeBarge MIN 11.6 PA; Gray MIN AL 175.3 IP (was Team=None).

### Next
Match wrapper + valuation on the current pool, then overrides + 7 adds, then a second match/valuation so the adds are in the values file (11/18 did new players in the same match). Then sync-keepers, SEED_VER `2027-actuals.9`, val/p27, AAV.
