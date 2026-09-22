# Replacement restore startup lifecycle implementation evidence

MVP-006B6 implements the startup and durable timer-navigation boundary frozen in
`replacement-restore-lifecycle-packet.md`.

## Startup ownership

`lib/db/connection.ts` is import-inert and exposes typed live bindings.
`lib/db/replacementRestoreLifecycle.ts` privately opens one SQLite handle, catches
connection PRAGMAs and all startup stages, applies the accepted restore engine,
bootstraps, constructs Drizzle, and publishes both bindings atomically before its
stable external-store snapshot becomes ready. The root gate wraps the theme and
unit providers plus the Router subtree, so settings and other ordinary queries
cannot run against pre-restore bindings.

The facade serializes matching startup actions. Cancel/discard receipts retain
their original authorization for reload-only retries. Media scan/skip and
acknowledgement keep normal use blocked until the matching transition. Lifecycle
failures publish no actions and never fabricate an engine error.

Scheduling synchronously quarantines timer navigation, then drains JS timers,
retires native timer artifacts and rotates their generation, clears the retained
Expo response, and invokes the scheduler. A pre-publication failure discards the
prepared token. Normal use resumes only after successful timer cleanup and proven
physical absence of both pending and outcome controls; cleanup or uncertain
control state remains blocked. Missing native identity or controls is reported as
`native_unavailable`, including while startup is blocked.

## Navigation ownership

`app/+native-intent.ts` is the installed Expo Router `redirectSystemPath` entry.
It shares the lifecycle singleton with the root, waits for an initial timer-like
startup decision, and admits timer navigation only from ready. The independent
guard accepts canonical current-generation URLs, permits legacy URLs only while
the durable generation is physically null, and fails closed for stale, missing,
duplicated, malformed, unavailable, unreadable, or quarantined timer markers.
This includes encoded malformed marker keys, blank timer IDs, and nonpositive end
times. Ordinary links such as `source=share` pass through unchanged.

Expo notification responses remain separate from native `ACTION_VIEW` handling.
Every delayed continuation rechecks the quarantine epoch and durable generation.
The retained-response epoch is captured before the asynchronous response read,
so a response requested before a quarantine cannot acquire the later epoch after
a safe scheduling failure.

## Automated evidence

- `replacementRestoreLifecycle.test.ts` covers one-handle ordering, stable
  snapshots, atomic publication, infrastructure failures, action ownership and
  serialization, media transitions, controls-only retries, retained reload
  receipts, scheduling order, safe reactivation, cleanup failure, unsupported
  platforms, and native availability precedence.
- `replacement-restore-root.test.tsx` imports the actual root, lifecycle,
  connection, providers, and settings query path. It covers ready, precommit,
  postcommit, committed, committed-control, engine-failure, and retained-response
  states while proving provider work stays behind the gate and restored settings
  are read from the first published binding.
- `replacement-restore-native-intent.test.tsx` uses the installed Expo Router
  initial and warm-link subscriptions with the real native-intent and lifecycle
  modules. The Jest Router preset supplies a host iOS `Platform.OS`; the suite
  explicitly selects Android guard behavior for durable-generation validation.
  It therefore proves Router hook integration and navigation policy, while the
  actual-root and lifecycle suites prove Android startup ordering. It does not
  claim native-process runtime evidence.
- `restTimerNavigationGuard.test.ts` covers installed absolute/relative forms,
  legacy/current/stale generation, malformed and encoded markers, notification
  payload validation, quarantine epochs, and non-Android ordinary behavior.

Both `full` and `mvp` release profiles run the seven targeted suites and complete
Jest projects. TypeScript, uncached ESLint, and `git diff --check` are also required
for the immutable candidate. Real Android process death, retained intent, and
Settings-flow evidence remains the organiser-owned runtime acceptance step.
