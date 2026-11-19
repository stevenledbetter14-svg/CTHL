# tests/

## Acceptance test: `single_pass_test.mjs`

```
node tests/single_pass_test.mjs [--ref path/to/ref_board.csv]
```

Loads `index.html` in headless Chrome and checks the AAV single pass, the cash check and the
card/Draft List rules against the app. Needs node >= 22 and google-chrome.

Prices are compared against a **reference board**: the latest `tests/fixtures/ref_board_<date>.csv`
(strict: non-keeper AAVs and keeper display values within $1; the compared non-keeper count is
pinned in the test). The fixture is a committed snapshot, not read live from `data/`, so the
test catches any drift between the app board and the signed-off board.

## Reference board rebuild (every pool refresh)

**Run on every pool refresh after sign-off and before merge:**

```
node tools/build-ref-board.mjs           # writes tests/fixtures/ref_board_<date>.csv
node tools/build-ref-board.mjs --check   # exits 1 if the fixture is missing or stale
```

- Inputs: `data/seed-2027.js` (pool, baked keeper picks) and `data/aav-2027.js` (`AAV_2027`);
  `SEED_VER` is read from `index.html`. `<date>` is the date of the last commit touching the inputs.
- The header (`#` lines) records the source commit, `SEED_VER`, input sha256s and the counts.
- Deterministic: same inputs give a byte-identical file. `--check` regenerates and compares; it
  also fails if the data files have uncommitted changes or a newer fixture date is due.
- After a rebuild, update the compared count in `single_pass_test.mjs` (`compared === N`) to the
  header's "priced non-keepers" count, delete the superseded fixture, and commit both together.
- Then rebuild the printed Draft List PDF (pool refresh checklist in `reports/README.md`).

## Other self-tests (in `tools/`)

```
node tools/test-card-lines.mjs
node tools/test-seed-safety.mjs
node tools/test-data-split.mjs
node tools/test-no-ranks-writeups.mjs   # no prospect ranks + card write-ups (2026-11-20)
node tools/test-rotoworld-links.mjs [--expect 616/701]   # Rotoworld link coverage via the app's rotoUrl() (2026-11-20)
node tools/test-keeper-aav-fallback.mjs   # un-kept keeper shows curve k, display only (3.6, 2026-11-20)
```
