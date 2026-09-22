# Replacement restore startup integration contract

Organiser decision, 2026-09-22, following independent read-only review of the
startup/import graph and the accepted [ADR](../adr/replacement-restore.md).
Production engine and UI work have not yet been accepted. Native prerequisite
runtime evidence remains a separate gate. The repaired schema manifests were
independently accepted and integrated as `f435567`.

## Readiness and ownership

The engine takes the existing live SQLite handle explicitly. It must not import
`connection.ts`, `db/index.ts`, `backup.ts`, `media.ts`, or `pbEvents.ts`, including
through a barrel. Use the connection-free `pbDerivation.ts`, strict catalog,
streaming hash, and native control facades. The engine owns preparation,
scheduling, synchronous replacement, durable outcomes and controls-only committed
finalization; the lifecycle owner alone decides when normal application code may
mount.

The connection/lifecycle owner opens one live handle, applies connection PRAGMAs,
calls the startup engine, then conditionally runs bootstrap and constructs Drizzle.
An outer gate wraps ThemeProvider, UnitPreferenceProvider, notification hooks,
seed effects and Router. The gate cannot consume their contexts. No gated render
may release an uninitialized connection or binding. Importing query modules alone
must not execute a query, permission prompt, channel initialization or timer effect.

Use a stable external-store snapshot suitable for React `useSyncExternalStore`:

```ts
type DatabaseStartupSnapshot =
  | { phase: "starting"; connectionInitialized: false; canMountApp: false }
  | {
      phase: "blocked";
      connectionInitialized: boolean;
      canMountApp: false;
      blocker: RestoreStartupBlock;
      allowedActions: readonly DatabaseStartupActionKind[];
    }
  | {
      phase: "postcommit";
      connectionInitialized: true;
      canMountApp: false;
      restoreId: string;
      requiresExplicitMediaScan: boolean;
      progress?: RestoreProgress;
    }
  | {
      phase: "restored";
      connectionInitialized: true;
      canMountApp: false;
      result: ReplacementRestoreResult;
    }
  | { phase: "ready"; connectionInitialized: true; canMountApp: true };

type DatabaseStartupActionKind =
  | "cancel_and_reload"
  | "discard_and_reload"
  | "retry_control_finalization"
  | "complete_media"
  | "skip_media"
  | "acknowledge_completion";

getDatabaseStartupSnapshot(): DatabaseStartupSnapshot;
subscribeDatabaseStartup(listener: () => void): () => void;
performDatabaseStartupAction(action: DatabaseStartupAction): Promise<void>;
scheduleReplacementRestoreAndBlock(options): Promise<RestoreScheduled | RestoreCancelled>;
```

The shared contract worker must supply typed action payloads (restore ID and, only
for safe discard, recovery token), the ADR result union for `RestoreStartupBlock`,
and the existing typed scheduling options. These are precise types, not `any` or
untyped callbacks. Cold-close instructions and manual recovery are information,
not pretend programmatic restart actions. The engine validates every state/action
again; button visibility is not authorization. Expose an explicit Android restore
availability result so Settings disables unsupported scheduling, including iOS.

`connectionInitialized` records successful bootstrap/binding construction; it is
true when scheduling closes an already running app's gate, and false for a
startup failure that skipped bootstrap. It must not be confused with permission
to mount normal UI. Snapshots retain identity until a real transition and publish
listeners synchronously. Scheduling must publish blocked state upon durable
publication, before its wrapper promise resolves, including uncertain publication
which cannot safely establish absence. No progress callback runs inside the SQL
transaction.

## Transitions

- Proven absent pending with no incomplete outcome: bootstrap, construct binding,
  then ready. Unavailable storage is not absence.
- Successful commit and pending retirement: bootstrap/binding, then postcommit
  while children remain unmounted, then restored only after completion or explicit
  skip accounts for all unresolved rows. Show the typed final result, including
  unresolved counts and warnings; a matching acknowledgement publishes ready
  without further DB or control-state mutation.
- Absent pending with incomplete outcome: no replacement; bootstrap/binding,
  postcommit, and user-explicit fresh scan or skip. Never replay stored media IDs.
- For postcommit media finalization, `complete_media` invokes
  `completeReplacementRestorePostCommit` with `mode: "scan"`, while
  `skip_media` uses `mode: "skip"`. Both modes operate on a fresh read of the
  current rows after physical pending absence is proven, account for every row,
  and produce an actual result with durable outcome finalization. Skip mode does
  not prompt for permission or invoke the gallery resolver; every row is
  accounted for as unresolved or skipped, and the result never claims that
  committed training was cancelled.
- Pending ambiguity, token failure, uncertain transaction, or committed control
  persistence failure: blocked with only the actions proven safe by that result.
- Safe scheduled cancellation or failed-startup discard: retire pending, then a
  controlled no-pending JS reload before providers. This reload is initialization,
  never evidence of a new native process for replacement retry.
- Same-process committed finalization retry: controls only. After retirement,
  continue the reviewed bootstrap/binding and postcommit path; never call the
  generic transaction coordinator to bypass latest-attempt-token protection.

Before calling the engine scheduler, the lifecycle wrapper synchronously suspends
JS timer activity, drains already-issued native notification operations, completes
known-timer cleanup, and awaits native bulk retirement. No pending manifest may be
published if required retirement fails. A later schedule failure leaves ephemeral
rest timers stopped; Settings must state this without claiming training data was
changed. Restore confirmation includes that timers and app notifications are
cleared as part of scheduling.

The startup result must carry a trusted restore ID when one exists. Corrupt
physical state may have no trustworthy ID. A generic restart result reports
`liveDatabaseChanged: false | true | "unknown"` honestly; prior attempting state
does not prove unchanged data.

## Worker boundaries and acceptance

1. Shared contract: `lib/db/replacementRestoreContract.ts`, dependency-free except
   type-only imports. Define the revised ADR results, error and facade types before
   dispatching consumers; no implementation stubs or successful placeholder paths.
2. Engine: `lib/db/replacementRestore.ts` and narrowly named connection-free helper
   modules, production-service DB tests and fixtures. No root, Settings, connection,
   timer, native, dependency or schema changes.
3. Connection/gate: `lib/db/connection.ts`, lifecycle facade,
   `components/ReplacementRestoreGate.tsx`, `app/_layout.tsx` and focused startup
   tests. Timer/notification lifecycle changes need the bounded scope below.
4. Settings: import confirmation/progress/result flow and focused tests; consume
   the lifecycle scheduling wrapper, never the raw engine schedule function.
   Export remains a separately owned backup-module ticket.
5. Media integration: fresh-current-row reconciliation and conservative resolver
   use, assigned after the engine's passed-handle seam is reviewed.

The import audit found no ordinary module-level DB queries outside connection
bootstrap, but `timerStore.ts` currently installs a notification handler at module
load and its singleton constructor starts permissions/channels and an AppState
listener. A React gate alone does not suppress those effects. The lifecycle owner
must receive a bounded lazy-initialization/quiescence contract before dispatch.
`notificationHandler.ts` also schedules delayed navigation and an asynchronous
cold-notification response without cancelling them on unmount; the gate's tests
must prevent those continuations from navigating after it closes. Native alarm
retirement requires the separate prerequisite below; no runtime guarantee is
claimed from this source review.

## Bounded timer prerequisites

MVP-006B2C owns the native manager/module, completion and countdown-dismiss
receivers, their canonical templates, the existing JS native adapter,
sync/verifier coverage and focused native/adapter tests. Reuse existing Android
alarm/notification primitives and installed dependencies; no DB or restore-engine
changes. Its Android-only public seam is:

```ts
type RestoreTimerRetirement = {
  status: "retired";
  registeredTimersRetired: number;
  displayedNotificationsCleared: true;
};
function retireRestTimerArtifactsForReplacementRestore(): Promise<RestoreTimerRetirement>;
```

Missing native capability rejects with `ERR_REST_TIMER_RETIRE_UNAVAILABLE`.
Registry inspection, corruption, checked persistence, alarm cancellation or
notification cancellation failure rejects with `ERR_REST_TIMER_RETIRE_RESTORE`.
An unsupported runtime must never resolve as a successful no-op. The facade must
validate the native result rather than accept a malformed acknowledgement.

Persist each scheduled timer identity before installing its alarm. Validate exact
`timerId`, `exerciseId` and `endAt` in both receivers; legacy or unregistered
deliveries must not post or recreate notifications. Serialize receiver validation,
registry changes, notification posting, alarm operations and bulk retirement
through one native boundary. Bulk retirement cancels registered alarm identities,
clears the process map, durably retires registry state and clears all displayed
app notifications, including completed notifications no longer in the registry.
It is idempotent. No claim of canceling an unknown legacy OS alarm is needed when
its receiver rejects delivery. Missing registry state on upgrade is valid;
corruption is not absence. Process-recreation, stale-identity and persistence/
cancellation failure tests must use production logic.

MVP-006B2D owns `timerStore.ts` lazy activation/quiescence,
`notificationHandler.ts` continuation cleanup, the narrow ready-subtree activation
call in `_layout.tsx`, and focused timer/navigation tests. Export idempotent
`timerStore.activateWhenAppReady(): void` and
`timerStore.quiesceForReplacementRestore(): Promise<void>`. Import remains inert.
Quiescence suspends synchronously, invalidates asynchronous generations, drains
issued native operations, removes AppState listeners, clears intervals, cancels
known timer artifacts and only then releases their identities. Old asynchronous
permission/channel/native continuations must not restart work after suspension.
Calls that create or restart timers while suspended fail closed. No schema,
native-adapter, engine or Settings changes belong to this worker.

The future gate worker additionally consumes/drops queued timer-notification
navigation and mounts Router at a safe route after restore. Native notification
cancellation cannot retract a MainActivity intent already delivered by a tap.
An actual Expo Router initial-URL replay test is required; merely leaving Router
unmounted is not evidence of safe navigation. MainActivity changes require a
separate bounded decision if that test shows JS containment is insufficient.

Device acceptance must schedule a timer, kill/recreate the process, retire it and
wait past its deadline; no old notification or reused-ID deep link may appear.
Repeat for an already displayed completion, countdown dismissal, and a legacy
unregistered delivery. OEM/swipe-away/force-stop behavior is evidence, not the
safety mechanism. iOS restore remains deferred.

Acceptance tests must import the actual root/query graph in each blocked startup
state and prove no ordinary bootstrap, Drizzle construction, provider reads,
notification permission/channel work, timers or navigation occurs. Also prove
scheduling blocks before resolving, safe discard reinitializes before first mount,
committed finalization never replays SQL, and restored settings are read only by
the first permitted provider mounts. Run both release profiles. Native lifecycle,
SQLite and process-death proof remains mandatory and is not supplied by mocks.
