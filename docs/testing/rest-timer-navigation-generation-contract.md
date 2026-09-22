# MVP-006B2E durable timer navigation generation

Organiser contract, 2026-09-22, following independent MVP-006B6 source audit.
This is a prerequisite for lifecycle integration, not for the connection-free
replacement engine. The existing timer retirement prerequisite remains accepted
for alarms/notifications; it did not prove initial-URL or reused-ID containment.

## Concrete defect

Native countdown/completion taps are plain Android ACTION_VIEW URLs. They are not
proven Expo NotificationResponse events. Completion removes its registry row
before posting, so an active-timer lookup cannot validate legitimate later taps.
An old Activity intent can survive restore acknowledgement, outcome deletion and
JS/process recreation. Process-local quarantine then cannot distinguish it from
a valid completion tap whose exercise ID was reused. Blocking all timer URLs would
break normal behavior. Clearing Activity intent alone has no task-recreation proof.

## Frozen interface and behavior

Extend `lib/native/restTimerNotifications.ts` with a synchronous facade:

```ts
type RestTimerNavigationGeneration =
  | { status: "available"; generation: string | null }
  | { status: "unreadable"; code: string }
  | { status: "unavailable" };
function getRestTimerNavigationGeneration(): RestTimerNavigationGeneration;
```

`generation: null` means physically absent generation state before any rotation;
it is the only legacy mode. A non-null generation must match a versioned canonical
UUID format `timer-nav-v1:<lowercase UUID-v4>`. Invalid acknowledgements, missing
methods and malformed/unreadable persistence must never become legacy mode. The
native method is a blocking synchronous read, using the already proven RN bridge.

Use a separate fixed app-private `rest-timer-registry/navigation-generation.json`
record with version 1 and the generation. Strict bounded UTF-8/JSON, exact fields,
regular-file/path-state checks, AtomicFile recovery verification and readback must
match the accepted registry/control discipline. Reuse the existing registry
persistence primitives where practical; any internal filename parameter accepts
only the two compiled names. Do not add a generic external path/write API or
weaken existing registry semantics. Never delete the generation on empty registry,
timer cancellation, completion, ordinary cleanup, or bulk retirement.

Inside the manager's existing operation lock, bulk restore retirement first
publishes and verifies a newly generated value, then performs the existing strict
alarm/registry/process/display retirement. Any failure rejects the existing
retirement promise; consequently lifecycle must not publish a restore manifest.
A retry rotates again, which is safe because scheduling has not succeeded. A
failed/uncertain publication cannot be treated as legacy or successful retirement.

Every newly built countdown and completion ACTION_VIEW URI captures the current
durable generation as `navigationGeneration`; omit it only in true legacy mode.
Read and build under the same operation lock as retirement. Existing registry
identity/receiver checks must still prevent old deliveries from recreating links
after successful retirement. Do not retag an already-created stale URL. If capture
at intent construction cannot prove this ordering, report the gap rather than
silently change the persisted timer format. A valid current-generation completion
link remains verifiable after its registry row is removed and after process death.

Future `+native-intent` policy compares the captured URL field with this native
value. Missing URL generation is accepted only when native generation is null;
exact matching non-null values are accepted; stale/malformed/unavailable states
fail closed for timer navigation. This ticket does not implement that router
consumer, an Activity change, or any DB/lifecycle/UI code.

## Scope, reuse and checks

Reuse installed Android `AtomicFile`, Gson strict parsing and `UUID.randomUUID`,
the established manager lock and native package/module. No new dependency or
permissions. Allowed canonical/generated Kotlin: new
`RestTimerNavigationGeneration.kt`, existing `RestTimerRegistry.kt` only for
bounded persistence reuse, `RestTimerNotificationManager.kt`, and
`RestTimerNotificationsModule.kt`. Canonical files live under
`scripts/android-rest-timer-native/`, generated files under
`android/app/src/main/java/com/anonymous/LiftingLog/notifications/`.
Also allowed: the JS adapter above, sync/verifier file lists, existing focused
rest-timer adapter/config tests, a new focused native-generation adapter test,
`RestTimerRetirementTest.kt` only for affected regression expectations, new
`RestTimerNavigationGenerationTest.kt`, and implementation notes
`docs/testing/rest-timer-navigation-generation.md`.

No MainActivity, MainApplication, manifest, Gradle, dependency, root/router,
engine, shared restore contract or timerStore changes. No worker merge or push.

Test actual production parsing/persistence/manager generation policy: legacy
absence, repeated read, current value after process-object recreation, rotation
with empty registry, stale vs current/missing links, completion after registry
removal, repeated retirement, malformed state, inaccessible paths, associated
AtomicFile recovery faults and failed readback. Prove persistence failure prevents
successful retirement. Facade tests validate every acknowledgement and unsupported
runtime. Preserve all existing timer tests and template parity. Run focused Jest
in both profiles, TypeScript, lint, sync/verifiers, focused JVM tests and
compileDebugKotlin. Independent specialist review is mandatory before merge;
actual Android link/rotation/process-recreation proof follows separately.
