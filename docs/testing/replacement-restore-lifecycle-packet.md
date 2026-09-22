# MVP-006B6 startup and navigation integration packet

Organiser-frozen dispatch packet, 2026-09-22. The complete media service is
accepted and integrated as `2c45567`, and the required Android engine gate is
accepted in `replacement-restore-engine-android.md`. Native timer generation,
JS quiescence and the B6A lifecycle-failure contract are also accepted. These
prerequisites do not replace this ticket's actual Router and startup proof.

Independent Sol/high packet review found required corrections before dispatch:
a typed lifecycle failure state and gate treatment, atomic binding publication,
initial-intent startup waiting, malformed timer URL classification, timer
reactivation after safe schedule failure, retained Expo response ownership and
reload-only retries. The follow-up review accepted the separate
[B6A contract](replacement-restore-lifecycle-failure-packet.md) and the delivery
policy below. The organiser pins the final base SHA and isolated worktree in the
worker message; the exact file/test scope below is frozen for implementation.

## Objective and scope

Implement the exact `ReplacementRestoreLifecycleFacade` in the shared contract,
wire the accepted standalone gate outside every ordinary provider, and prevent
old timer intents from reaching IDs reused by restore. Use one actual live SQLite
handle and the accepted production engine; no fake DB or fallback-success engine.

Exclusive production scope: `lib/db/connection.ts`, new
`lib/db/replacementRestoreLifecycle.ts`, `app/_layout.tsx`, new
`app/+native-intent.ts`, new `lib/restTimerNavigationGuard.ts`, and
`lib/notificationHandler.ts`. Consume the existing gate view without rewriting
its rendering. Exact test scope: new
`__tests__/db/replacementRestoreLifecycle.test.ts`,
`__tests__/app/replacement-restore-root.test.tsx`,
`__tests__/routing/replacement-restore-native-intent.test.tsx`, and
`__tests__/lib/restTimerNavigationGuard.test.ts`; bounded affected mocks/assertions
in `__tests__/helpers/profileRouteSetup.ts`,
`__tests__/routing/profile-route-guards.test.tsx`, and
`__tests__/app/timer-readiness.test.tsx`. `jest.config.js` and
`jest.router.config.js` may change only to assign the new actual-Router suite to
the existing router project and exclude it from the unit project; no weakening
of transforms, assertions or existing suite discovery. The existing profile
tests may mock a stable ready lifecycle; new actual-root/import tests must not
mock away the lifecycle or its ordering. Update `docs/db-access-patterns.md`
only for connection versus lifecycle responsibilities and add implementation
evidence to `docs/testing/replacement-restore-lifecycle.md`. Base SHA is pinned
at dispatch. No engine, shared types, schema/bootstrap, domain query,
timerStore, native, Settings, package or configuration changes. Raise any required
contract expansion before implementation; the two exact Jest routing changes
above are the only configuration exception.

Read AGENTS.md, DB truth/access patterns, product facts sections 10-11, the accepted
restore ADR, shared/startup contracts, lifecycle review and native generation
contract. Inspect actual root/providers/query imports, connection/bootstrap,
timerStore quiescence, native retirement/generation, notification response code,
gate view and installed Expo Router initial/warm native-intent implementation.
Use graph discovery first and verify current exact source when graph is stale.

## Frozen ordering and ownership

1. Keep `connection.ts` thin. Ordinary query-module imports must not bootstrap or
   query the DB. The lifecycle owns opening one real handle and applying PRAGMAs
   inside a caught startup boundary, then invokes the synchronous engine before
   ordinary bootstrap, Drizzle construction, providers, routing, seeding,
   permissions/channels or timer activation. Preserve typed live `sqlite`/`db`
   exports for existing consumers, initialized only with real objects. Catch open,
   PRAGMA, engine, bootstrap and Drizzle-construction failures; do not throw an
   unhandled module-import exception or release uninitialized bindings. Keep the
   opened handle private until bootstrap and Drizzle construction both succeed,
   then publish both live bindings synchronously before publishing readiness.
   No partial export publication or second handle on retries. Infrastructure
   failures use the separately reviewed lifecycle blocker, not a fabricated
   restore-engine failure or an unsupported engine error code. Such blockers
   publish no allowed actions and reject every startup action. Stage alone never
   determines data-change state: partial bootstrap is unknown, while a known
   prior restore commit stays changed even if bootstrap subsequently fails.
2. Root and `+native-intent` share one lifecycle singleton, including when route
   modules are evaluated first. Repeated imports/getters must not repeat startup
   replacement. Stable external-store snapshots change identity only on a real
   transition and notify listeners synchronously. The gate wraps ThemeProvider,
   UnitPreferenceProvider, ordinary RootLayoutContent and Router.
3. With proven no pending/incomplete outcome, initialize bindings then publish
   ready. Commit with pending retired, or outcome-only incomplete state, permits
   bootstrap/bindings but keeps normal children unmounted in postcommit. Explicit
   scan or skip calls the complete media service and publishes the actual restored
   result. Only matching acknowledgement releases ready, without another DB or
   control mutation. Persisted complete leftovers follow accepted engine behavior.
4. Revalidate each action against current snapshot/restore ID; serialize actions.
   Cancel/discard uses only the matching engine method and then a controlled JS
   reload before releasing any old binding. Installed Expo exports `reloadAppAsync`;
   inspect/reuse it rather than a developer-only restart trick. A reload is never
   evidence of a new native process for replacement. Failed, missing-callable and
   resolved-but-no-op reloads leave the current JS instance blocked. After a
   successful cancel/discard and verified pending retirement, retain an internal
   receipt keyed by action and restore ID (and original discard authorization).
   Repeating that matching action retries only reload, never engine cancellation
   on absent pending or a consumed discard token. A reload promise resolving is
   never permission to release old bindings locally.
   Committed-control retry calls only `resumeCommittedStartupFinalization`, then
   the normal postcommit path; never rerun the startup replacement transaction.
5. Scheduling is allowed only from ready. Synchronously quarantine external/timer
   navigation before the first await, drain `timerStore.quiesceForReplacementRestore`,
   then await native bulk retirement. Failure to retire never calls the scheduler.
   Native generation rotation precedes scheduling. After durable/possibly durable
   publication, publish blocked before the wrapper promise resolves or rejects.
   The timer cleanup promise alone is not publication evidence.
6. A schedule failure/abort may return to normal use only after positive physical
   pending absence is established. The lifecycle may read the native pending
   presence facade, but must not parse/rewrite manifests or invoke startup apply
   as a read-only presence probe while providers are mounted. Unavailable/unreadable
   state remains blocked. Use `readRestoreControlRecord("pending")`; only `absent`
   is proof, and preserve/revalidate outcome absence as well. After successful
   quiescence and safe scheduling failure, explicitly reactivate timerStore once
   its cleanup promise has settled, before normal use resumes. Previously stopped
   timers are not reconstructed. Failed cleanup keeps a truthful lifecycle blocker
   with close/reopen guidance; it cannot publish ready while `cleanupFailed`
   silently prevents activation. Return truthful failure information for the
   existing dialog/Settings owner.
7. Android with missing native controls/identity fails closed where pending
   absence cannot be established. Restore is unavailable on other platforms;
   preserve their ordinary startup with a distinct unsupported-platform branch,
   not a fabricated successful Android control read or implemented iOS restore.
   iOS runtime acceptance remains explicitly deferred; both profiles compile.

## Durable timer navigation

Use installed Expo Router `redirectSystemPath({ path, initial })` for both initial
and warm native ACTION_VIEW URLs. The guard module must not import Expo Router or
the lifecycle back into a cycle. Native manager URLs have the form
`liftinglog://exercise/<id>?tab=record&source=notification&timerId=...&endAt=...`
with `navigationGeneration` present after rotation. Validate actual library input
forms in tests, including route-relative forms if the installed path permits them.

The lifecycle starts independently of React when the native-intent entry accesses
it. Timer-like initial URLs received during `starting` await a stable startup
decision using subscription plus recheck so no transition is missed. Only `ready`
may then proceed to generation validation; blocked/postcommit/restored returns
the safe route. Do not discard every valid cold timer tap merely because startup
was still beginning, or retain a stale target behind the gate for later delivery.

Classify timer-like exercise URLs before validating them: any reserved timer
marker (`source=notification`, `timerId`, `endAt`, `navigationGeneration`) makes
the URL subject to the timer guard. Validate the exact exercise route and singular
canonical required fields. Missing, malformed or duplicate reserved fields cannot
fall through as unrelated navigation. Normalize the installed absolute/relative
forms, compare decoded generation exactly and catch parser/native-read failures.

For timer navigation: quarantine blocks; available native generation null permits
only legacy missing-generation links; a non-null generation requires one exact
canonical matching URL value. Stale, missing-after-rotation, malformed, duplicate,
unavailable and unreadable generation states fail closed. Check generation at
delivery, not only module initialization. Do not use active timer membership:
completion legitimately removes its registry row before a later tap. Do not block
all timer URLs or retag an old intent with the current generation. Preserve normal
other links and valid current completion links. Rejected links go to a stable safe
route without rendering the exercise, including after acknowledgement/reload/death.

Keep Expo NotificationResponse handling distinct from native ACTION_VIEW. Quarantine
must cancel/suppress pending response continuations and prevent retained responses
from navigating after readiness returns. Clearing a last Expo response cannot
stand in for native-intent interception. Preserve current ordinary notification
behavior and the existing deferred-feature capability guards. No MainActivity edit.
Before pending publication, quarantine must invalidate queued Expo continuations
and clear the retained Expo response after timer retirement. Failure to clear
prevents scheduling or uses the proven-absence safe failure path. The durable
identity policy for Android Expo responses is checked again at delivery, including
every delayed continuation: available null generation permits the existing legacy
payload; available non-null generation rejects generation-less Expo responses;
unreadable or unavailable generation fails closed. Non-Android retains its
ordinary Expo response behavior because replacement restore is unsupported.

This deliberately does not exempt missing-bridge Android builds from the timer
identity check. Those builds cannot prove a retained response's relationship to
restored IDs. Normal module-present Android countdown/completion taps use native
ACTION_VIEW with generation. Exact source confirms the Expo fallback occurs only
when the native module is absent; a native-call rejection is caught without
fallback. Therefore no valid current module-present Android tap is lost. Any
future module-present Expo fallback must capture and validate durable generation
in its payload before becoming navigable after rotation; no payload or timerStore
expansion is needed in this ticket.

## Required proof before acceptance

- Actual root/provider/query imports in every startup result, not a substitute
  gate: exactly one handle/PRAGMAs and zero forbidden early work; restored settings
  are visible on the first allowed provider mount.
- Stable snapshots, matching action ownership, no concurrent completion, blocked
  publication before scheduling settles, retirement failure before scheduler,
  safe failure only on positive pending absence, controls-only retry, and reload
  without local release of stale/uninitialized bindings.
- Open/PRAGMA/engine/bootstrap/Drizzle failures produce truthful lifecycle snapshots
  with no partial binding publication; successful-quiescence schedule failure
  permits new timers, while cleanup failure never publishes ready. Missing/no-op
  reload and repeated reload-only actions cannot reuse engine authorization.
- Actual installed Router initial URL and warm linking path with native-intent,
  including old reused exercise IDs before/after acknowledgement, JS reload and
  simulated process recreation; current/legacy-valid completion and unrelated URLs
  remain usable. No old delayed Expo response can bypass quarantine.
- Initial timer URLs wait across ready versus blocked startup, and malformed
  reserved-marker URLs cannot evade timer classification. Retained and newly
  delivered old Expo responses remain safe across reload/process recreation.
- Both-profile full tests, TypeScript and uncached lint; independent specialist
  audit of lifecycle/connection/navigation ownership. Actual Android process and
  retained-intent evidence follows source review before this integration gate closes.

Targeted command is `npm.cmd test -- --runInBand --runTestsByPath` with the four
new test paths and the existing profile-route-guards, timer-readiness and
replacement-restore-gate suites. Run it separately with
`EXPO_PUBLIC_RELEASE_PROFILE=full` and `mvp`; then both complete profile suites,
`npm.cmd run typecheck`, uncached `npm.cmd run lint -- --no-cache` and
`git diff --check`. Reuse installed Expo Router's native-intent, Expo reload and
notification-clear APIs; introduce no new library or custom native bridge.

Worker handoff includes exact SHA, files, behavior, exact commands/results,
assumptions and remaining native proof. No merge/push or scope expansion. The
organiser supplies the minimal final packet and pins the accepted media/native base.

## Organiser test-harness scope amendment, 2026-09-22

Independent specialist source review accepts `6ba76a572002019fceb17c9bdd8456555383b7c5`.
Its seven targeted suites pass 86 tests in each profile. The first full-profile
run passes 73/85 suites and 953/1015 tests: twelve existing DB suites depend on
the old connection-import bootstrap side effect. This is not permission to
restore that production side effect or weaken existing assertions.

The same B6 worker may add an explicit bootstrap/Drizzle/publish test helper in
`__tests__/helpers/manualLoggingDatabase.ts` and invoke it in exactly these suites:

- `__tests__/db/exerciseIdentity.test.ts`
- `__tests__/db/exerciseDataIsolation.test.ts`
- `__tests__/db/historyLegacyDates.test.ts`
- `__tests__/db/historyReadModel.test.ts`
- `__tests__/db/inProgressConsumers.test.ts`
- `__tests__/db/manualLoggingLifecycle.test.ts`
- `__tests__/db/pbDerivation.test.ts`
- `__tests__/db/setLookup.test.ts`
- `__tests__/db/setMediaCleanup.test.ts`
- `__tests__/db/setVideoContract.test.ts`
- `__tests__/db/workoutNotes.test.ts`
- `__tests__/lib/templateUnitIdentity.test.ts`

Initialize explicitly after fixture/schema construction in each current Jest
module registry, before query use, including close/reopen resets. Do not add
factory side effects or erase the identity fixture's deliberate legacy shape.
Keep real SQLite, production bootstrap and Drizzle queries; retain every existing
assertion. No production/config changes are authorised by this amendment.
Commit the repair separately, rerun affected suites and both complete profiles,
and submit the exact delta for review before integration. The original failed
full run was terminal-only; final complete runs must retain their logs.
