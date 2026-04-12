# Performance Guide

This folder documents the repo-specific `performanceGuide` engine that lives under [lib/userMetrics/performanceGuide](../../lib/userMetrics/performanceGuide).

The guide is a deterministic, rule-based readiness/performance classifier. It does not query the database directly. Instead, it consumes prepared metric entries, generates inspectable signals, combines them into a normalized score, computes confidence separately, and returns short human-readable reasons plus missing-data notes.

## Repo Fit

The original implementation plan was adapted to this repo's actual user-metrics system.

- Engine location: `lib/userMetrics/performanceGuide/`
- Database source of truth for metric history: `user_checkins`
- App-facing metric keys: `bodyweight`, `waist`, `sleep`, `restingHr`, `fatigue`, `soreness`, `stress`, `steps`
- Deprecated metric removed from persistence: `readiness`
- Persisted fatigue column: `user_checkins.fatigue_score`

This repo does not store a separate `sleepQuality` or `readiness` metric in the current user-metrics flow, so the engine uses the real schema instead of the generic prompt's metric list.

## Relevant Files

- [lib/userMetrics/performanceGuide/types.ts](../../lib/userMetrics/performanceGuide/types.ts)
- [lib/userMetrics/performanceGuide/constants.ts](../../lib/userMetrics/performanceGuide/constants.ts)
- [lib/userMetrics/performanceGuide/baselines.ts](../../lib/userMetrics/performanceGuide/baselines.ts)
- [lib/userMetrics/performanceGuide/availability.ts](../../lib/userMetrics/performanceGuide/availability.ts)
- [lib/userMetrics/performanceGuide/aggregate.ts](../../lib/userMetrics/performanceGuide/aggregate.ts)
- [lib/userMetrics/performanceGuide/patterns.ts](../../lib/userMetrics/performanceGuide/patterns.ts)
- [lib/userMetrics/performanceGuide/explain.ts](../../lib/userMetrics/performanceGuide/explain.ts)
- [lib/userMetrics/performanceGuide/performanceGuideEngine.ts](../../lib/userMetrics/performanceGuide/performanceGuideEngine.ts)
- [lib/userMetrics/performanceGuide/fromCheckins.ts](../../lib/userMetrics/performanceGuide/fromCheckins.ts)
- [lib/userMetrics/definitions.ts](../../lib/userMetrics/definitions.ts)
- [lib/db/schema.ts](../../lib/db/schema.ts)
- [lib/db/bootstrap.ts](../../lib/db/bootstrap.ts)

## Data Model

The engine uses the app's existing user-metric entries. Each entry is represented as a `MetricEntry` with:

- `metric`
- `recordedAt`
- `value`
- optional `sleepStartAt`
- optional `sleepEndAt`
- optional `note`
- optional `context`
- optional `source`

The guide itself is pure. The normal integration path is:

1. Read `UserCheckin[]` from the existing DB access layer.
2. Convert them with `buildPerformanceGuideInputFromCheckins`.
3. Call `buildPerformanceGuide(input, { now })` or `buildPerformanceGuideFromCheckins(checkins, { now })`.

## Fatigue Replacement

The user-metrics domain now treats `fatigue` as the subjective recovery score in both the app layer and the app-owned schema.

- `lib/db/schema.ts` defines `fatigueScore: integer("fatigue_score")`
- `lib/db/userCheckins.ts` reads and writes `fatigue_score`
- `lib/userMetrics/definitions.ts` exposes the metric key `fatigue`
- the user-metric route and formatting helpers now use `fatigue`

`lib/db/bootstrap.ts` also contains a startup repair path for older local/dev tables that still contain `readiness_score`.

- If `user_checkins` already has `fatigue_score` and no `readiness_score`, nothing happens.
- If the table still contains `readiness_score`, the table is rebuilt to the new schema.
- Existing readiness values are intentionally discarded.
- Other `user_checkins` data is preserved where practical.

No compatibility path is kept for readiness-based backups. Backups and imports now target the fatigue-only schema.

## Pipeline

The engine follows the same high-level sequence every time:

1. Normalize metric entries.
2. Compute per-metric recent windows and baselines.
3. Compute per-metric availability.
4. Generate base metric signals.
5. Generate cross-metric pattern signals.
6. Aggregate weighted signals into a normalized score.
7. Compute confidence separately from score.
8. Assign a performance zone.
9. Build summary text, reasons, and missing-data notes.

### 1. Normalization

Normalization is implemented in `baselines.ts`.

- Entries are grouped by metric.
- Multiple entries for the same metric on the same local day are deduplicated.
- The latest entry on that local day wins.
- Invalid numbers are ignored.
- Local-day grouping uses `Date` plus `setHours(0, 0, 0, 0)`.

This matters because the app stores millisecond timestamps, but the guide interprets day-level recovery state rather than intra-day fluctuations.

### 2. Recent Windows And Baselines

For each metric, the engine builds:

- `entries`
- `latestEntry`
- `recentEntries`
- `baselineEntries`
- `recentAverage`
- `baselineAverage`
- min/max range values for both windows

The recent and baseline window sizes are metric-specific and live in `constants.ts`. The recent window is the current interpretation window. The baseline window is the comparison period immediately before that recent window.

### 3. Availability

Availability is computed per metric in `availability.ts`.

Each metric gets:

- `hasAnyData`
- `hasRecentData`
- `recentCount`
- `baselineCount`
- `daysSinceLastEntry`
- `acuteEligible`
- `trendEligible`
- `latestEntry`

Important behavior:

- Missing metrics do not penalize score directly.
- A metric can contribute acute signals without a historical baseline if its rules allow that.
- Trend signals require both recent density and enough baseline history.
- Stale metrics can exist without contributing to the current result.

### 4. Signal Generation

Each metric-specific signal builder returns zero or more signals. Every signal includes:

- `id`
- `metric`
- `kind`
- `polarity`
- `score`
- `magnitude`
- `reliability`
- `metricWeight`
- `weightedScore`
- `reason`
- optional `evidence`

The engine keeps the raw signal list in the final result so callers can inspect exactly why a zone was assigned.

See [metric-rules.md](./metric-rules.md) for the per-metric rules and current signal IDs.

### 5. Pattern Signals

After base signals are generated, the engine applies cross-metric pattern rules:

- `aggressive_cut_warning`
- `acute_poor_recovery_day`
- `primed_for_performance`
- `narrow_data_warning`

Patterns are implemented in `patterns.ts` and behave like additional signals during aggregation, except they can span multiple metrics.

### 6. Aggregation

Aggregation is implemented in `aggregate.ts`.

The guide does not simply sum raw scores. Instead it uses:

- `totalWeightedScore = sum(weightedScore)`
- `availableInfluence = sum(abs(score) * reliability * weight)`
- `normalizedScore = totalWeightedScore / availableInfluence` when influence is positive

This means:

- strong but unreliable signals get discounted
- high-weight metrics matter more
- missing metrics do not create artificial negatives
- the final score stays normalized instead of drifting with signal count alone

The aggregate step also computes:

- `contributionByMetric`
- `contributingMetrics`
- `dominantMetrics`
- `dominantShare`
- `basedMostlyOnSingleMetric`

The current narrow-data threshold is a dominant-share of at least `0.68` with at most two contributing metrics.

### 7. Confidence

Confidence is computed separately from the performance score. A user can get a positive or negative zone with low confidence if the guide is running on narrow or stale data.

Current confidence inputs:

- metric coverage across all supported metrics
- weighted average reliability of contributing signals and patterns
- recency of contributing metrics
- coverage of core recovery metrics
- small breadth adjustment based on how many metrics contributed
- dominance penalty when the guide is based mostly on one metric

Core metrics are:

- `sleep`
- `restingHr`
- `fatigue`
- `soreness`
- `stress`

Confidence labels:

- `high` for confidence `>= 0.72`
- `medium` for confidence `>= 0.45`
- `low` below that
- `insufficient` when no usable signals exist

### 8. Zone Assignment

Zones are derived from `normalizedScore` using tunable constants:

- `peak`: `>= 0.65`
- `ready`: `>= 0.25`
- `stable`: `>= -0.20`
- `caution`: `>= -0.55`
- `compromised`: below `-0.55`

If no usable signals exist, the guide returns:

- `zone: null`
- `normalizedScore: null`
- `confidence: 0`
- `confidenceLabel: "insufficient"`

### 9. Explanations

`explain.ts` builds three kinds of human-readable output:

- `summary`
- `reasons`
- `missingDataNotes`

Rules:

- Reasons are taken from the highest-impact signals and patterns.
- Reasons are deduplicated by message text.
- Missing-data notes are concise and intentionally limited.
- Weak trend coverage and stale data are called out explicitly for core recovery metrics.
- Narrow-data dominance is called out explicitly when one metric is doing most of the work.

## Reliability Model

Reliability is signal-level and metric-specific.

- Acute reliability uses recency plus recent-window density.
- Trend reliability uses recency plus both recent density and baseline density.
- If a metric is not eligible for the relevant signal type, reliability is `0`.

Current formulas:

- acute: `recency * 0.55 + density * 0.45`
- trend: `recency * 0.30 + recentDensity * 0.35 + baselineDensity * 0.35`

All reliability values are clamped to the `0..1` range.

## Sparse Data Behavior

The guide is designed to degrade gracefully when data coverage is incomplete.

- Missing metrics do not count against the user.
- Acute signals can still fire from a single recent entry for supported metrics.
- Trend signals do nothing until recent and baseline counts are sufficient.
- One metric can dominate the result when it is the only useful metric.
- When that happens, confidence drops and the guide adds a narrow-data explanation.

This is intentional. The engine prefers a weakly confident, inspectable answer over inventing certainty from missing information.

## Current Metrics

Supported metrics in this repo:

- `bodyweight`
- `waist`
- `sleep`
- `restingHr`
- `fatigue`
- `soreness`
- `stress`
- `steps`

See [metric-rules.md](./metric-rules.md) for the metric-by-metric rule set.

## Tests

Core scenario coverage lives in:

- [__tests__/lib/performanceGuideEngine.test.ts](../../__tests__/lib/performanceGuideEngine.test.ts)
- [__tests__/lib/userMetricsDefinitions.test.ts](../../__tests__/lib/userMetricsDefinitions.test.ts)
- [__tests__/db/userCheckins.test.ts](../../__tests__/db/userCheckins.test.ts)
- [__tests__/db/bootstrap.test.ts](../../__tests__/db/bootstrap.test.ts)

The tests cover:

- no data
- controlled bodyweight loss
- rapid bodyweight drop
- acute poor recovery from sleep plus stress
- broad positive data
- conflicting signals
- stale data lowering confidence
- narrow-data explanations
- fatigue rename behavior across definitions, DB mapping, and bootstrap repair

## Notes For Future Changes

- Keep thresholds and weights in `constants.ts`. Do not bury tuning knobs inside individual signal builders.
- If a new metric is added, update `UserMetricKey`, `METRIC_TYPES`, `METRIC_RULES`, the adapter in `fromCheckins.ts`, and the tests together.
- If the meaning or scale of a metric changes, revisit both signal thresholds and existing explanation text.
- `ReadinessSignal` is still the internal signal type name. That is a generic engine payload name, not the old deprecated `readiness` metric.
