# Backup Snapshot Export

## Production contract

`exportDatabaseBackup()` now exports a sealed SQLite snapshot rather than copying
the live `LiftingLog.db` file. The export path:

1. creates a unique private directory under the app cache or document directory;
2. opens a new destination database with `useNewConnection: true`;
3. calls Expo SQLite 57 `backupDatabaseAsync()` with the existing long-lived
   application connection as the source;
4. checkpoints the destination, requires a successful checkpoint result, switches
   it to `journal_mode=DELETE`, verifies that mode, and closes the handle;
5. requires the main file to exist without `-wal` or `-shm` sidecars;
6. hashes the closed file, reopens the existing file through a separate new
   connection, and immediately enables `PRAGMA query_only=ON`;
7. runs `integrity_check`, validates a supported current schema manifest, records
   all app-table counts, closes validation, checks sidecars again, and requires the
   SHA-256 to be unchanged; and
8. saves or shares only that sealed main file.

Android SAF receives the complete
`LiftingLog-backup-YYYYMMDD-HHMMSS.db` display name and
`application/vnd.sqlite3`. A cancelled or failed SAF operation removes the private
snapshot; an incomplete provider file is deleted best-effort after a write error.
The fallback file remains in private storage after return because the Settings
caller still needs its URI for the share sheet.

The legacy merge importer and its staging database are unchanged.

## Automated evidence

`__tests__/db/backupSnapshot.test.ts` uses Node SQLite's online backup binding and
the production snapshot state machine. It holds a read transaction, commits a row
to WAL, proves `wal_checkpoint(TRUNCATE)` is busy, and verifies the sealed export
contains both rows, uses DELETE journaling, has no sidecars, matches its digest,
and passes the current production schema manifest. It also injects failures at
backup, destination checkpoint, journal-mode conversion, close, sidecar checks,
validation, and digest verification.

`__tests__/backupExport.test.ts` verifies the public workflow uses the live handle,
creates a unique private destination, passes the complete `.db` filename and
SQLite MIME to SAF, cleans up cancellation and failures, deletes an incomplete SAF
document after a write error, and retains a successful fallback file for its
caller.

## Remaining device evidence

The ADR's Android SDK 57 release gates remain physical-device work: exercise Expo's
native backup with a pinned WAL reader, inspect the provider's observed display
name and MIME, and reopen the exported document without sidecars. iOS export and
restore remain deferred as specified by the ADR.
