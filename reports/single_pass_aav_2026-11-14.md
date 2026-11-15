# CTHL AAV single pass — report (2026-11-14)

Spec: `/workspace/db2027/specs/single-pass-aav-spec-2026-11-14.md`. Generator: `tools/aav_single_pass.py`. Board: `AAV_2027` in `index.html`.
One curve prices all 250 slots (keepers included). Keepers' price = keeper AAV, display only, never counted in cash.

## Pot used

| Pot | H | P | Total | Non-keeper AAVs | Keeper $ + non-keeper | Max diff vs v3.1 | Moved |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Solved (keepers final, used for the board)** | $2,233.12 | $808.37 | **$3,041.48** | $2,103 | **$2,570** | $0 | 0 of 202 |
| Pre-final 2570 x 1.1689 | $2,253.64 | $750.43 | **$3,004.07** | $2,080.72 | $2,547.72 | $3 | 43 of 202 |

1.1689 = avg of 2025 1.1704 / 2026 1.1673 (consistent-form keeper inflation). It is the pot to use before keepers are final; once they are, the solved pot reconciles to $2,570 and is what the board uses.

## Acceptance (48 keepers / $467)

- Non-keeper prices vs v3.1 (`aav_2027_v3_1.csv`): max diff **$0**, **0** moved of 202 (unrounded max 2.8e-14).
- Keeper values: Nick Kurtz $48, Julio Rodriguez $39, Cam Schlittler $37, Ben Rice $37, Logan Gilbert $37; 0 keepers differ from the current display.
- Cash check: $467 keeper salaries + $2,103 non-keeper AAVs = **$2,570**.

## Keeper scenarios (5-per-team cap only; 50u dropped)

| Scenario | Keepers | Salary | Max/team | Solved pot (H / P) | Non-keeper | Cash check | Added vs 48 | Dropped vs 48 |
|---|---:|---:|---:|---|---:|---:|---|---|
| 42 | 42 | $309 | 5 | $2,972.96 ($2,199.25 / $773.71) | $2,261 | $2,570 | Brooks Lee, Bryce Rainer, Coby Mayo, Dillon Dingler, Jonathan Aranda, Kody Clemens, Michael Wacha, Taylor Walls, Trey Yesavage | Andrew Benintendi, Bryan Woo, Cal Raleigh, Cam Smith, Jake Burger, Jordan Westburg, Josh Hader, Julio Rodriguez, Kaelen Culpepper, Kyle Teel, Lazaro Montes, Logan Gilbert, Riley Greene, Spencer Jones, Yandy Diaz |
| 47 | 47 | $424 | 5 | $3,054.73 ($2,246.37 / $808.37) | $2,146 | $2,570 | - | Pete Alonso |
| 48 | 48 | $467 | 5 | $3,041.48 ($2,233.12 / $808.37) | $2,103 | $2,570 | - | - |
| 50 | 50 | $471 | 5 | $3,041.48 ($2,233.12 / $808.37) | $2,099 | $2,570 | Brice Matthews, Seth Lugo | - |
