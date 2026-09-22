# MVP-006B5 Android engine acceptance

Organiser execution on 2026-09-22 accepts the passed-handle engine prerequisite
for lifecycle integration. The reviewed non-shipping diagnostic is `875d599` in
`WorkoutLog-MVP006B5P`, based on `f2ac660`; production engine code is the accepted
`fdd4313` integration. The diagnostic branch is not merged.

Only the fresh `WorkoutLogRestoreSynthetic` API 36 x86_64 AVD was used, through
ADB server 5038 and serial `127.0.0.1:5557`. The installed accepted debug APK is
`EB65E5D9CC3FA3A3605CC0E9294D6C366BF60822EFAFC38415BACDFF4A97D9D8`.
Metro served the diagnostic MVP bundle on localhost:8084 with ADB reverse.
No physical phone or original populated emulator was accessed.

## Isolation and review

The diagnostic supplied independently created scratch source/live handles under
the fixed `restore-engine-probe-v1` documents directory. Its operations never
opened or copied `LiftingLog.db`; the ordinary development app still performed
its normal startup on the separate synthetic AVD. This is not evidence of the
future pre-provider lifecycle gate.

Root review required corrections for per-connection foreign-key enable/readback,
durable fixture/restore-ID/source-digest ownership across restart, synchronous
action locking, full pre/post snapshots, and refusing recursive cleanup over
unknown directory entries. The revised two-file candidate passed worker
TypeScript/scoped lint/diff checks and organiser TypeScript. A strict matching
receipt was required before apply or control cleanup; no global record was
adopted merely because it parsed.

## Observed matrix

| Case | Actual result |
| --- | --- |
| Populated source preparation | All 15 table counts present; original source digest unchanged; sealed candidate ready |
| Scheduled process A apply | `restart_required`; all 15 live tables and health checks unchanged; candidate/pending retained |
| Real developer-menu JS reload in A | `restart_required` again; a reload did not count as a new native process |
| Force-stop/restart to B, normal facade | `committed`; all 15 tables match expected source rows, with only PB identifiers rebuilt and media URIs cleared; live-only workout/tag removed |
| Empty source | All 15 prepared counts zero; cold apply makes every live count zero, including settings; live-only rows removed |
| Outcome-write throw after real commit | `committed_pending_outcome`; exact restored rows and pending/candidate retained; controls-only retry returns committed with replacement counter **1 -> 1** |
| Pending-delete throw after real commit/outcome | `committed_pending_cleanup`; exact restored rows and pending/candidate retained; controls-only retry returns committed with counter **1 -> 1** |
| Throw after the real COMMIT returns | Failed with unknown transaction/data outcome; actual rows match replacement; pending/candidate retained |
| Unknown-commit JS reload in same B | `restart_required`; all 15 rows/health unchanged by the blocked attempt |
| Unknown-commit force-stop/restart to C | Normal facade commits the retained candidate; expected rows match, canonical PBs rebuilt, pending/candidate retired |
| Missing-candidate adapter decision | `candidate_path_invalid`, not started, unchanged; zero replacement calls; all 15 rows/health unchanged; retained candidate applies successfully in cold C |
| Changed-digest adapter decision | `candidate_changed`, not started, unchanged; zero replacement calls; all 15 rows/health unchanged; retained candidate applies successfully in cold C |

Every successful replacement reported integrity, foreign-key and soft-link checks
`ok / ok / ok`. Fresh control inspection after both controls-only retries proved
pending absence and a present committed outcome. The earlier apply snapshot's
retained-state line is historical; it was not mistaken for post-retry state.

The missing/digest cases are explicitly adapter fault injections around the real
runtime; they do not claim physical candidate mutation. Other fault modes wrap
the actual SQLite transaction/native facades without replacing their logic.
Unknown-commit recovery in C is a real replacement replay, not controls-only retry.

An early force-stop during empty-case setup occurred before schedule publication;
physical controls and the receipt were absent. Preparation was repeated from the
same owned source in the next process, then durable scheduling was observed before
the recorded cold apply. Any abandoned private preparation staging was retained;
no orphan sweep or extra cleanup was introduced.

## Evidence and remaining gates

Local evidence is retained under
`.codex-artifacts/restore-synthetic-avd-20260922/`:
`mvp006b5p-native-session.log` contains bounded UI statuses/table checks and
`mvp006b5p-metro.log` contains 107 events with zero error events. Full native process
tokens and control JSON were not logged. The final matching cleanup removed the
named probe fixtures/receipt and empty probe directory; the control directory was
empty. The app was force-stopped and the owned Metro session stopped afterward.
All six preserved original-file hashes still matched.

This closes the Android engine prerequisite only. MediaLibrary permission and
matching/playback, pre-provider lifecycle ordering, actual Router retained-intent
containment, Settings hookup, SAF round trips and physical release scenarios
remain separate acceptance gates. iOS remains deferred.
