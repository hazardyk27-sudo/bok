# Cascade 8 — 10M RTP Analytics

## Run

| Metric | Value |
| --- | ---: |
| Seed | `symbol-paytable-rounded-10m` |
| Paid spins | 10,000,000 |
| Bet | 1.00 |
| Total bet | 10000000.00 |
| Total return | 21482417.50 |
| Return decomposition delta | 0 cents |

## RTP and wins

| Metric | Value |
| --- | ---: |
| Overall RTP | 214.8242% |
| Normal game RTP | 122.0101% |
| Free Spin RTP | 92.8141% |
| Settlement Core RTP contribution | 123.0941% |
| Hit rate | 40.3299% |
| Initial board 8+ rate | 39.9344% |
| 100x+ frequency | 0.2819% |
| 500x+ frequency | 0.0308% |
| 1000x+ frequency | 0.0111% |
| Maximum observed spin win | 10000x |

## Bonus

| Metric | Value |
| --- | ---: |
| Bonus trigger count | 104,279 |
| Bonus frequency | 1 in 95.90 |
| Average bonus win | 89.0055x |
| Bonus retrigger rate | 33.2147% |
| Free Spin retrigger rate | 18.2633% |
| Average Free Spins per bonus | 13.3811 |

## Core

| Metric | Value |
| --- | ---: |
| Normal Core spawn rate / base refill cell | 0.4492% |
| Paid spins with at least one Normal Core | 2.8503% |
| Normal Core average value | 5.0745x |
| Free Spin initial Core spawn rate / cell | 3.0238% |
| Free Spin refill Core spawn rate / refill cell | 1.3749% |
| Free Spin Core average value, all | 8.5573x |
| Free Spin initial Core average value | 8.5459x |
| Free Spin refill Core average value | 8.688x |
| Free Spin refill average Core count | 0.1292 |
| Average combined Core multiplier | 11.3679x |
| Highest observed total Core value | 1507x |

## Tumbles and pairs

| Metric | Value |
| --- | ---: |
| Average tumbles per paid spin | 0.7892 |
| Exact 2 tumble frequency | 9.3705% |
| Exact 3 tumble frequency | 3.9149% |
| Exact 4 tumble frequency | 1.7757% |
| Cumulative 2+ / 3+ / 4+ frequency | 17.4448% / 8.0743% / 4.1594% |
| Maximum tumble count | 55 |
| Initial board pair frequency | 100% |
| Refill pair frequency | 96.4473% |
| Visible pair frequency | 96.0099% |
| 3 / 4 / 5 same-symbol column frequency | 17.7741% / 7.0643% / 0.7612% |

## Symbol observations

Rates are percentages of the corresponding cell denominator. Hit counts are winning-symbol events, not raw cell appearances.

| Symbol | Initial count | Refill count | Visible count | Initial rate | Refill rate | Visible rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| S1 | 43239677 | 9583376 | 71635954 | 12.6483% | 12.7844% | 12.3805% |
| S5 | 43224030 | 9580924 | 71598333 | 12.6437% | 12.7811% | 12.374% |
| S6 | 43221119 | 9582749 | 71611294 | 12.6429% | 12.7835% | 12.3762% |
| S7 | 43229100 | 9584206 | 71634257 | 12.6452% | 12.7855% | 12.3802% |
| S4 | 41539785 | 9179202 | 69470306 | 12.1511% | 12.2452% | 12.0062% |
| S2 | 38226563 | 8389816 | 65042935 | 11.1819% | 11.1921% | 11.241% |
| S3 | 34915981 | 7617665 | 60342371 | 10.2135% | 10.1621% | 10.4287% |
| S9 | 31592920 | 6859712 | 55356630 | 9.2415% | 9.151% | 9.567% |
| S8 | 13298848 | 2840292 | 24226716 | 3.8901% | 3.789% | 4.187% |
| SCATTER | 8107174 | 1332778 | 15098845 | 2.3715% | 1.7779% | 2.6095% |
| MULTIPLIER_CORE | 1265813 | 410979 | 2602829 | 0.3703% | 0.5483% | 0.4498% |

## Galatasaray explosions

Definition: every tumble/screen event where Galatasaray has at least 8 winning cells. Explosion rate is per all tumble/screen events; paid-spin rate is reported separately.

| Metric | Value |
| --- | ---: |
| Total explosion events | 28696 |
| Explosion rate / tumble event | 0.3636% |
| Explosion rate / paid spin | 0.287% |

| GS winning cells | Events | Rate / tumble event |
| --- | ---: | ---: |
| 8 | 20241 | 0.2565% |
| 9 | 6175 | 0.0782% |
| 10 | 1747 | 0.0221% |
| 11 | 424 | 0.0054% |
| 12+ | 109 | 0.0014% |

## Validation

| Check | Value |
| --- | ---: |
| Total return = base + bonus | PASS |
| Overall RTP - normal RTP - Free Spin RTP | 0.0000 percentage points |
