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

Still required: integrated explicit gallery scan/permission/playback evidence,
the remaining exact native crash windows, release-binary cold-link and route/back
checks, and physical Android media/performance acceptance. SAF filename/save/reopen
is observed, but provider-returned MIME is not yet independently observed: both
shell and app-UID CLI metadata queries were rejected by Android permissions.
Production requests `application/vnd.sqlite3`; that source fact alone does not
prove the provider's returned MIME. No permission override was used.

No release branch, tag, push or release approval follows from this checkpoint.
The six preserved original-file hashes still match, including ignored `.env.local`.
