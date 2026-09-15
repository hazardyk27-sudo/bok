# Cascade 8 — 10M RTP Analytics

## Run

| Metric | Value |
| --- | ---: |
| Seed | `symbol-paytable-updated-5m` |
| Paid spins | 5,000,000 |
| Bet | 1.00 |
| Total bet | 5000000.00 |
| Total return | 8345201.30 |
| Return decomposition delta | 0 cents |

## RTP and wins

| Metric | Value |
| --- | ---: |
| Overall RTP | 166.904% |
| Normal game RTP | 92.5086% |
| Free Spin RTP | 74.3955% |
| Settlement Core RTP contribution | 97.897% |
| Hit rate | 42.8926% |
| Initial board 8+ rate | 42.5084% |
| 100x+ frequency | 0.2075% |
| 500x+ frequency | 0.0217% |
| 1000x+ frequency | 0.008% |
| Maximum observed spin win | 10000x |

## Bonus

| Metric | Value |
| --- | ---: |
| Bonus trigger count | 55,014 |
| Bonus frequency | 1 in 90.89 |
| Average bonus win | 67.615x |
| Bonus retrigger rate | 34.4276% |
| Free Spin retrigger rate | 18.8851% |
| Average Free Spins per bonus | 13.5257 |

## Core

| Metric | Value |
| --- | ---: |
| Normal Core spawn rate / base refill cell | 0.4494% |
| Paid spins with at least one Normal Core | 3.0948% |
| Normal Core average value | 5.063x |
| Free Spin initial Core spawn rate / cell | 3.02% |
| Free Spin refill Core spawn rate / refill cell | 1.3768% |
| Free Spin Core average value, all | 8.5839x |
| Free Spin initial Core average value | 8.6005x |
| Free Spin refill Core average value | 8.4097x |
| Free Spin refill average Core count | 0.1305 |
| Average combined Core multiplier | 11.4049x |
| Highest observed total Core value | 1507x |

## Tumbles and pairs

| Metric | Value |
| --- | ---: |
| Average tumbles per paid spin | 0.8551 |
| Exact 2 tumble frequency | 10.1449% |
| Exact 3 tumble frequency | 4.3065% |
| Exact 4 tumble frequency | 1.9519% |
| Cumulative 2+ / 3+ / 4+ frequency | 18.9828% / 8.8379% / 4.5314% |
| Maximum tumble count | 67 |
| Initial board pair frequency | 100% |
| Refill pair frequency | 95.9748% |
| Visible pair frequency | 96.0338% |
| 3 / 4 / 5 same-symbol column frequency | 17.9993% / 7.1922% / 0.8044% |

## Symbol observations

Rates are percentages of the corresponding cell denominator. Hit counts are winning-symbol events, not raw cell appearances.

| Symbol | Initial count | Refill count | Visible count | Initial rate | Refill rate | Visible rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| S1 | 25985657 | 6313387 | 42300058 | 15.0796% | 15.4045% | 14.0724% |
| S5 | 23452457 | 5659321 | 39417377 | 13.6096% | 13.8086% | 13.1134% |
| S7 | 22623933 | 5440974 | 38402652 | 13.1288% | 13.2759% | 12.7758% |
| S6 | 20945772 | 5006890 | 36249404 | 12.1549% | 12.2167% | 12.0594% |
| S4 | 19272798 | 4595185 | 33978458 | 11.1841% | 11.2122% | 11.3039% |
| S2 | 17590137 | 4168457 | 31522658 | 10.2076% | 10.1709% | 10.4869% |
| S3 | 16756730 | 3956794 | 30241734 | 9.724% | 9.6545% | 10.0608% |
| S9 | 12561590 | 2938743 | 23347102 | 7.2896% | 7.1705% | 7.7671% |
| S8 | 8377236 | 1946508 | 15807016 | 4.8614% | 4.7494% | 5.2587% |
| SCATTER | 4082684 | 730379 | 7894352 | 2.3692% | 1.7821% | 2.6263% |
| MULTIPLIER_CORE | 674156 | 227322 | 1428689 | 0.3912% | 0.5547% | 0.4753% |

## Galatasaray explosions

Definition: every tumble/screen event where Galatasaray has at least 8 winning cells. Explosion rate is per all tumble/screen events; paid-spin rate is reported separately.

| Metric | Value |
| --- | ---: |
| Total explosion events | 33554 |
| Explosion rate / tumble event | 0.7848% |
| Explosion rate / paid spin | 0.6711% |

| GS winning cells | Events | Rate / tumble event |
| --- | ---: | ---: |
| 8 | 22787 | 0.533% |
| 9 | 7628 | 0.1784% |
| 10 | 2369 | 0.0554% |
| 11 | 605 | 0.0142% |
| 12+ | 165 | 0.0039% |

## Validation

| Check | Value |
| --- | ---: |
| Total return = base + bonus | PASS |
| Overall RTP - normal RTP - Free Spin RTP | -0.0001 percentage points |
