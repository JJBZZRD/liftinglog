# Metric Rules

This file documents the current per-metric rules used by the `performanceGuide` engine. All windows, thresholds, weights, and cutoffs are centralized in [lib/userMetrics/performanceGuide/constants.ts](../../lib/userMetrics/performanceGuide/constants.ts).

## Shared Conventions

- Recent and baseline windows are day-based.
- Entries are deduplicated to the latest value per local day before any calculation.
- Acute signals work off the most recent eligible entry.
- Trend signals compare `recentAverage` against `baselineAverage`.
- Positive score means supportive for performance.
- Negative score means cautionary for performance.
- Reliability scales the effect of a signal but does not change the underlying rule.

## Metric Summary

| Metric | Stored as | Scale | Acute | Trend | Weight |
| --- | --- | --- | --- | --- | --- |
| `bodyweight` | `bodyweight_kg` | decimal | no | yes | `0.80` |
| `waist` | `waist_cm` | decimal | no | yes | `0.55` |
| `sleep` | `sleep_hours` | decimal hours | yes | yes | `1.20` |
| `restingHr` | `resting_hr_bpm` | integer bpm | no | yes | `1.10` |
| `fatigue` | `fatigue_score` | `1..5` | yes | yes | `1.15` |
| `soreness` | `soreness_score` | `1..5` | yes | yes | `0.80` |
| `stress` | `stress_score` | `1..5` | yes | yes | `0.95` |
| `steps` | `steps` | integer steps | yes | yes | `0.65` |

## Bodyweight

Purpose: detect controlled cutting versus aggressive loss.

- Recent window: `14` days
- Baseline window: `28` days
- Trend minimums: `3` recent entries and `6` baseline entries
- Acute support: no
- Max stale days for recency scoring: `21`

Interpretation:

- The engine compares recent average bodyweight to the earlier baseline average.
- It converts that difference to an estimated weekly fractional rate of change.
- Bodyweight does not emit acute same-day signals.

Signals:

- `weight_rapid_drop`
  - negative
  - emitted when weekly change fraction is `<= -0.012`
  - intended meaning: weight is dropping fast enough to be a recovery risk
- `weight_gradual_loss`
  - positive
  - emitted when weekly change fraction is `<= -0.006` but not rapid-drop territory
  - intended meaning: bodyweight is moving down at a more controlled pace

Current nuance:

- There is no explicit positive signal for gaining weight or maintaining weight.
- If bodyweight data is sparse, the metric simply stays silent.

## Waist

Purpose: add body-composition context without over-weighting it.

- Recent window: `21` days
- Baseline window: `42` days
- Trend minimums: `2` recent entries and `4` baseline entries
- Acute support: no
- Max stale days for recency scoring: `30`

Interpretation:

- Waist is trend-only.
- The engine compares recent average waist to baseline average waist.

Signals:

- `waist_reduction_trend`
  - positive
  - emitted when recent average is at least `1.0 cm` below baseline
- `waist_increase_trend`
  - negative
  - emitted when recent average is at least `1.0 cm` above baseline

Current nuance:

- Waist carries a lower metric weight than the core recovery metrics.
- It supports body-composition context but should not dominate the guide by itself unless little else exists.

## Sleep

Purpose: contribute both acute recovery context and short-term sleep trends.

- Recent window: `7` days
- Baseline window: `21` days
- Acute minimums: `1` recent entry and latest entry within `2` days
- Trend minimums: `3` recent entries and `7` baseline entries
- Max stale days for recency scoring: `7`

Acute thresholds:

- very poor: `<= 5.25` hours
- poor: `<= 6.25` hours
- good: `>= 8.0` hours

Trend thresholds:

- below baseline: `<= -0.75` hours
- above baseline: `>= 0.75` hours

Signals:

- `sleep_very_poor_last_night`
  - negative
  - strong acute flag for a very low latest sleep value
- `sleep_poor_last_night`
  - negative
  - softer acute caution than the very-poor rule
- `sleep_good_last_night`
  - positive
  - acute support signal for clearly solid sleep
- `sleep_below_baseline`
  - negative
  - emitted when recent average sleep is materially below baseline
- `sleep_above_baseline`
  - positive
  - emitted when recent average sleep is materially above baseline

Current nuance:

- Sleep is one of the heaviest metrics in the engine.
- A single recent sleep entry can still influence the guide acutely even when trend history is unavailable.

## Resting HR

Purpose: provide a physiological recovery trend anchor.

- Recent window: `7` days
- Baseline window: `21` days
- Trend minimums: `3` recent entries and `7` baseline entries
- Acute support: no
- Max stale days for recency scoring: `7`

Thresholds:

- elevated versus baseline: `>= +5 bpm`
- favorable versus baseline: `<= -4 bpm`

Signals:

- `rhr_elevated_vs_baseline`
  - negative
  - emitted when the latest resting HR is meaningfully above baseline average
- `rhr_favorable_vs_baseline`
  - positive
  - emitted when the latest resting HR is meaningfully below baseline average

Current nuance:

- The rule uses the latest reading against baseline average rather than recent average against baseline average.
- There is no acute-without-baseline path for resting HR.

## Fatigue

Purpose: replace the old readiness concept with a subjective fatigue marker that works both acutely and as a trend.

- Stored field: `fatigue_score`
- Scale: `1..5`
- Recent window: `7` days
- Baseline window: `21` days
- Acute minimums: `1` recent entry and latest entry within `2` days
- Trend minimums: `3` recent entries and `6` baseline entries
- Max stale days for recency scoring: `7`

Score thresholds:

- low: `<= 2`
- high: `>= 4`
- very high: `>= 5`
- trend delta: `0.75`

Signals:

- `fatigue_very_high_today`
  - negative
  - strongest acute fatigue warning
- `fatigue_high_today`
  - negative
  - acute elevated-fatigue caution
- `fatigue_low_today`
  - positive
  - acute support signal for low fatigue
- `fatigue_high_trend`
  - negative
  - emitted when recent fatigue average is `>= 0.75` points above baseline
- `fatigue_easing_trend`
  - positive
  - emitted when recent fatigue average is `>= 0.75` points below baseline

Current nuance:

- Fatigue is now the app-owned subjective recovery score.
- It fills the role that the generic plan had assigned to `readiness`, but with inverse semantics:
  - lower fatigue is good
  - higher fatigue is bad

## Soreness

Purpose: capture whether muscular soreness is likely to interfere with performance.

- Scale: `1..5`
- Recent window: `7` days
- Baseline window: `21` days
- Acute minimums: `1` recent entry and latest entry within `2` days
- Trend minimums: `3` recent entries and `6` baseline entries
- Max stale days for recency scoring: `7`

Score thresholds:

- low: `<= 2`
- high: `>= 4`
- trend delta: `0.75`

Signals:

- `soreness_high_today`
  - negative
  - emitted when latest soreness is high
- `soreness_low_today`
  - positive
  - emitted when latest soreness is low
- `soreness_high_trend`
  - negative
  - emitted when recent soreness is `>= 0.75` points above baseline

Current nuance:

- There is currently no `soreness_easing_trend` positive signal.
- Soreness can help push a result toward caution, but it is weighted below sleep, fatigue, and resting HR.

## Stress

Purpose: capture non-training recovery strain that may explain performance drift.

- Scale: `1..5`
- Recent window: `7` days
- Baseline window: `21` days
- Acute minimums: `1` recent entry and latest entry within `2` days
- Trend minimums: `3` recent entries and `6` baseline entries
- Max stale days for recency scoring: `7`

Score thresholds:

- low: `<= 2`
- high: `>= 4`
- trend delta: `0.75`

Signals:

- `stress_high_today`
  - negative
  - emitted when latest stress is high
- `stress_low_today`
  - positive
  - emitted when latest stress is low
- `stress_high_trend`
  - negative
  - emitted when recent stress is `>= 0.75` points above baseline
- `stress_easing_trend`
  - positive
  - emitted when recent stress is `>= 0.75` points below baseline

Current nuance:

- Stress supports acute interpretation without baseline history.
- It is also one of the recovery metrics used in missing-data note generation.

## Steps

Purpose: treat unusually high activity load as a possible recovery drag, especially during cutting phases or busy days.

- Scale: whole-number daily steps
- Recent window: `7` days
- Baseline window: `21` days
- Acute minimums: `1` recent entry and latest entry within `2` days
- Trend minimums: `4` recent entries and `8` baseline entries
- Max stale days for recency scoring: `7`

Acute thresholds:

- absolute high day: `>= 18,000`
- spike day relative to baseline: `>= 1.4x` baseline average

Trend thresholds:

- elevated recent ratio: `>= 1.25x`
- elevated absolute delta: `>= 2,500` steps

Signals:

- `steps_high_today`
  - negative
  - emitted when today's steps are unusually high in absolute or relative terms
- `steps_high_trend`
  - negative
  - emitted when recent average steps are clearly above baseline in both ratio and absolute terms

Current nuance:

- Steps currently only produce cautionary signals.
- There is no positive low-steps or recovery-walk signal.

## Pattern Rules

Pattern rules run after the base metric signals are created.

### Aggressive Cut Warning

Signal ID: `aggressive_cut_warning`

Requirements:

- `weight_rapid_drop` exists
- at least one negative recovery-strain signal exists from `sleep`, `restingHr`, `fatigue`, `soreness`, or `stress`

Meaning:

- rapid bodyweight loss is stacking with recovery strain

### Acute Poor Recovery Day

Signal ID: `acute_poor_recovery_day`

Requirements:

- `sleep_very_poor_last_night` exists
- at least one of these exists:
  - `stress_high_today`
  - `fatigue_high_today`
  - `fatigue_very_high_today`

Meaning:

- very poor sleep is aligning with same-day strain markers

### Primed For Performance

Signal ID: `primed_for_performance`

Requirements:

- positive sleep signal:
  - `sleep_good_last_night` or `sleep_above_baseline`
- priming partner:
  - `fatigue_low_today` or `rhr_favorable_vs_baseline`
- no strong negative signals with absolute score `>= 0.7`
- `sleep` still has recent data

Meaning:

- sleep plus recovery state look supportive for better performance

### Narrow Data Warning

Signal ID: `narrow_data_warning`

Requirements:

- aggregate is based mostly on one metric
- dominant share is at least `0.68`
- at most two metrics contributed meaningful influence

Meaning:

- a usable result exists, but the evidence is narrow and confidence should be interpreted conservatively

This pattern has a neutral score and zero weight. It exists only to explain the state of the data, not to change the zone.

## Missing-Data Notes

The engine adds concise notes when:

- there are no usable recent recovery metrics at all
- core recovery metrics have recent data but not enough density for trend analysis
- core recovery metrics are stale
- the result is based mostly on one metric

The current core-recovery note set focuses on:

- `sleep`
- `restingHr`
- `fatigue`
- `stress`
- `soreness`

## Tuning Guidance

If a future change is needed, prefer these edits in order:

1. Tune thresholds in `constants.ts`.
2. Re-run the scenario tests.
3. Only then change signal formulas or pattern logic.

That keeps the engine explainable and avoids burying policy inside many small files.
