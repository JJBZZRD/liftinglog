# Integrated replacement restore: Android evidence

Organiser verification, 2026-09-22. Production source is `800b280`, with the
documentation checkpoint `ab281ef`. Metro ran the identical production tree from
the clean detached D3 candidate `020079575ae7f7968b29364ec6b8992ac37cb468`, profile
`mvp`, on localhost port 8084. No diagnostic route was added to shipping code.

Only the isolated `WorkoutLogRestoreSynthetic` AVD was used, ADB server 5038,
serial `127.0.0.1:5557`. The existing phone and populated emulator were untouched.
The accepted native APK SHA-256 remains
`eb65e5d9cc3fa3a3605cc0e9294d6c366bf60822efafc38415bacdff4a97d9d8`.
This is development-client emulator evidence, not physical-device or release-binary
acceptance. iOS remains deferred.

## Accepted production-flow observations

All preparation, scheduling, cancellation, scan skipping and acknowledgement used
the actual Settings dialog and root gate. Evidence lives under
`.codex-artifacts/restore-synthetic-avd-20260922/`.

| Scenario | Observed result and evidence |
| --- | --- |
| Invalid picker input | Invalid text rejected before scheduling; `integrated-invalid-input.xml` |
| Populated preparation and cancellation | Expected 2 exercises, 3 workouts, 3 entries, 3 sets and 1 video. Cancellation removed exactly its owned stage; all 15 live tables unchanged, controls absent. `integrated-preparation-cancel.json`, `integrated-state-preparation-cancel/` |
| Extensionless input | Prepared with the same populated summary; scheduling published the root restart gate |
| Scheduled-process containment | Hardware Back and an ordinary Settings link did not leave the gate. Actual developer-menu JS reload retained the native PID and gate. `integrated-scheduled-back-link.xml`, `integrated-scheduled-js-reload.xml` |
| Scheduled cancellation | Controlled reload returned to normal startup; all 15 tables matched the live baseline and controls were absent. `integrated-state-scheduled-cancel/` |
| Populated cold replacement | Fully stopped the scheduled process, restarted, and observed the postcommit gate before normal UI. All 15 tables matched source policy exactly, with 3 canonical PBs replacing the stale source event and the media URI cleared. `integrated-state-populated-postcommit/` |
| Postcommit process death | Stopped at the postcommit gate and restarted again. A fresh explicit scan/skip choice appeared without an automatic gallery permission prompt. `integrated-postcommit-after-process-death.xml` |
| Explicit skip and acknowledgement | Reported 0 of 1 resolved, 1 unresolved; Continue released ordinary UI. The completed snapshot still matched all 15 table policies and controls were absent. `integrated-state-populated-complete/` |
| Restored settings | First allowed Settings mount showed Dark/Ocean, Pounds and Brzycki; Overview used pounds. `integrated-restored-settings-{appearance,calculations}.xml` |
| Historical preparation | Supported historical empty source migrated/prepared through the real picker, then was cancelled. `integrated-historical-empty-ready.xml` |
| Empty replacement | Before provider release, every one of the 15 application tables had zero rows. Explicit skip reported 0 of 0; after acknowledgement and Settings reads, every table still had zero rows and controls were absent. `integrated-state-empty-{postcommit,complete}/` |
| Empty defaults | Overview showed zero statistics and no workouts; Settings showed System Default/Default, kilograms and Epley. `integrated-empty-complete-overview.xml`, `integrated-empty-settings-{appearance,calculations}.xml` |
| SAF save/reopen | Actual export saved `LiftingLog-backup-20260922-165013.db` (180224 bytes) in a newly created synthetic destination. The real picker reopened it and production preparation accepted its empty summary. Preparation was cancelled. `integrated-saf-{export-result,export-picker,reopened-ready}.xml` |

The exported SAF file was subsequently copied with matching before/after device
SHA-256 `74c9d7d03e1e9480034d3126e933e0adae27c1d43c2b736c04c05d2ed3047d9f`.
Host inspection reports DELETE journal mode, integrity `ok`, zero FK violations,
all 15 expected empty tables and no provider sidecars. Reopen cancellation left
the live database empty with controls absent (`integrated-state-saf-cancel/`).
The historical source hash also remained unchanged after private preparation.

Each stopped database capture verifies host bytes against device SHA-256 before
and after copying. Raw DB/sidecars are preserved separately from inspection copies.
Every capture reports integrity `ok` and zero foreign-key violations. Exact
populated comparisons include IDs, UIDs, notes, settings, program hard/soft links
and media metadata; only the specified PB rebuild and URI clearing differ.
The live-only workout/exercise did not survive replacement. Opening a valid
exercise link later may create an ordinary draft; exact replacement was captured
before that positive navigation control.

## Timer navigation

Exercise ID 1 was created as a disposable live exercise before replacement and
became the source's Bench Press after replacement. A URL bearing the pre-schedule
generation could not open the reused ID after acknowledgement, after a later
native process restart, or after an actual JS reload (PID 25321 remained the same).
An encoded `%73ource=notification` marker without a generation was also rejected.
Safe Overview remained visible in each case. A correctly formed URL bearing the
current native generation opened Bench Press, proving valid timer routing remains
available.

These were Android `ACTION_VIEW` warm deliveries in native timer URL format,
not taps on newly posted notifications. See `integrated-stale-reused-id-after-ack.xml`,
`integrated-stale-link-next-process.xml`, `integrated-stale-link-after-js-reload.xml`,
`integrated-malformed-encoded-link.xml` and `integrated-current-generation-positive.xml`.
Earlier native notification/retirement evidence remains separate. DevLauncher
cold raw-scheme delivery does not establish release-binary initial-link handling.

## Acceptance boundary and next work

The integrated populated/empty replacement, cancellation, postcommit process-death,
restored-settings and warm reused-ID containment gates pass. Independent scoped
integration review at `ab281ef` found no defect across Settings, the real dialog,
lifecycle/root and accepted engine/media boundaries. Combined host checks pass
86 suites / 1020 tests in **each** profile, TypeScript, and prescribed uncached
lint (zero errors, 19 baseline warnings).

The integrated explicit gallery checks below have also passed. Still required:
the remaining exact native crash windows, release-binary
cold-link and route/back checks, and physical Android media/performance acceptance.
SAF filename/save/reopen
is observed, but provider-returned MIME is not yet independently observed: both
shell and app-UID CLI metadata queries were rejected by Android permissions.
Production requests `application/vnd.sqlite3`; that source fact alone does not
prove the provider's returned MIME. No permission override was used.

No release branch, tag, push or release approval follows from this checkpoint.
The six preserved original-file hashes still match, including ignored `.env.local`.

## Integrated gallery checks

The first explicit Scan request showed Android's real permission prompt. Choosing
Don't allow completed restore with 0 of 1 videos resolved; all 15 tables still
matched the populated replacement expectation, the URI remained empty, and
controls were absent. The ordinary set screen reported **The linked video is
unavailable.** Evidence: `integrated-scan-{permission-prompt,denied-complete}.xml`,
`integrated-state-scan-denied/`, `integrated-denied-set-unavailable.xml`.

A reviewed disposable backup variant changed only media row 80's filename,
creation time, duration and album to identify a synthetic two-second video.
`media-picker-inputs-v1/OWNER.json` records the exact source/output hashes and
row expectations. The video decodes as H.264, 320 by 180, 60 frames; no personal
video was used. Its copied bytes have SHA-256
`6575e371c99b79d8676a4c517838dbc4390e69e8f74647dfab24a0fcac3b8a54`.

| Access/scenario | Result |
| --- | --- |
| Real limited-access prompt and selection of the sole synthetic video | Scan resolved 1 of 1. Package grants confirmed selected-only access and no full video permission. All 15 table policies matched; only the expected `local_uri` changed to `content://media/external/video/media/30`. `integrated-state-limited-scan/`, `integrated-limited-scan-complete.xml` |
| Cold start, ordinary set loading, fullscreen playback | The correct labelled synthetic video rendered in the set card and fullscreen. Native MediaSession reported PLAYING, 2000 ms buffered, speed 1.0 and no error. `integrated-limited-set.png`, `integrated-limited-player-state.png`, `integrated-limited-playing-state-1.txt` |
| Full access with two identical filename/duration matches | After a fresh replacement, scan reported 0 of 1 resolved. Ordinary set loading also remained unavailable; exact table comparison confirmed an empty URI and intact training data. `integrated-state-ambiguous-scan/`, `integrated-ambiguous-ordinary-set.xml` |
| Full access after removing only the owned duplicate | A new restore/explicit scan resolved 1 of 1. All 15 table policies, unchanged media metadata, canonical PBs and absent controls passed. `integrated-state-full-scan/`, `integrated-full-scan-complete.xml` |

The duplicate was a new file in a distinct task-owned directory. Its exact
MediaStore ID 32, path and hash were verified before provider deletion; only its
now-empty directory was removed. Original synthetic asset 30 and its hash are
unchanged. The ordinary set resolver may subsequently materialize a verified
content URI into a managed copy and update canonical identity; the exact
postcommit comparison was taken before that normal consumer behavior.

The original synthetic app's denied permission grants and user-set/user-fixed
flags were restored exactly. The app and Metro were stopped after the full-scan
capture. Retained source fixtures and snapshots allow resumption without repeating
these accepted checks. Physical Android behavior/performance remains separate.

## Native visual finding and isolated crash diagnostic

Screenshot `integrated-postcommit-gate-layout.png` demonstrates right-edge
overflow of the restore gate card, explanatory text and Scan button on the 720 px
emulator. This is a concrete presentation defect; the accessible controls worked
and no data or scheduling failure occurred. MVP-006D2R owns a one-file layout-only
correction to `components/ReplacementRestoreGate.tsx`, branched from `be386fb`.
The worker constrained the ScrollView viewport in one line, preserving the action
contract. After a clean rebase, candidate `4977c0b` passed organiser native visual
review of scheduled, postcommit and completed states; full text and both actions
fit and wrap correctly (`gate-width-postcommit-ready.png`). Existing gate tests
pass 10/10 in each profile. Expo startup generated the ignored ambient type file,
after which the prescribed TypeScript check and an independent MVP test rerun
passed. An earlier worker typecheck without that generated file had only the
known CSS ambient-type error; no production workaround was added. Exact post-flow
data checks also pass (`integrated-state-gate-width-complete/`). The organiser
verified exact tree equality and squash-integrated this correction as `031392e`;
the branch is retired and the reviewed worktree remains detached.

MVP-006K is a separate non-shipping crash-window diagnostic, also pinned to
`be386fb`. Independent review rejected reuse of the old Router probe: the current
production root would consume its scratch pending controls before routing.
The accepted diagnostic design instead uses a custom `registerRootComponent`
entry and a separate Android application ID/sandbox, with all production app,
engine and native-service files unchanged. Its seven-file scope includes the
custom entry, diagnostic component, package/build metadata, import-isolation test
and diagnostic instructions. It must never merge or run prebuild. The organiser
will verify source-map import isolation and the exact APK package before device
execution. Exact attempt/commit/outcome/pending-deletion kill points remain open;
the earlier adapter-injected engine failures are not being repeated.
