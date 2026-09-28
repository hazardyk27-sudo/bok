# Cascade 8 — 5,000,000 Spin RTP Analytics

## Run

| Metric | Value |
| --- | ---: |
| Seed | `special-chances-updated-5m` |
| Paid spins | 5,000,000 |
| Bet | 1.00 |
| Total bet | 5000000.00 |
| Total return | 6045509.95 |
| Return decomposition delta | 0 cents |

## RTP and wins

| Metric | Value |
| --- | ---: |
| Overall RTP | 120.9102% |
| Normal game RTP | 83.9173% |
| Free Spin RTP | 36.9929% |
| Settlement Core RTP contribution | 50.969% |
| Hit rate | 43.0541% |
| Initial board 8+ rate | 42.8713% |
| 100x+ frequency | 0.107% |
| 500x+ frequency | 0.0115% |
| 1000x+ frequency | 0.0044% |
| Maximum observed spin win | 9391.2x |

## Bonus

| Metric | Value |
| --- | ---: |
| Bonus trigger count | 29,497 |
| Bonus frequency | 1 in 169.51 |
| Free Spin count | 367,895 |
| Free Spin hit rate | 40.3425% |
| Free Spin initial board with at least 1 Core | 52.1883% |
| Free Spin initial board with at least 2 Cores | 16.2685% |
| Average bonus win | 62.7062x |
| Bonus retrigger rate | 25.3755% |
| Free Spin retrigger rate | 13.3081% |
| Average Free Spins per bonus | 12.4723 |

## Core

| Metric | Value |
| --- | ---: |
| Normal Core spawn rate / base refill cell | 0.3122% |
| Paid spins with at least one Normal Core | 2.0194% |
| Normal Core average value | 5.0449x |
| Free Spin initial Core spawn rate / cell | 2.4192% |
| Free Spin refill Core spawn rate / refill cell | 2.4126% |
| Free Spin Core average value, all | 8.5161x |
| Free Spin initial Core average value | 8.5153x |
| Free Spin refill Core average value | 8.5204x |
| Free Spin refill average Core count | 0.2269 |
| Average combined Core multiplier | 10.3089x |
| Highest observed total Core value | 1250x |

## Tumbles and pairs

| Metric | Value |
| --- | ---: |
| Average tumbles per paid spin | 0.7507 |
| Exact 2 tumble frequency | 9.7025% |
| Exact 3 tumble frequency | 3.9167% |
| Exact 4 tumble frequency | 1.626% |
| Cumulative 2+ / 3+ / 4+ frequency | 16.7982% / 7.0956% / 3.179% |
| Maximum tumble count | 41 |
| Initial board pair frequency | 100% |
| Refill pair frequency | 97.8962% |
| Visible pair frequency | 96.0926% |
| 3 / 4 / 5 same-symbol column frequency | 18.2866% / 7.2663% / 0.8272% |

## Third-position fallback

Third-position samples use only weighted selection with the previous visible symbol attenuated. Pair-internal copy metrics are reported separately.

| Symbol | Fallback samples | Same-symbol rate |
| --- | ---: | ---: |
| S1 | 151743 | 7.9944% |
| S5 | 138009 | 7.0829% |
| S7 | 134043 | 6.7881% |
| S6 | 125056 | 6.2932% |
| S4 | 115052 | 5.6687% |
| S2 | 105808 | 5.1111% |
| S3 | 101009 | 5.0896% |
| S9 | 77154 | 3.5863% |
| S8 | 52125 | 2.5228% |

## Symbol observations

Rates are percentages of the corresponding cell denominator. Hit counts are winning-symbol events, not raw cell appearances.

| Symbol | Initial count | Refill count | Visible count | Initial rate | Refill rate | Visible rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| S1 | 24413450 | 5442506 | 38719855 | 15.1602% | 15.2901% | 14.15% |
| S5 | 22041890 | 4893877 | 36115932 | 13.6875% | 13.7488% | 13.1984% |
| S7 | 21253621 | 4712861 | 35172144 | 13.198% | 13.2402% | 12.8535% |
| S6 | 19676506 | 4359648 | 33214487 | 12.2186% | 12.2479% | 12.1381% |
| S4 | 18109441 | 3989630 | 31116280 | 11.2455% | 11.2084% | 11.3713% |
| S2 | 16533285 | 3638709 | 28880730 | 10.2668% | 10.2225% | 10.5544% |
| S3 | 15738519 | 3459955 | 27680797 | 9.7732% | 9.7203% | 10.1158% |
| S9 | 11814611 | 2587438 | 21373666 | 7.3366% | 7.2691% | 7.8109% |
| S8 | 7874818 | 1724491 | 14441272 | 4.8901% | 4.8448% | 5.2775% |
| SCATTER | 3133077 | 629012 | 5983402 | 1.9456% | 1.7671% | 2.1866% |
| MULTIPLIER_CORE | 447632 | 156876 | 939355 | 0.278% | 0.4407% | 0.3433% |

## Galatasaray explosions

Definition: every tumble/screen event where Galatasaray has at least 8 winning cells. Explosion rate is per all tumble/screen events; paid-spin rate is reported separately.

| Metric | Value |
| --- | ---: |
| Total explosion events | 20909 |
| Explosion rate / tumble event | 0.5571% |
| Explosion rate / paid spin | 0.4182% |

| GS winning cells | Events | Rate / tumble event |
| --- | ---: | ---: |
| 8 | 15270 | 0.4068% |
| 9 | 4308 | 0.1148% |
| 10 | 1068 | 0.0285% |
| 11 | 200 | 0.0053% |
| 12+ | 63 | 0.0017% |

## Validation

| Check | Value |
| --- | ---: |
| Total return = base + bonus | PASS |
| Overall RTP - normal RTP - Free Spin RTP | 0.0000 percentage points |
