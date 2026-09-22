# Android timer navigation generation runtime checkpoint

Organiser execution, 2026-09-22, approximately 12:36-12:51 BST, fresh synthetic
API 36 AVD `WorkoutLogRestoreSynthetic`. Production candidate `227a6d9` was
independently accepted and exact-tree integrated as `c785c9b`. Debug APK SHA-256:
`EB65E5D9CC3FA3A3605CC0E9294D6C366BF60822EFAFC38415BACDFF4A97D9D8`.
The non-shipping diagnostic was reviewed at `089b9b4` and used only production
native facades with fixed synthetic exercise IDs 1900010-1900012. Neither the
original populated emulator nor the physical phone was accessed.

## Observed results

- An empty timer directory produced `{status: "available", generation: null}`.
  A real completion PendingIntent omitted `navigationGeneration`. Tapping its
  notification delivered that exact legacy URL to the mounted Linking listener
  and opened the ordinary exercise route.
- The synthetic target did not exist in the exercise catalog. The ordinary route
  then attempted `addWorkoutExercise` and reported an unhandled foreign-key error
  from `UnifiedRecordTab.loadManualWorkout`. The diagnostic app was restarted;
  this is recorded as a separate invalid/deleted-ID route follow-up, not accepted
  restore navigation behavior or evidence of a valid exercise logging session.
- Empty-registry retirement returned zero retired timers and persisted generation
  G1 (`361e7f8f-2e5e-4872-8a43-6995bf53000a`, with the `timer-nav-v1:` prefix).
- A 20-second timer's actual countdown ACTION_VIEW contained G1. After durable
  registration, PID 14401 was killed without force-stopping the package. Android
  recreated PID 14640, delivered the alarm, removed its registry entry, and posted
  completion notification 1920010. Its actual completion ACTION_VIEW still carried
  G1. The synchronous JS getter also returned G1 in that recreated process.
  Exact-alarm permission was false, so this exercised the inexact fallback and
  makes no exact deadline-latency claim.
- With a new 120-second timer registered, directory mode 500 prevented generation
  publication. Retirement rejected; G1 and the exact timer registry remained.
  Restoring mode 700 and retrying returned one retired timer and persisted a
  distinct G2 (`829efea5-502e-43eb-92fd-ba7757e1553f`).
- A malformed generation file returned `unreadable`, never legacy null. The owned
  valid fixture was restored afterward.
- A real `.bak` recovery blocked by mode 500 returned `unreadable` and left the
  backup present. After mode 700 was restored, the getter recovered G2 and the
  backup disappeared. An orphaned `.new` with an existing base followed the same
  failure/recovery behavior and was removed only after recovery succeeded.
- A newly displayed completion with no timer registry carried G2 in its actual
  PendingIntent. Repeating retirement returned zero and persisted distinct G3
  (`865d756e-d0bb-422f-a3c5-89d52fdd1652`), retaining the generation file.
- At 12:51:24 BST, beyond the retired 120-second timer's 12:47:26 deadline, there
  were zero app notification records and no timer registry. The generation file
  alone remained in the directory, with normal mode 700 and no recovery files.

This accepts the emulator prerequisite for native legacy distinction, durable
rotation, versioned countdown/completion construction, process recreation,
publication failure, and checked physical recovery. It does not accept the future
router comparison or lifecycle draining. Reused-ID containment after restore,
acknowledgement, JS reload and task recreation still requires MVP-006B6's actual
router/root integration. Current-generation cold notification tapping was not
repeated against a valid catalog row in this isolated native check. Physical/OEM
release checks remain separate; iOS is deferred.

## Retained evidence and cleanup

Raw tagged events and Android dumps are retained under
`.codex-artifacts/restore-synthetic-avd-20260922/`: `generation-runtime.log`,
`generation-legacy-intents.txt`, `generation-before-kill-registry.json`,
`generation-before-kill-intents.txt`, `generation-after-kill-intents.txt`,
`generation-after-kill-notifications.txt`,
`generation-before-write-fault-registry.json`,
`generation-current-completion-intents.txt`, and
`generation-final-notifications.txt`. Only marked synthetic fixture copies remain
in app cache or `/data/local/tmp/mvp006b2ep-*` for repeatability.

The app was force-stopped and the owned Metro 8084 session was stopped. The durable
generation was intentionally retained. No diagnostic route was merged into main.
