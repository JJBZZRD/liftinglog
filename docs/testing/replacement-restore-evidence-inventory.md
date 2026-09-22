# MVP-006E evidence inventory

Organiser review with read-only Luna/medium inventory, 2026-09-22, at `3e81341`
(production `2c45567`). This maps existing tests and remaining integration gates;
it does not close MVP-006E/R or the release matrix before lifecycle/Settings work.
The immutable accepted media candidate passes 81 suites / 962 tests per profile.

| Requirement | Existing host evidence | Remaining integrated/native proof |
| --- | --- | --- |
| Exact replacement, empty backup, all 15 tables, IDs/UIDs, notes/settings/program links, live-only deletion, PB rebuild | Production `__tests__/db/replacementRestore.test.ts`; independent fixtures in `replacementRestoreProof.test.ts`; canonical PB parity suites | Real app handle and providers through B6; scratch-handle populated/empty Android engine prerequisite already passed |
| Current, supported historical and extensionless source; source immutability | `replacementRestorePreparation.test.ts`, `restoreSchemaManifest.test.ts`, proof and historical fixtures | Actual Expo historical preparation and picker round trip; unsupported catalogs remain explicit compatibility limits |
| Invalid/corrupt/unknown/missing/changed candidate; rollback and uncertain commits | Production preparation/engine tests and real Node SQLite rollback/failure injection | Exact native kill points; Android missing/changed diagnostic cases were adapter decisions, not physical file mutations |
| Conservative media scan/skip, cancellation, permission/error outcomes, current-row identity and durable completion | `replacementRestoreMedia.test.ts`, actual set-screen `replacement-restore-media-load.test.tsx`, accepted shared resolver tests | Integrated MediaLibrary permissions/visibility, process-death recovery and playback; physical performance |
| Valid online snapshot and full `.db`/SQLite MIME contract | `__tests__/backupExport.test.ts` invokes the actual export facade; `__tests__/db/backupSnapshot.test.ts` uses real SQLite; proof contract is supplementary | Actual SAF provider display name/MIME/write/reopen; busy-WAL native snapshot prerequisite already passed |
| Confirmation, progress, cancellation, blocked/committed result | Accepted actual dialog/gate component suites | D3 actual Settings hookup and B6 actual root lifecycle; component tests alone do not prove the connected flow |

The manifest worker already established exact supported historical catalogs and
their migrated/current outputs. `restore-schema-manifests.md` records these
accepted families and the retained populated Android catalog inspection.
Intermediate catalogs without physical evidence remain unsupported; they are not
implicitly promised or an open implementation task for this MVP.

The Android engine diagnostic exercises real replacement and A/B/C process
recovery, including an unknown commit and controls-only retries. It uses scratch
handles and cannot establish pre-provider ordering on `LiftingLog.db`. B6 owns
that missing integration and actual initial/warm timer navigation. D3 owns the
reachable Settings flow. Do not duplicate those tickets under 006E.

Restore cleanup intentionally deletes zero physical media files. It reports
untrusted old URI candidates conservatively because no accepted containment proof
exists. This is the accepted cleanup boundary, not a hidden promise of file removal.
Private preparation staging after process death can remain; there is no orphan
sweep in this scope.

After B6 and D3 acceptance, run 006E/R as a final integrated evidence and data-loss
review. Add a test only for an identified gap rather than restating existing row,
rollback or media assertions. MVP-007 then covers consumer/profile regression,
Android device scenarios and final documentation. Physical Android permissions,
playback, provider behavior and release-binary cold links remain release gates;
iOS is explicitly deferred. Diagnostic success is not physical release acceptance.
