# Replacement restore exact Android crash windows

Accepted on 2026-09-22 by the organiser after independent diagnostic source review
and independent copied-row verification. This closes the outstanding synthetic
Android process-kill windows; it does not establish power-loss durability or
physical-phone acceptance.

## Isolation and reviewed source

The non-shipping diagnostic is `13451288e57f421feafcc11995b67d6c6c38b542`, branch
`review/MVP-006K-engine-kill`, based on documentation checkpoint `19e70fb`.
It must not merge into production. All production app, DB, native, plugin and
native-template dependencies remain unchanged. The eight-file diagnostic scope
adds a custom entry, native package guard, dedicated debug application ID,
checkpoint wrappers, import/guard tests, CSS scanning and operator instructions.
Independent review accepted its corrected package, timeout and styling safeguards.
TypeScript, two focused tests, scoped uncached lint, diff and parity checks pass.

The debug x86_64 APK uses package
`com.anonymous.LiftingLog.restorekillprobe` and activity
`com.anonymous.LiftingLog.MainActivity`. APK SHA-256 is
`E582E90721B9C60B8BFA29B95B749E196F4D924AE2CDD965E419FFC4B7449310`.
Its native metadata was built at `56ea917`; subsequent corrections changed only
JavaScript/tests/CSS configuration/docs. The actual Metro source map matches the
corrected diagnostic source and contains 1190 sources with no normal Router,
database connection/lifecycle, notification handler or timer-state imports.
Source-map SHA-256 is
`b790898e606485acf0db8f2d38002a85e057a72630967350bf1984e89d5137fc`.

Only `WorkoutLogRestoreSynthetic` was used (ADB server 5038, serial
`127.0.0.1:5557`). The exact installed package, explicit component and private
`run-as` directory were verified. Metro ran locally on port 8085 with the MVP
profile and explicit diagnostic flag. IPv4-first localhost resolution was needed
for ADB reverse. The normal app remained stopped throughout these runs.

## Observed results

Each run used distinct closed source/live scratch databases containing all fifteen
restore tables, real preparation and scheduling, a native process restart, and one
strictly owned checkpoint receipt. At the requested boundary the diagnostic wrote
and read back `reached`, deleted/proved absence of `arm`, and held JavaScript for
60 seconds. The organiser verified ownership and force-stopped the separate APK;
all six receipt/stop checks completed in 0.75 seconds or less. Tokens were compared
but never rendered or logged.

| Kill boundary | Stopped physical state | Later recovery |
| --- | --- | --- |
| Before attempting-record write | Pending scheduled; no outcome; original live rows | Committed; one real replacement transaction |
| After attempting-record write | Pending attempting; no outcome; original live rows | Additional rollback case below, then committed with one real transaction |
| Immediately before real SQLite COMMIT | Pending attempting; no outcome; recovered live rows equal the original fixture | Committed; one real replacement transaction |
| Immediately after real SQLite COMMIT | Pending attempting; no outcome; restored rows durable | Pending wins; one real replacement transaction despite already-restored rows |
| After outcome write, before pending deletion | Pending attempting plus matching pending outcome; restored rows durable | Pending wins; one real replacement transaction |
| Immediately after pending deletion | Pending absent; matching pending outcome; restored rows and candidate retained | `postcommit_pending`; zero replacement transactions; all fifteen rows unchanged |

After the after-attempt kill, another process injected a failure immediately before
COMMIT. The real transaction rolled back; the engine reported transaction/live
state `unknown`, recovery `retry_cold_start`, and no recovery token. All fifteen
live tables remained identical to the scheduled fixture, pending remained
attempting, and the candidate remained available. A further cold process replayed
successfully. Physical row equality did not incorrectly grant discard authority.

For the first five runs, explicit production postcommit completion returned
restored, pending/outcome became absent and the owned candidate was absent.
Completed rows equal source rows except the specified empty media URI and canonical
PB UID regeneration. Replaying already-committed rows regenerated only the PB UID;
canonical values and links remained equal. Reached receipts remained until guarded
fixture cleanup. All snapshots pass integrity, foreign-key and soft-link checks.

The final post-delete run intentionally remains preserved. Diagnostic completion
refused the retained candidate; diagnostic cleanup refused the present outcome.
Its outcome, candidate and receipts remain intact with the app stopped. This is
evidence preservation, not a claim that production postcommit acknowledgement is
unavailable. An earlier preparation interrupted before its scheduling acknowledgement
also left a private candidate; no orphan sweep or unknown-file deletion was used.

## Evidence and remaining boundary

Local evidence is `.codex-artifacts/restore-synthetic-avd-20260922/`:

- `kill-apk-owner.json`, `kill-1345128-source.map` and six
  `kill-<point>-receipt-stop.json` records identify the executed machinery.
- `kill-state-<point>-scheduled`, `-killed` and `-complete` capture raw stopped
  database files plus separate inspection copies and all table rows. The accepted
  first scheduled capture is `kill-state-before-attempt-scheduled-v2`; its earlier
  incomplete host capture is not acceptance evidence.
- `kill-state-after-attempt-rollback` and its UI XML record the unknown-baseline
  failure. `kill-<point>-replay.xml` records actual transaction counts.
- The last run uses `kill-state-postdelete-preserved` and the two refusal XML files.
- `kill-normal-app-unchanged.json` proves the normal app's database, WAL and SHM
  hashes still equal the pre-diagnostic baseline, with no native restore controls.

The independent read-only row review confirmed every stated comparison across all
fifteen tables. Both apps and Metro are stopped. Physical Android gallery,
performance and provider acceptance remain open; the ADB inventory showed no
physical phone connected. iOS remains deferred. Final documentation reconciliation,
remote CI/protection verification and the release cut remain subsequent gates.
