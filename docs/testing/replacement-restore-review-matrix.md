# Replacement restore review and native acceptance matrix

Organiser preparation, 2026-09-22. This is an execution checklist, not evidence of
passing production restore. The [accepted ADR](../adr/replacement-restore.md)
defines behavior. iOS remains deferred. Physical Android release checks remain
separate from emulator evidence.

## Prerequisite review order

| Ticket | Required evidence before the engine relies on it | Current disposition |
| --- | --- | --- |
| 006B1 PB derivation | Exact canonical validity, ordering, progression and UID ownership; real DB parity | Independently accepted and integrated as `288001e` |
| 006B2 native controls | Valid process token; RN 0.86 synchronous bridge compatibility; atomic fixed-name records; ambiguous reads fail closed; verified deletion; plugin/template parity | Corrected `02f45f3` independently reviewed and actual Android failure/retry/write-ACK rerun accepted; [runtime evidence](android-restore-native-runtime.md); physical release checks remain separate |
| 006B3 schema manifests | Actual historical DDL, supported migrated physical layouts, complete catalog constraints/indexes/FKs, unknown-object rejection, populated Android schema comparison | Corrected `043347c` independently accepted and integrated `f435567`; organiser 143 targeted tests pass; native parity remains pending |
| 006B4 SHA-256 | Real maintained digest library; read-only bounded chunks; limits/abort/close failures; Metro resolution; native digest and latency comparison | All native fixture digests match, but 256 MiB requires 148 s async / 142 s sync on debug emulator; performance follow-up 006B4R required; [evidence](android-file-sha256-runtime.md) |
| 006B2C/D timer retirement | Inert imports, drained JS/native continuations, persisted native identities, rejected legacy deliveries, bulk alarm/display cleanup, safe queued navigation | JS lifecycle integrated `9401261`; corrected registry integrated `177e504`; [native retirement prerequisite accepted](android-rest-timer-runtime.md); initial-URL/reused-ID integration remains pending |
| 006A2 online snapshot export | Busy-WAL committed rows, standalone seal, strict catalog, stable native digest, external provider round trip | [Actual SDK 57 online snapshot accepted](android-backup-snapshot-runtime.md); SAF/physical release proof pending |

Native control review must distinguish successful publication from a failed write
whose outcome is uncertain. A read error must never be converted to absent pending
state. Android `AtomicFile` supplies the replacement mechanism but does not provide
locking, and its implementation can log rather than propagate some sync/close
failures. Review the wrapper's serialization, explicit error handling and read-back
verification against the [Android source](https://android.googlesource.com/platform/frameworks/base/+/master/core/java/android/util/AtomicFile.java).
Do not claim arbitrary power-loss durability from a process-kill test.

## Isolated native prerequisite run

Use a reviewed, non-shipping diagnostic branch against the candidate native build.
No diagnostic route or test control record belongs on integrated main. Before the
run, preserve the installed APK identity, app database and sidecars, existing
control-directory state, managed videos, gallery fixtures, and permission grants.
Never overwrite a pre-existing pending or outcome record with diagnostic data.

The current populated-emulator run is paused before app launch pending explicit
permission for hash-only database/sidecar preservation checks. Automatic approval
review rejected the original copy and then the narrower metadata read; neither
command executed. Do not infer consent or retry those reads without authorization.
The organiser created a separate fresh synthetic-only AVD, with explicit isolated
configuration/data paths and no copy of the existing emulator's data. Its native
prerequisite checks are recorded in the runtime evidence above; they do not
exercise or establish preservation of the original populated database. New
synthetic history fixtures will have their own before/after checks for the engine.
The hash diagnostic's maximum fixture is sparse and has already been read during
setup, so it cannot establish cold-cache or physical-storage worst-case performance.

1. Confirm canonical token A across repeated synchronous calls. Perform a JS reload
   and prove the token remains A; force-stop and restart and prove token B differs.
2. Write/read/replace both fixed control record names through the real bridge.
   Verify complete JSON and no torn publication. Delete and verify absence.
3. With only diagnostic state, exercise empty/corrupt/oversized records, malformed
   parent paths, inaccessible files, abandoned `.new` state and legacy `.bak`
   recovery. Distinguish unpublished work from unreadable committed state.
4. Compare native synchronous and asynchronous SHA-256 with an independent host
   digest for empty, small, multi-chunk and maximum-size disposable files. Measure
   startup blocking and asynchronous responsiveness; report emulator limits.
5. Restore diagnostic state and compare all 15 app tables exactly with the baseline.
   Remove only test-owned artifacts and return permission/transport state to its
   recorded baseline.

## Integrated engine and gate checks

All rows below are pending production implementation. Host tests use the actual
production service with controlled adapters, not a second proof implementation.
Native tests use disposable backup/live pairs and preserved pre-run app state.

| Scenario | Required result |
| --- | --- |
| Prepare current, supported old, and extensionless databases | Private migration/sealing; exact original IDs and existing UIDs; no live writes; strict source and current manifests |
| Invalid, unknown, corrupt, missing or changed candidate | Typed failure before live mutation; no silent empty database creation |
| Missing native bridge or process identity | Restore unavailable; unavailable storage is not proof of absent pending state; normal startup only when no pending restore can be established safely |
| Cancel before/after atomic scheduling publication | Before: unchanged cancellation; after: restart required while pending state exists |
| Schedule A; reload A | Root gate only; no replacement and no ordinary provider, notification or timer effects |
| Cold process B applies scheduled A | Existing live handle; synchronous transaction before ordinary bootstrap/providers; all 15 table policies honored |
| Attempt B; reload B; cold process C | B reload cannot retry; valid pending candidate is reapplied by C |
| Inject failures after delete/insert/PB rebuild and before commit | Exact pre-transaction data after verified rollback; unchanged claims only from a proven unchanged baseline |
| Kill around attempt write, commit, outcome write and pending deletion | Valid pending state always wins and causes full reapplication on a later process; outcome never skips pending replacement |
| Outcome write or pending deletion fails after commit | Data remains committed; gate blocks; cleanup retry never claims cancellation or unchanged data |
| Safe discard after startup validation failure | Fresh no-pending initialization before providers; no release of an uninitialized connection |
| Restore succeeds, including an empty backup | Live-only rows disappear; settings/notes/program links preserved as specified; canonical PB rebuild; no merge matching |
| Post-commit gallery error, denial, ambiguity or abort | Data restore succeeds; unresolved URI stays empty; ordinary set loading cannot bypass the conservative resolver |
| Post-commit process death | No replay of candidate media IDs; any later scan reads current rows explicitly |
| Managed-copy cleanup | Delete only verified, now-unreferenced app copies; never gallery assets or untrusted paths |
| Export while WAL checkpoint is busy | Online snapshot includes committed WAL rows; sealed standalone file; full `.db` display name and SQLite MIME round trip |
| Restored settings and navigation | First provider mounts read restored theme/units/formulas; deferred MVP routes remain inaccessible |

Fault-injection instrumentation, if needed to reach exact native kill points, must
remain on a separate reviewed diagnostic branch. Record its complete diff and
also run the uninstrumented production path. Do not label host or instrumented
results as physical-device release acceptance.

After the engine, Settings, root gate and media integration are accepted, rerun
both profiles, lint/typecheck, consumer regressions, and the Android release matrix.
Only then consider the plan's release branch and build/tag decisions.
