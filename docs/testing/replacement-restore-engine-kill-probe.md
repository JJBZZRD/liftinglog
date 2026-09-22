# Replacement restore native kill-window diagnostic

This branch is a non-shipping Android development diagnostic for the remaining
MVP-006 replacement-restore process-death windows. It must never be merged. Its
custom `restore-kill-entry.tsx` entry registers the diagnostic directly and does
not import or mount Expo Router, the normal database lifecycle, providers,
notifications, or timer state.

The diagnostic runs only when all four conditions are true:

- `__DEV__`
- Android
- `expo-application.applicationId` is exactly
  `com.anonymous.LiftingLog.restorekillprobe`
- `EXPO_PUBLIC_RESTORE_KILL_PROBE=1`

Otherwise it renders a disabled shell. Import, registration, render, and mount do
not create a file, open SQLite, publish a control, or invoke the restore engine.
Every action and every wrapped mutation checks the gate again. A normal
development client and an environment where the application ID is unavailable
remain mutation-free disabled shells even when the public flag is set.

## APK and data isolation

`package.json` points only this branch at the custom entry. `app.json` identifies
`com.anonymous.LiftingLog.restorekillprobe`, while the checked-in native project
keeps its base application ID and adds the debug-only suffix
`.restorekillprobe`. Do not run prebuild: regenerating native configuration risks
applying the package identity twice. This gives the fixed native pending/outcome
records their own APK sandbox.

The custom entry imports the application's global CSS before registering the
probe, and `tailwind.config.js` includes the diagnostic source directory. No
Router entry or normal application root is loaded.

The only probe-created database files are:

- `restore-engine-kill-probe-v1/source-populated.db`
- `restore-engine-kill-probe-v1/live-scratch.db`

The directory also contains strict `ownership.json`, `kill-arm.json`, and
`kill-reached.json` receipts. The probe never opens, copies, hashes, migrates, or
queries `LiftingLog.db`. Initialization refuses an existing probe directory and
any native control that is not positively absent. It never sweeps unknown files.

Both scratch databases are separately opened with `useNewConnection`, configured
with the production connection PRAGMAs, bootstrapped, populated, snapshotted, and
closed. The source represents all fifteen restore tables with hard and soft
links, notes, PB data, and media metadata. The live database has different IDs
plus live-only workout and tag rows.

## Actual machinery and checkpoint wrapper

Preparation and scheduling call the production facade. Apply creates the real
`createReplacementRestoreRuntime` with the production preparation, digest,
native process/control, media, and transaction dependencies. The diagnostic adds
only these wrappers:

1. The pending writer brackets the real attempting-record write.
2. The validated-session factory passes the actual SQLite handle through a
   proxy. It binds every method to the real handle and intercepts only the exact
   `execSync("COMMIT;")` call before and after the real call.
3. The outcome writer brackets the real outcome write.
4. The pending deleter brackets the real pending deletion.
5. The real `session.replace()` invocation is counted.

The six selectable boundaries are `before_attempt`, `after_attempt`,
`precommit`, `postcommit`, `postoutcome`, and `postdelete`. `postcommit` is the
space after real COMMIT and before outcome publication; `postoutcome` is the
space after verified outcome publication and before pending retirement.

Arming writes a versioned receipt containing a unique run ID, restore ID, point,
and the current native process token. The exact boundary synchronously writes and
reads back the matching reached receipt, deletes the arm, proves it absent, then
holds the JS thread for 60 seconds. The organiser verifies the reached receipt
and force-stops the diagnostic APK during that hold. Tokens are used only for
equality classification and must never appear in screenshots, logs, or handoff
notes.

If the hold expires, the shared wrapper guard fails closed and throws. It blocks
every later control write or deletion, candidate discard, and media reconcile
mutation from that runtime while still allowing the transaction layer to issue
its safety rollback. Control reads become unavailable. The engine therefore
cannot continue after an after-write timeout by rereading a successful physical
write or publishing a rolled-back marker after a `precommit` timeout. A reached
receipt cannot be overwritten or rearmed; the same native process cannot treat
it as a completed force-stop.

## Executable device preflight

The organiser sets the exact ADB serial and runs these assertions before the
first launch. They refuse the ordinary application package, a different launcher
component, or a sandbox that cannot be entered under the diagnostic identity.

```powershell
$serial = '<reviewed-emulator-serial>'
$probePackage = 'com.anonymous.LiftingLog.restorekillprobe'
$probeComponent = "$probePackage/com.anonymous.LiftingLog.MainActivity"

$installed = (& adb -s $serial shell pm list packages $probePackage).Trim()
if ($LASTEXITCODE -ne 0 -or $installed -ne "package:$probePackage") {
  throw "Diagnostic package assertion failed: $installed"
}

$resolved = (& adb -s $serial shell cmd package resolve-activity --brief `
  -a android.intent.action.MAIN `
  -c android.intent.category.LAUNCHER `
  $probePackage | Select-Object -Last 1).Trim()
if ($LASTEXITCODE -ne 0 -or $resolved -ne $probeComponent) {
  throw "Diagnostic component assertion failed: $resolved"
}

$sandbox = (& adb -s $serial shell run-as $probePackage pwd).Trim()
$expectedSandbox = "/data/user/0/$probePackage"
if ($LASTEXITCODE -ne 0 -or $sandbox -ne $expectedSandbox) {
  throw "Diagnostic run-as assertion failed: $sandbox"
}
```

## Per-run button sequence

Use only the organiser's isolated emulator and one clean diagnostic sandbox per
point. Do not start a device, Metro, Gradle, or ADB from the implementation
worktree.

1. Start Metro for this exact commit with
   `EXPO_PUBLIC_RESTORE_KILL_PROBE=1` and install the reviewed debug APK.
2. Tap **Initialize closed source + live scratch**.
3. Tap **Prepare real production candidate**, then **Schedule native pending +
   ownership**. Confirm `restart_required` and force-stop process A.
4. Start process B and tap **Inspect controls, candidate, all 15 tables, and
   health**. Confirm pending is scheduled, candidate SHA matches, and source,
   candidate, and live evidence covers all fifteen tables.
5. Select one point and tap **Arm selected point once**.
6. Tap **Apply/reapply actual engine**. After external receipt inspection proves
   reached and arm absence, force-stop during the hold.
7. Start the next process and inspect before any apply. Capture pending/outcome,
   candidate SHA, all fifteen scratch-table comparisons, integrity, foreign keys,
   soft links, and process-token equality classification.
8. Except for the special post-delete and rollback sequences below, tap
   **Apply/reapply actual engine**. A retained pending record must execute one
   real replacement transaction even when post-commit rows already match.
9. When apply leaves matching outcome-only state, tap **Complete matching outcome
   with media skip**. Cleanup is allowed only after the production service proves
   both controls absent, the owned candidate is absent, all handles are closed,
   and the probe directory contains only known files.

## Expected physical state after each force-stop

| Point | Pending | Outcome | Live database | Later explicit apply |
| --- | --- | --- | --- | --- |
| `before_attempt` | scheduled | absent | original live rows | full replay, transaction count 1 |
| `after_attempt` | attempting | absent | original live rows | full replay, transaction count 1 |
| `precommit` | attempting | absent | SQLite rolls back the open transaction on process death | full replay, transaction count 1 |
| `postcommit` | attempting | absent | restored rows committed | pending wins; full replay, transaction count 1 |
| `postoutcome` | attempting | matching pending outcome | restored rows committed | pending wins; full replay, transaction count 1 |
| `postdelete` | absent | matching pending outcome | restored rows committed | `postcommit_pending`, transaction count 0 |

For `postdelete`, inspection must report the candidate as retained and matching.
Do not run post-commit completion, raw filesystem deletion, or the probe cleanup
action. The UI refuses completion and cleanup while that physical candidate is
present, preserving the matching outcome and owned ambiguous state for review.
An unrelated or mismatched valid control is never adopted merely because it
parses.

## Unknown-baseline rollback sequence

Use a run killed at `after_attempt` so the next process observes pending
`attempting` with unchanged physical live rows.

1. In the later process, inspect the reached receipt and different process
   classification.
2. Tap **fail_before_commit in later process**. The proxy throws immediately
   before the real COMMIT invocation; the real transaction code executes its
   rollback.
3. Require a failed result with `liveDatabaseChanged=unknown`, transaction state
   `unknown`, recovery `retry_cold_start`, and no recovery token or discard
   authority. Physical row equality does not convert this later-process baseline
   into an unchanged claim.
4. Force-stop, start another process, inspect, and tap normal apply. It must run
   the real replacement transaction once and complete from the retained pending
   candidate.

## Evidence limits

This diagnostic proves process-kill windows only when the organiser observes the
receipts and force-stops the separate APK. A 60-second synchronous hold is not a
power-loss durability claim. The branch does not prove physical-device release
behavior and does not change any production restore, lifecycle, native module,
plugin, or Router source.

Before device use, require TypeScript, the focused import/config test, scoped
uncached ESLint, `git diff --check`, exact eight-file scope, and byte parity for
production dependencies:

```powershell
npm.cmd run typecheck
$env:EXPO_PUBLIC_RELEASE_PROFILE='mvp'; npm.cmd test -- --runInBand --selectProjects unit --runTestsByPath __tests__/diagnostics/restoreKillEntry.test.ts
npm.cmd run lint -- --no-cache diagnostics/RestoreEngineKillProbe.tsx restore-kill-entry.tsx __tests__/diagnostics/restoreKillEntry.test.ts tailwind.config.js
git diff --check
git diff --exit-code be386fba3a7cddd3426f7539ab7b999d603e2566 -- app lib/db lib/native plugins scripts/android-restore-native
```
