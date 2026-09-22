# Physical Android acceptance resume point

Prepared 2026-09-22 after the integrated emulator, release-mode routing and
[six exact crash windows](replacement-restore-crash-android.md) passed.
Physical acceptance remains open after the bounded phone session below.
iOS remains deferred by the user.

## Physical session: 2026-09-22

The user authorized a 30-minute phone window starting 21:45:18 UTC, ending
22:15:18 UTC. The organiser checked the clock periodically and stopped all phone
operations at 22:13:36 UTC. The connected OPPO CPH2841 was authorized and ARM64.
The APK hash below matched before installation into the separate test package.
The ordinary application was not installed over, cleared, or restored into.

Accepted physical observations:

- Overview omits User Metrics/bodyweight tracking. Programs displays Coming Soon.
- Manual Bench Press logging accepts a synthetic 40 lb / 5 rep set without a
  Record Video control. The new entry survives cold starts and appears In Progress.
- The set video menu contains Change Video, Unlink Video and Cancel. An empty
  attachment exposes Add From Gallery. No in-app recording entry was present.
- Warm bodyweight and recording links preserve a safe screen. Cold bodyweight,
  recording and program-management links return Overview.
- Synthetic populated replacement passes validation and cold-start application.
  Denied and limited gallery access complete with an explicit unresolved attachment.
- Gallery replacement, rendering, full-screen viewing, unlink and reattachment
  were exercised. Immediately after unlink, the external synthetic video's SHA-256
  was unchanged; later disappearance is a separate unresolved finding below.
- SAF saved `LiftingLog-backup-20260922-230603.db` (180224 bytes). Host read-only
  SQLite inspection reports integrity `ok`, no foreign-key violations and four sets.
  Reopening that exact file in the app validates two exercises, four workouts,
  four exercise entries, four sets and one video attachment. Cold restore succeeds.
  Provider-returned MIME was not independently observed.

Open physical findings (do not mark MVP-007D accepted):

1. The system picker attachment saved `asset_id`, `original_filename`,
   `media_created_at` and `album_name` as null; duration was 2000 ms. Restore
   correctly invalidated the app-local URI and left the attachment unresolved.
   Full gallery permission also resolved zero of one. Independent source review
   must distinguish expected safe failure from a picker metadata acceptance gap.
2. Both owned synthetic MP4s later disappeared from the dedicated external
   `Download/WorkoutLog-MVPCheck-20260922` folder. No organiser deletion command
   was issued. A tighter observation repushed one file, verified its hash before
   and after media indexing, launched the ordinary set screen/picker without
   another restore, then found it absent. A stopped-app control retained the same
   file/hash through the final checks. This correlates with app activity but does
   not yet establish the responsible code or component. Investigate before more
   physical restore acceptance. No claim about unrelated personal files is made.
3. Large-video responsiveness remains untested. An approved retry using existing
   bundled FFmpeg prepared `MVP-Phone-Large.mp4` locally as the phone session ended:
   104960708 bytes, 45 seconds, H.264 Constrained Baseline, 1280x720 at 30 fps;
   SHA-256 `01E9DA2951C101CFC8B0AA1BFD2CAAA78A4DBB25B9A792D59D6BDDD4BC9F577E`.
   It was not installed or tested on the phone. The ordinary 2-second synthetic
   clip is not evidence of large-video performance.

The test app is stopped, its Photos and videos permission is set to Don't allow,
and the phone was returned to Home. The final repushed synthetic clip remained at
SHA-256 `6575e371c99b79d8676a4c517838dbc4390e69e8f74647dfab24a0fcac3b8a54`.
Test databases and the isolated app remain for resumption. Raw UI XML, screenshots,
exported synthetic DB and its audit JSON remain local under
`.codex-artifacts/physical-mvp-validation-20260922/phone/`; do not commit raw phone
captures, which can include incidental system-picker metadata.

The user explicitly authorized the configured GitHub destination. Atomic push
succeeded for integration `f70abcf`, diagnostic `1345128`, and physical validation
`3cb74cb` to the three review refs listed below. No main force push or release
publication occurred. Remote CI runs/protections remain unverified: the environment
has no `gh`/`hub`, and the read-only API attempt could not connect.

### Independent review and next tickets

The read-only specialist confirms that a missing original filename makes
`resolveVideoLibraryReference` return unresolved before scanning; this is the safe
behavior required by facts section 10. The earlier
[Android media review](mvp-android-media-review.md#open-metadata-finding) already
records the broader system-picker identity gap. A bounded metadata-acquisition
ticket must prove canonical identity with installed library/native contracts;
duration alone, numeric cache filenames and undocumented URI parsing are not
acceptable substitutes. Keep ambiguous or missing identities unresolved.

No external deletion path was found in set loading, picker read/copy or restore
reconciliation. The reviewed managed-file deletion is restricted to app storage;
the app's gallery deletion call belongs to explicit set/clear deletion handlers,
which were not exercised in this session. The disappearance therefore requires
evidence of the responsible transition before a code correction is commissioned.
The user explicitly confirmed after the session that they did not delete the test
videos or run a phone/storage cleanup. Manual user cleanup does not explain the
observations; the responsible app/native/OS transition remains unproven.

Next executable device investigation: use the isolated package and a new pair of
owned synthetic files; assert file hashes and exact MediaStore rows while stopped,
after ordinary launch, after set mount, after Change Video, and after picker
cancel/selection. Stop at the first disappearance. Retain timestamped app and
MediaProvider/picker diagnostics and verify whether any external cleanup or user
action occurred. Do not use personal media or modify the ordinary app. The phone
window has ended, so this investigation waits for a later device session; source
and metadata-contract preparation can proceed offline.

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
The separate validation app was subsequently installed on the phone as recorded above.

## Next executable gate

Resolve the physical findings above through scoped review/tickets first. On the next
device session, connect and authorize the physical phone, confirm its identity and supported ABI,
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
Remote CI/protection checks remain outstanding despite successful branch backups.
MVP-007F release branching, store build
and tagging remain gated on acceptance. No release branch, tag or publication has
been created. The user authorized remote backups to
`https://github.com/JJBZZRD/liftinglog`. The successfully pushed backup refs are
`review/EPIC-MVP-01-integration`, `review/MVP-006K-engine-kill`, and
`review/MVP-007D-physical-validation`; no force push was used.
