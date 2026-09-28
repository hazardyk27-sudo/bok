# Cascade 8 — 5,000,000 Spin RTP Analytics

## Run

| Metric | Value |
| --- | ---: |
| Seed | `symbol-paytable-requested-5m` |
| Paid spins | 5,000,000 |
| Bet | 1.00 |
| Total bet | 5000000.00 |
| Total return | 5717805.00 |
| Return decomposition delta | 0 cents |

## RTP and wins

| Metric | Value |
| --- | ---: |
| Overall RTP | 114.3561% |
| Normal game RTP | 84.9338% |
| Free Spin RTP | 29.4223% |
| Settlement Core RTP contribution | 44.2906% |
| Hit rate | 43.183% |
| Initial board 8+ rate | 43.0448% |
| 100x+ frequency | 0.0917% |
| 500x+ frequency | 0.0096% |
| 1000x+ frequency | 0.0036% |
| Maximum observed spin win | 9151.5x |

## Bonus

| Metric | Value |
| --- | ---: |
| Bonus trigger count | 24,636 |
| Bonus frequency | 1 in 202.96 |
| Average bonus win | 59.714x |
| Bonus retrigger rate | 25.1745% |
| Free Spin retrigger rate | 13.2422% |
| Average Free Spins per bonus | 12.4312 |

## Core

| Metric | Value |
| --- | ---: |
| Normal Core spawn rate / base refill cell | 0.31% |
| Paid spins with at least one Normal Core | 2.0206% |
| Normal Core average value | 5.0154x |
| Free Spin initial Core spawn rate / cell | 2.1111% |
| Free Spin refill Core spawn rate / refill cell | 2.2936% |
| Free Spin Core average value, all | 8.6145x |
| Free Spin initial Core average value | 8.5739x |
| Free Spin refill Core average value | 8.801x |
| Free Spin refill average Core count | 0.2161 |
| Average combined Core multiplier | 9.6239x |
| Highest observed total Core value | 1252x |

## Tumbles and pairs

| Metric | Value |
| --- | ---: |
| Average tumbles per paid spin | 0.7484 |
| Exact 2 tumble frequency | 9.7669% |
| Exact 3 tumble frequency | 3.9678% |
| Exact 4 tumble frequency | 1.6379% |
| Cumulative 2+ / 3+ / 4+ frequency | 16.8738% / 7.1069% / 3.1391% |
| Maximum tumble count | 42 |
| Initial board pair frequency | 100% |
| Refill pair frequency | 98.2021% |
| Visible pair frequency | 96.1071% |
| 3 / 4 / 5 same-symbol column frequency | 18.4006% / 7.288% / 0.8331% |

## Third-position fallback

Third-position samples use only weighted selection with the previous visible symbol attenuated. Pair-internal copy metrics are reported separately.

| Symbol | Fallback samples | Same-symbol rate |
| --- | ---: | ---: |
| S1 | 151851 | 7.8366% |
| S5 | 137987 | 7.1115% |
| S7 | 133742 | 6.8894% |
| S6 | 124652 | 6.2438% |
| S4 | 115251 | 5.6442% |
| S2 | 106161 | 5.3447% |
| S3 | 101168 | 4.8405% |
| S9 | 77186 | 3.6872% |
| S8 | 52001 | 2.4019% |

## Symbol observations

Rates are percentages of the corresponding cell denominator. Hit counts are winning-symbol events, not raw cell appearances.

| Symbol | Initial count | Refill count | Visible count | Initial rate | Refill rate | Visible rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| S1 | 24184589 | 5431349 | 38471652 | 15.1925% | 15.295% | 14.1724% |
| S5 | 21830524 | 4888834 | 35873394 | 13.7137% | 13.7672% | 13.2153% |
| S7 | 21046078 | 4702474 | 34947985 | 13.2209% | 13.2424% | 12.8743% |
| S6 | 19500509 | 4348960 | 33026758 | 12.25% | 12.2469% | 12.1666% |
| S4 | 17933950 | 3983458 | 30918542 | 11.2659% | 11.2177% | 11.39% |
| S2 | 16365857 | 3628842 | 28692721 | 10.2809% | 10.219% | 10.57% |
| S3 | 15584996 | 3453365 | 27530183 | 9.7903% | 9.7249% | 10.1417% |
| S9 | 11694631 | 2581487 | 21239797 | 7.3464% | 7.2696% | 7.8244% |
| S8 | 7800527 | 1717597 | 14358386 | 4.9002% | 4.8369% | 5.2894% |
| SCATTER | 2870348 | 627659 | 5577951 | 1.8031% | 1.7675% | 2.0548% |
| MULTIPLIER_CORE | 375641 | 146593 | 817031 | 0.236% | 0.4128% | 0.301% |

## Galatasaray explosions

Definition: every tumble/screen event where Galatasaray has at least 8 winning cells. Explosion rate is per all tumble/screen events; paid-spin rate is reported separately.

| Metric | Value |
| --- | ---: |
| Total explosion events | 21212 |
| Explosion rate / tumble event | 0.5668% |
| Explosion rate / paid spin | 0.4242% |

| GS winning cells | Events | Rate / tumble event |
| --- | ---: | ---: |
| 8 | 15512 | 0.4145% |
| 9 | 4309 | 0.1151% |
| 10 | 1076 | 0.0288% |
| 11 | 270 | 0.0072% |
| 12+ | 45 | 0.0012% |

## Validation

| Check | Value |
| --- | ---: |
| Total return = base + bonus | PASS |
| Overall RTP - normal RTP - Free Spin RTP | -0.0000 percentage points |
