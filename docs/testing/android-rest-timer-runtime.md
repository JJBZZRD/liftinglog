# Android timer retirement runtime checkpoint

Organiser execution, 2026-09-22, fresh synthetic-only API 36 AVD
`WorkoutLogRestoreSynthetic`. Native code includes accepted B2C `177e504` and
B2R `02f45f3`; APK SHA-256 is
`47A923E5B70C54B0657F107FBF6592DFE902102BD0D6378FB6A134167CFFAC3C`.
Non-shipping, manually operated probe `3205588` used the unchanged production
native facade and fixed synthetic exercise IDs 1900000-1900003. The original
populated emulator and physical phone were not used.

## Observed results

- Native capability was present. Exact-alarm permission was false, so this run
  exercised the existing inexact fallback; alarm delivery need not match the
  requested deadline exactly.
- A synthetic 20-second timer was scheduled in PID 10821. `run-as kill -9`
  terminated that process without force-stopping the package. Android retained
  the alarm, started PID 11000, posted the expected completion notification
  (ID 1920000), and consumed its registry entry.
- Native retirement removed that already displayed completion with a zero-entry
  acknowledgement. Repetition also returned zero and left no app notification.
- Two 120-second timers were scheduled in PID 11000 at 10:59:25. Their exact
  persisted identities and deadlines (11:01:25.373/.374 BST) were recorded before
  killing that process. In new PID 11404, retirement at 11:01:22.129 reported two
  entries retired. At 11:02:33 there was no app notification or registry file.
  Android's alarm dump subsequently recorded both alarms as `alarm_cancelled`,
  with no pending app alarm. Cancellation history was not mistaken for live alarms.
- A non-writable registry directory with a remaining `.bak` caused retirement
  to reject. Restoring directory mode 700 allowed recovery and retirement of two
  entries. A distinct empty base / two-entry backup scenario also rejected while
  recovery was blocked, then reported two entries after permission restoration.
- Directory mode 500 with a valid base caused checked deletion to reject and
  retain the registry. Mode 700 plus retry retired both identities.
- Malformed JSON caused retirement to reject; replacing only the owned fixture
  with valid synthetic state allowed retry.
- A real scheduled alarm whose registry timer ID was changed to a synthetic stale
  identity did not post completion after its deadline. Its countdown and stale
  registry remained until explicit retirement, which reported one entry; repeat
  retirement reported zero.
- A swipe on a visible synthetic countdown was followed by the countdown records
  remaining/reappearing in Android's notification dump, including an enqueued
  record for the swiped identity. Both were subsequently retired. This observation
  is narrower than an exhaustive dismissal/receiver interleaving test.
- JDB stopped the actual `RestTimerCompletionReceiver.onReceive` at line 14 for a
  real synthetic alarm. Removing its `endAt` extra and confirming `hasExtra` was
  false modeled a legacy delivery. Continuing produced no completion notification;
  the known registry entry remained until explicit retirement. Pausing Android's
  main thread for this injection caused an ANR dialog; it was dismissed with Wait
  after continuation. That debugger-induced delay is not a production latency test.

This accepts the emulator prerequisite for persisted timer retirement, checked
recovery/deletion, stale ownership rejection and displayed-notification cleanup.
Initial-URL replay, queued notification navigation, restored/reused exercise IDs,
and the complete root gate remain integration tests for the future lifecycle
ticket. Physical-device and OEM release checks remain separate; iOS is deferred.

## Cleanup and evidence

Final retirement reported one entry, then zero on repetition. The dedicated
`files/rest-timer-registry` directory was empty with normal mode 700. The app was
force-stopped, the temporary Metro server stopped, and JDWP forward 8700 removed.
Only marked synthetic fixtures remain for repeatability under app cache or
`/data/local/tmp/mvp006b2cp-*` on the fresh AVD.

Local evidence is retained under
`.codex-artifacts/restore-synthetic-avd-20260922/`: `timer-runtime.log`,
`timer-two-before-kill.json`, `timer-stale-registry.json`,
`timer-empty-registry.json`, and `timer-notifications.png`. No diagnostic route
was integrated into main.
