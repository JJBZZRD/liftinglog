# Physical Android acceptance resume point

Prepared 2026-09-22 after the integrated emulator, release-mode routing and
[six exact crash windows](replacement-restore-crash-android.md) passed.
Physical acceptance is not yet claimed: the ADB inventory contained no phone.
iOS remains deferred by the user.

## Prepared isolated build

MVP-007D-P is a non-shipping configuration branch,
`review/MVP-007D-physical-validation`, commit
`3cb74cb129e52945a0ef30316e019d07a15da282`, based on `66e47ad`.
The organiser reviewed the exact three-file change: app name/package configuration,
release-only application ID suffix, and native app label. All production entry,
app/component/database/native-service/plugin source and dependencies are unchanged.
JSON, XML, Gradle scope, diff and source-parity checks pass. Do not merge this
branch or run prebuild, which would risk applying the suffix twice.

- Display name: **WorkoutLog MVP Check**.
- Application ID: `com.anonymous.LiftingLog.mvpacceptance`.
- Explicit activity: `com.anonymous.LiftingLog.MainActivity` within that package.
- Release mode, embedded MVP profile, ARM64 and x86_64, non-debuggable.
- Existing Android Debug certificate: local validation only, not store signing.
- APK SHA-256: `39D5B688CC4548AF484885CEED1A5522A4E68CE9AFE2C1EEA5606A1B2BD349E9`.

The offline Gradle release build passed in 3m 10s. The retained APK and ownership
record are `.codex-artifacts/physical-mvp-validation-20260922/workoutlog-mvp-check.apk`
and `OWNER.json`; the build log is `.codex-artifacts/mvp007dp-release-build.log`.
The worktree `WorkoutLog-MVP007DP` remains clean at the reviewed commit.

An emulator smoke check with Metro stopped confirmed fresh Overview, Programs
Coming Soon, and recording-link containment. The warm blocked link retained the
already-safe Coming Soon screen. The cold blocked link returned Overview after
the Android notification prompt was handled. First notification denial was
followed by a second prompt on the later launch; that prompt was allowed for this
disposable test package. An initial check expecting Overview before dismissing
the prompt was not acceptance evidence. Fresh UI XML captures are beside the APK.
The separate validation app is installed only on the synthetic emulator and stopped.

## Next executable gate

Connect and authorize the physical phone, confirm its identity and supported ABI,
then verify the APK hash and exact package before installation. Install into this
new validation package; preserve the existing LiftingLog app and its data. Use
explicit package/component targeting because both apps retain the existing URL
scheme. Do not clear or restore over the ordinary phone app's database.

Complete the remaining physical gallery permission, attachment/replacement/removal,
playback, large-video responsiveness, and SAF export/reopen/provider observations
using owned synthetic fixtures. Retain the distinction between requested SQLite
MIME and independently observed provider-returned MIME. Reuse accepted emulator
and host evidence instead of repeating its complete failure matrix.

After physical acceptance, proceed to MVP-007E documentation reconciliation.
Remote CI/protection checks can proceed once the remote backup is authorized.
MVP-007F release branching, store build
and tagging remain gated on acceptance. No release branch, tag or publication has
been created. The user has requested remote backups; the push is still pending
automatic-review-required confirmation of the exact configured GitHub destination,
`https://github.com/JJBZZRD/liftinglog`. The intended backup refs are
`review/EPIC-MVP-01-integration`, `review/MVP-006K-engine-kill`, and
`review/MVP-007D-physical-validation`; no force push is intended.
