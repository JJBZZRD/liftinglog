# Android restore native runtime checkpoint

Organiser execution, 2026-09-22. **Native control-store acceptance remains
blocked by the recovery defect below.** Successful individual checks do not
override that finding. iOS remains deferred.

## Isolated environment

- Fresh `WorkoutLogRestoreSynthetic` AVD, Android API 36, x86_64, 1536 MiB RAM,
  720 x 1280 display, SwiftShader, no snapshots.
- New writable image/configuration under
  `.codex-artifacts/restore-synthetic-avd-20260922/`; no existing AVD image or
  workout database was copied. The original populated emulator was not read.
- ADB server port 5038, explicit endpoint `127.0.0.1:5557`. The helper checks
  `ro.boot.qemu.avd_name` before every diagnostic batch.
- Reviewed B2 native candidate `2e56151`; installed APK SHA-256
  `8C1FFEC9AE94076B7347528B6DECD589431121938BBEE1FF789F353A56A0D550`.
- Non-shipping diagnostic `3f6acf1`, MVP profile, Metro localhost:8084.
  Probe worktree restored exactly after a temporary Fast Refresh comment.

## Observed process and control behavior

| Check | Observation |
| --- | --- |
| Native process token | Valid token A in PID 4782; Expo JS reload retained A and PID 4782 |
| Cold restart | Force-stop confirmed no PID; PID 5921 returned token B, different from A |
| Second cold restart | Force-stop confirmed no PID; PID 6103 returned token C, different from A/B |
| Fast Refresh | Temporary comment update retained token C and PID 6103 |
| Bridge write/read | Both owned synthetic records read back exactly; successful calls were observable through the production native facade |
| Kill before publication | JDB breakpoint at production `RestoreControlStore.write` line 91, after `fd.sync()` and before `finishWrite()`; `.new` contained NEW, cold restart returned OLD for both pending and outcome |
| Kill after publication | Breakpoint at line 92, immediately after `finishWrite()`; cold restart returned NEW for both records |
| Interrupted first write | With no base or backup, kill at line 91 left only `.new`; native read returned absent for each record |
| Invalid UTF-8 | Both records returned unreadable / `invalid_utf8` |
| Invalid JSON | Both records returned unreadable / `invalid_json` |
| 262145-byte record | Both records returned unreadable / `record_too_large` |
| Mode-000 record | Both records returned unreadable / `io_error` |
| Non-directory parent | Both records returned unreadable / `io_error` |
| Failed deletion | With parent mode 500, each native delete threw and its record remained; mode 700 plus retry deleted it |
| Successful legacy backup recovery | Base NEW plus `.bak` OLD returned OLD and removed `.bak` for both records |

The debugger exercised the production Kotlin method over JDWP, not a simulated
JavaScript persistence function. Tokens are represented by A/B/C here. Local logs
and small synthetic fixture files remain in the artifact directory. These checks
do not prove power-loss durability, parent-directory fsync, physical-device
performance, or all supported Android API versions.

## Reproduced blocker: swallowed backup recovery failure

With `pending.json = NEW`, `pending.json.bak = OLD`, and the parent directory
mode 500, the production native read returned **Present NEW** while both files
remained. Restoring directory mode 700 and reading again recovered **OLD**.

`AtomicFile.openRead()` may log a failed backup rename and continue opening the
base. Pre-read `lstat` checks alone therefore do not establish that the returned
base is authoritative. The control store must verify recovery postconditions and
return unreadable if the authoritative backup remains. The parallel B2C timer
registry uses the same platform pattern and must also fail closed before using
timer identities. Its binary has not been tested by this control-store probe.

MVP-006B2R owns the control-store correction. B2C has a separate review repair.
Both require independent review and corrected runtime failure/retry evidence.

## Cleanup and next run

Parent permissions were restored to 700. Both records were deleted through the
native facade and `restore-control` was verified empty, including `.new`/`.bak`.
The diagnostic app was force-stopped, its Metro server stopped, and JDWP forward
8700 removed. The fresh AVD remains available for synthetic-only checks. Small
owned fixtures under `/data/local/tmp/mvp006b2-*` remain for the corrected rerun.
No private-database approval has been assumed or consumed by this exercise.
