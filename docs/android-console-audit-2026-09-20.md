# PRE-001H Android audit: paused checkpoint, 2026-09-20

Status: **in progress, not accepted**. The user requested a safe pause so the
physical phone could be disconnected. PRE-001R and Wave 1 have not started.
Resume from this record and the Resume Point in `expo-upgrade-checkpoints.md`;
do not restart the SDK upgrade.

## Scope and identity

- Tested application source: `8eb591165c35d481beaedd5022e852c90e749c71` on main.
  Changes since `2311f55` are organiser documentation only.
- PRE-001G is accepted for Android ordering with explicit iOS and camera
  deferrals. Neither deferred platform/surface is marked tested or accepted.
- User scope: no in-app camera in the MVP; preserve gallery video attachment
  and playback. Camera entry removal and route protection remain MVP-001D /
  MVP-004C implementation work after prerequisite acceptance. Full-profile
  source/dependencies remain, as required by product facts. No feature code was
  changed during this audit.
- Physical phone: CPH2841, Android 16/API 36, serial `3B164Q0104Q00000`.
  APK SHA-256:
  `2e0b4e4472da64cd8b3a9fc2564932dfce3bef3750ad106b354e197bd1deb8f2`.
- Emulators: Pixel 9 Pro XL / `sdk_gphone64_x86_64`, API 36, serials
  `emulator-5554` (populated/update) and `emulator-5556` (clean app data, followed
  by normal development seeding). Both were disposable read-only AVD instances
  started with `-read-only -no-window -no-snapshot -no-audio -gpu swiftshader_indirect`.
- Correct emulator APK: `.codex-artifacts/pre001h-final/emulator-x86_64.apk`,
  SHA-256 `4ed9c5de17025be8552dc3c7b6cf5a91e1fea20bb3b0630623f003dbcd76ea8a`.
  Recovered from the saved AVD; contains `lib/x86_64/libreactnative.so`.
  Native build inputs are unchanged since the clean-build checkpoint `81a181f`.
- The organiser initially selected the ARM64 phone APK for x86 emulators.
  Its missing-library startup failure is an artifact-selection error, excluded
  from app acceptance. Original evidence is retained; corrected runs use the
  x86_64 APK above. No source repair was needed.

## Reviewed route matrix

These are individual observed passes, not formal closure of PRE-001H.

| Scenario | Observed result and evidence |
| --- | --- |
| Clean startup and migration | Corrected 5556 run renders Overview; development seed runs. A later cold restart logs both workout-exercise migrations OK and skips already-current fixtures. |
| Populated/update startup | Correct APK loads; 5554 renders 360 workout days, 2,569.5k volume and 368 PBs. Three focused transport runs reach populated Overview. |
| Calculator | Clean operator entered 100 kg x 5; Epley result 116.7 kg. |
| Manual logging lifecycle | Organiser created 101 kg x 3, note `PRE001H_ORGANIZER`, on Test_531 in 5556. History showed that exact entry as In Progress, then without the badge and with View workout after Complete Exercise. Set Info later established actual set ID 5712. |
| History and analytics | Populated all-time history and Test_531 search render. Clean exercise Analytics renders chart/PB-marker controls and seven insight cards. The initial worker's seeded-history screenshot alone did not prove completion of its new set; the organiser's exact-entry lifecycle closes that evidence gap. |
| Foreground/background timer | 5556 timer counted down. The normal first-use notification/exact-alarm flow was exercised; the organiser enabled the app's alarm permission in Android Settings. Background notification showed Test_531 countdown, then Timer finished. Tapping it returned to Test_531. A second timer paused at 01:28; notification disappeared. Deleting that timer from its modal changed Update back to Start and removed the paused status. |
| Clean-instance backup | Settings > Export backup > Android Documents folder > Allow produced Backup complete. Exported SQLite integrity is `ok`. Selecting the original extensionless file through Import backup succeeded: 0 new rows, 8,042 existing records updated, existing data preserved. Read-only counts/integrity matched before and after. |
| Cold relaunch after import | 5556 launch at 22:57:36 remained white at 22:58:08, ran JS main at 22:58:17, and rendered Overview by 22:58:36. Stats remained 360 days / 2,569.8k volume / 368 PBs, including the organiser's logged volume. |
| Clean-instance gallery | On actual set 5712, which initially had no media, the organiser attached only the labelled synthetic A clip through system Photo Picker. Inline frame rendered; fullscreen activity opened; the app-owned media session reported PLAYING(3), speed 1, buffered 2,000 ms, no error. Returned to the same exercise history after dismissing Android's first-use fullscreen instruction. Re-entry/replacement was not completed in this instance before pause. |
| Physical gallery supplement | Disposable current-run phone set 5711: attach A, inline/fullscreen playback, leave/re-enter with A retained, replace only run-created A with B on the same ID. App-owned session reports PLAYING(3), speed 1, buffered 2,000 ms, no error. Independently reviewed screenshot and media-session evidence. No camera/personal media used. |
| Populated gallery completion | Worker created actual disposable 5554 set 5712, 1 kg x 1 rep, attached synthetic A and observed inline/fullscreen PLAYING. Paused at Android's first-use fullscreen instruction. Persistence/replacement and populated backup round-trip remain unfinished. |

Clean backup table counts before/after import: exercises 4, workouts 728,
workout_exercises 730, sets 5,712, media 0. These counts predate the later gallery
attachment. Export SHA-256:
`025e3b5a886f4d3699da793137afc0e7151582e50c60efb40fec13d5acbc7f79`.
Its original name was `LiftingLog-backup-20260920-225405` in Android Documents.
The missing `.db` suffix and current merge rather than replacement semantics are
already characterized MVP-006 work, not replacement-restore acceptance here.

## Commands and evidence

Host startup contract remains `EXPO_OFFLINE=1`,
`NODE_OPTIONS=--dns-result-order=ipv4first`, `npm.cmd start -- --localhost`.
Ignored `.env.local` retains `REACT_NATIVE_PACKAGER_HOSTNAME=localhost`.
Every ADB command used an explicit serial; never use `adb -e` with two emulators.

```powershell
adb -s emulator-5556 reverse tcp:8081 tcp:8081
adb -s emulator-5556 shell am force-stop com.anonymous.LiftingLog
adb -s emulator-5556 shell am start -W -a android.intent.action.VIEW -d 'exp+liftinglog://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081'
adb -s emulator-5556 shell uiautomator dump /sdcard/pre001h-relaunch-settled.xml
adb -s emulator-5556 shell dumpsys media_session
adb -s emulator-5556 logcat -d --pid=7917 -v threadtime
adb -s emulator-5556 pull /sdcard/Documents/LiftingLog-backup-20260920-225405 <evidence>/pre001h-export5556.db
```

UI taps followed observed hierarchy bounds; coordinates are not a reusable route
contract. The manual test used normal Exercises > Test_531 > Record/History,
then Set Info from the actual set row. Do not invent IDs in deep links. The older
5554 `/set/5711` attempt did not establish that ID and is excluded from evidence.

Binary app-data snapshots used Python `subprocess.run([...], capture_output=True)`
with `adb -s SERIAL exec-out run-as com.anonymous.LiftingLog tar -cf - files
shared_prefs`; stdout bytes were written directly, without PowerShell text
redirection. Pre-import snapshots also preserve SQLite DB/WAL/SHM. SQLite checks
used host copies opened with `mode=ro`; no raw device DB writes were performed.

Local evidence, retained untracked:

- `.codex-artifacts/pre001g-gallery-final/GALLERY-PHYSICAL-HANDOFF.md`: physical
  provenance, exact flow, fixture hashes, screenshots and app logs.
- `.codex-artifacts/pre001h-final/clean-v2-*`: original corrected clean operator
  matrix and evidence; its partial assertions are superseded only where the
  organiser's checks above provide actual evidence.
- `.codex-artifacts/pre001h-final/populated/`: initial populated operator evidence.
- `.codex-artifacts/pre001h-final/transport/transport-triage.md`: cold-launch
  command transcript, timing, log signatures, and no-host-write control.
- `.codex-artifacts/pre001h-final/populated-completion/`: worker pause handoff.
- `.codex-artifacts/pre001h-final/organizer-pause-20260920/`: organiser XML/PNG,
  full logcat, pre/post-import archives, exported DB, media-session output and
  final app-data archives. `pause-archives.json` records hashes/sizes. Archives
  are evidence; no restore from them has been validated.

After these snapshots and worker handoffs, the organiser force-stopped only
LiftingLog on both emulators to stop playback and leave no test operation running.
The two headless read-only emulator instances remain available with their current
test data; the pre-existing shared Metro process was left unchanged. The phone
was not touched during shutdown. If the host/emulators are closed before resume,
their temporary changes will not persist to the saved AVD: use a fresh disposable
fixture for remaining checks and retain the archived evidence rather than assuming
set 5712 still identifies this run's set.

## Log review and follow-ups

No new project-owned error, unhandled rejection, DB failure, fatal exception or
ANR has been established in the corrected observed routes. This statement does
not substitute for the remaining matrix and final audit.

| Signature | Reviewed classification, owner and follow-up |
| --- | --- |
| White/Tools-only DevLauncher; `Refreshing...` | Development runtime timing. No-host-write control still needed about 45 seconds; JS had not started during white phase. Concurrent web bundles correlated with long Android bundle times. Organiser follow-up `PRE-001H-DEVLAUNCHER`: allow settled-state polling (60 seconds), use observed DevMenu Reload only if still needed; reassess release startup separately. Repository evidence writes are not an established cause. |
| `ReactNoCrashSoftException` / focus before context ready; generated-setter/Catalyst/SoLoader warnings | RN/Expo development lifecycle diagnostics followed by main, migrations and rendered UI. Owner RN/Expo; follow-up `PRE-001H-DEV-RUNTIME` at next platform/release validation. |
| `E ExpoVideo: Current activity does not support picture-in-picture` | Expo Video 57.0.4 calls `applyPiPParams(activity, false)` when auto-PiP is disabled, then catches/logs the activity's unsupported-PiP exception. App requests no PiP and inline/fullscreen passes. Owner Expo; follow-up `PRE-001H-EXPO-VIDEO-PIP`: revisit upstream fix at dependency update. Do not enable an unrequested capability merely to hide the log. Source: installed `PictureInPictureManager.kt` 68-80 / `PictureInPictureUtils.kt` 67-95; organiser independently read the call/catch path. |
| `Unsupported Uri .../tree/primary%3ADocuments`; `DocumentFile: Failed query` | Expo File System 57.0.7 probes a tree URI with `fromSingleUri(...).isFile`, then successfully falls back to `fromTreeUri`. Project passes the picker's documented directory URI unchanged. Three probes are followed by successful SAF save, valid SQLite and successful import. Owner Expo; follow-up `PRE-001H-EXPO-SAF-PROBE`: revisit upstream tree detection, verify multiple providers after a fix. No project URI rewriting. |
| `ReconnectingWebSocket: Software caused connection abort` during exact-alarm Settings round-trip | Android destroyed the UID's TCP socket; RN's development WebSocket schedules reconnect. Owner RN/Expo dev client; same dev-runtime follow-up. No application networking failure observed. |
| `android.xr` missing flags, Google API package/DocsApplication diagnostics, Bluetooth collector, codec BAD_INDEX, hidden API, graphics warnings | Emulator/OS/codec diagnostics; concrete UI/backup/playback checks succeeded. Organiser follows up if correlated with a failed product path. The Firebase default-options warning was also observed at startup; precise dependency attribution remains to be included in final H log reconciliation. |

The two narrow Sol/high read-only diagnostic reviews changed no source or
dependencies. No external issue was posted. The follow-up identifiers above are
local tracking entries, not claims of upstream issue submission. Existing picker
repair remains `d8ee8cf`; current picker runs show no `MediaTypeOptions` warning.

## Resume and remaining gates

1. Re-read current branch/status and preserve the pre-existing work. All six
   originally dirty files plus `.env.local` matched their recorded hashes at
   pause. Do not stage them. No worker feature branch exists and no code merged.
2. Reuse the accepted SDK 57 build, selecting the x86_64 APK for emulators and
   ARM64 APK for the phone. Saved AVD data is untouched by the read-only runs.
   The physical phone is no longer needed to finish the outstanding emulator
   checks; reconnect/authorize USB debugging only if a later physical test needs it.
3. Resume PRE-001H: finish populated gallery persistence/replacement and the
   populated backup pre-import snapshot/export/integrity/import/count checks.
   Reconcile the complete required route matrix and finish log classification.
   Any confirmed project defect gets a separate scoped implementation worker.
4. Commit final H transcript/matrix/log classifications/repair links and accept H
   only when complete. Then dispatch independent Sol/high PRE-001R, read-only,
   with no inherited conversation and a pinned SHA.
5. Only after R acceptance, refresh codebase-memory, freeze the release-profile
   contract and pin Wave 1. Prepared parallel order: MVP-001A (Terra/medium),
   MVP-002A (Terra/medium), MVP-003A migration proof (Sol/xhigh); queue MVP-004A
   characterization (Luna/medium) for a free slot. Each has its own narrow scope
   and external worktree. Merge the capability contract before dependent camera
   entry removal and route containment.

Existing automated evidence still applies to unchanged source: 27 Jest suites /
344 tests pass, typecheck passes, lint has 20 baseline warnings/0 errors, npm
dependency tree and Android native verifier pass. This pause does not change the
accepted iOS/camera deferrals or grant release approval.
