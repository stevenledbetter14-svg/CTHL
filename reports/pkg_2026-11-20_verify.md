# 11/20 package — final verification

Branch `pkg-2026-11-20`. App and data bytes checked here match the PDF ref `08e8f6f` (progress commit `f3feef2` changes only the progress log). Headless load: `file:///workspace/CTHL-v2/index.html?room=local`. `SY.room` is empty, sync is off, mode is `local`. Firebase requests during the check: **0**. Console errors: **0**. `DATA_FAIL` is empty. Nothing pushed.

## Versions

`APP_VER` is `2026.11.20-1`. `SEED_VER` is `2027-actuals.9`. Footer: `v2026.11.20-1 · data 2027-actuals.9 · built 2026-11-16`.

All seven data `?v=` tags equal `APP_VER`:

- `data/seed-2027.js?v=2026.11.20-1`
- `data/aav-2027.js?v=2026.11.20-1`
- `data/cards-2027.js?v=2026.11.20-1`
- `data/keepers-2027.js?v=2026.11.20-1`
- `data/rotoid.js?v=2026.11.20-1`
- `data/logos.js?v=2026.11.20-1`
- `data/writeups-2027.js?v=2026.11.20-1`

The loaded page reports the same seven tags. Pool size on that load: **655** players. Keepers: **48 / $512**.

## Draft List PDF (section 3.5)

| | |
|---|---|
| Dated PDF | `/workspace/db2027/rosters/CTHL 2027 Rosters DRAFT 2026-11-20.pdf` |
| Upload copy | `/workspace/db2027/rosters/upload_2026-11-20/CTHL 2027 Draft List.pdf` (byte-identical) |
| Built from | `08e8f6fa532e87465a9f2e09858101ab82b3b473` |
| Pages | 15 (pdfinfo, letter) |
| Players | 655, equal to the app Draft List (`draft_list` 655, `S.players` 655) |
| Size | 79,033 bytes (under 1 MB) |
| Title | `CTHL 2027 Rosters - DRAFT 11/20/2026` |
| Body font | Carlito, team size 12 pt on every club (same as the 11/18 log). No club shrunk. |

pdftotext: `$` followed by a digit: 0. `Provisional`: 0. `Top 100`: 0. `PR` plus digits: 0. The `$` signs are the 225 `$$$` handwriting headers. `DRAFT 11/20/2026` is on all 15 pages.

Page 1 PNG: Baltimore Orioles, header `DRAFT 11/20/2026`, three columns, grey `$$$` / Owner / section bars, blank price and owner lines, sections through DH, footer `BAL - 48 players`. Vance Honeycutt is in the outfield block. Christian Encarnacion-Strand is fitted at 7.75 pt, the same size the 11/18 run used for that name. The team body size stays 12 pt.

The PDF is outside the repo, same as 11/18. OneDrive was not touched. The operator uploads `CTHL 2027 Draft List.pdf`.

## Tests

Every command exited 0.

| Command | Result |
|---|---|
| `node tests/single_pass_test.mjs` | 36 passed, 0 failed |
| `node tools/test-card-lines.mjs` | ALL PASS |
| `node tools/test-data-split.mjs` | ALL PASS |
| `node tools/test-keeper-aav-fallback.mjs` | ALL PASS |
| `node tools/test-no-ranks-writeups.mjs` | ALL PASS |
| `node tools/test-rotoworld-links.mjs --expect 616/708` | ALL PASS (616/708) |
| `node tools/test-seed-safety.mjs` | ALL PASS |
| `node tools/build-ref-board.mjs --check` | OK (`ref_board_2026-11-20.csv`, `3e75f73`, 202 non-keepers / 48 keepers) |

`single_pass_test` also checks the in-app Draft List: no AAV `$` on its 655 rows. Cash on the board is `$512` keeper salaries + `$2,058` non-keeper AAVs = `$2,570`.

## Headless app (`file://`, `?room=local`)

### Future Stars

51 Future Stars cards opened. Every `cfTag` is empty and the Future Stars banner is still on the front. None of those cards contain `Provisional`, `Top 100 prospect`, or `PR` plus digits. `tools/test-no-ranks-writeups.mjs` opens the whole pool and reports the same: no card shows that text.

### Top Prospects button

The `★ Top Prospects` button is on the Projections position row. Tooltip: `Show only top prospects`.

This file:// pass left **hide drafted** at its default (checked), so the counts are the undrafted pool:

- Hitters: 279 → 31 prospects → 279 again.
- Pitchers: 328 → 11 prospects → 328 again.

`tools/test-no-ranks-writeups.mjs` clears hide drafted and gets the same prospect counts against the full pool: 31 of 317 hitters, 11 of 338 pitchers. 317 + 338 = 655. The 48-player gap is the kept players hidden by the default checkbox. Filter text and tooltips have no `Provisional`, `Top 100`, or `PR` plus digits.

### Write-ups

All 10 pilot card backs show `WRITEUPS2027[id].text` exactly (`approved_by: Eno`). The write-up slot on the other 645 cards is empty.

The only `$` inside a write-up is Junior Caminero's `$87,500` signing bonus, which is in the approved text. The auction-dollar check (`$` plus digits that are not a comma-grouped real-money figure) matched none of the 10 slots.

| Player | id | Write-up exact | `$` in the write-up |
|---|---|---|---|
| Garrett Crochet | p301850c | yes | none |
| Bobby Witt Jr. | p5c9bcf3 | yes | none |
| Junior Caminero | pabd0d7f | yes | `$87,500` (signing bonus) |
| Jac Caglianone | p87322e2 | yes | none |
| Aaron Judge | p8c74fc1 | yes | none |
| Jose Ramirez | p7f1b103 | yes | none |
| Nick Kurtz | pf97704 | yes | none |
| Julio Rodriguez | p9ccea09 | yes | none |
| Cam Schlittler | p28aaca5 | yes | none |
| Zach Neto | pbd68516 | yes | none |

### The 7 adds

All seven are in the 655-player pool. May's card box shows `$3`. A stored `{a:0}` and Rose's missing row both display as `—` (the box paints a figure only when the shown AAV is above 0).

| Player | id | Team | Elig | AAV_2027 | Card box |
|---|---|---|---|---|---|
| Dustin May | pba6785e | CHW | SP | `{a:3}` | `$3` |
| Sean Sullivan | pd57810d | CHW | RP | `{a:0}` | `—` |
| Christian Cairo | pece81c2 | TOR | SS/MI | `{a:0}` | `—` |
| Zion Rose | p18b962a | KCR | OF | no entry | `—` |
| Justin Lamkin | p86b38f3 | KCR | SP | `{a:0}` | `—` |
| Vance Honeycutt | pf977fae | BAL | OF | `{a:0}` | `—` |
| Kyle DeBarge | p7c99a58 | MIN | 2B/MI | `{a:0}` | `—` |

### Caminero and Jenkins

Junior Caminero (`pabd0d7f`, TBR) is kept by Money Bags at **$32**. `AAV_2027` is `{k:56}` (no `a`). While kept, the card box label is `Keeper` and the box is `🔒 $32`. The pool cell is the lock plus `$32`, titled `Keeper salary. Ranked by AAV $56.`

Walker Jenkins (`p6377140`, MIN) is not kept. `AAV_2027` is `{a:8}` (no `k`). The card box label is `CTHL AAV 2027` and the box is `$8`. The pool cell is `<b>$8</b>` with no keeper-curve title. That `$8` is the regular auction `a`, inside the `$2,058`.

`tools/test-keeper-aav-fallback.mjs` also takes Caminero off the keeper list in the page. The box then shows `$56` under `CTHL AAV 2027`, and the pool cell uses the display-only curve title. That is the `{k}` fallback. Jenkins never takes that path.

### Pot and inflation

Setting all **48** `k` values to 999 left this snapshot identical: `inflationFactors()`, every `maxBid()`, every `p.val`, the meter, the money board, and the money foot.

Live figures on the kept board, before and after that mutation:

- Inflation H **1.155074**, P **1.206047**.
- Basis pots H **$1,927.50** / P **$642.50** (the $2,570 basis at the 75/25 split).
- Keeper salaries H **$408** + P **$104** = **$512**.
- Meter: picks left 202, draft complete 19%, **In the pot $2,043**.

The offline AAV run's solved pot **$3,051.18** and implied inflation **1.1872** are the figures in `reports/aav_run_2026-11-20.md`. This check did not rerun that valuation. `inflationFactors`, `fullPoolVal`, `maxBid`, `renderMeter`, and `renderMoney` do not read `AAV_2027`. The `{k}` dollars stay out of those figures.
