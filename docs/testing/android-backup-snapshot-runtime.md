# Android online-backup snapshot runtime checkpoint

Organiser execution, 2026-09-22 at 11:17 BST. The production online-snapshot
helper passed the busy-WAL scenario on the fresh synthetic API 36 AVD
`WorkoutLogRestoreSynthetic`, SDK 57 development build, MVP profile.

Reviewed non-shipping probe `8b3647b` ran the integrated A2 helper (`b145a81`) on
an explicitly passed, newly created synthetic SQLite database. It did not import
the live database connection or backup workflow. Ordinary root startup still
initialized the fresh AVD's own app database. No original populated emulator or
phone data was accessed.

## Actual native result

- A distinct reader remained pinned at one set while the writer committed a
  second canonical set. The source checkpoint returned busy.
- The unchanged `createSealedBackupSnapshot()` used Expo SQLite's real online
  backup, sealed its destination, and returned two sets plus one exercise,
  workout and workout-exercise entry.
- An independent Expo SQLite validation handle enabled `query_only` first and
  read the new set with its exact links, 105 kg and 3 reps.
- Integrity, current catalog manifest, DELETE journal mode, and absence of WAL
  and SHM sidecars all passed. Production before/after validation digests matched.
- Total probe time was 807 ms: fixture/bootstrap 424 ms, snapshot helper 294 ms,
  independent validation 70 ms. This is a small debug fixture, not a maximum-size
  performance benchmark.

The retained, ownership-marked cache directory is
`mvp-006a2p-snapshot-probe-mucit771-6ze1d41v`. Its `MVP006A2P-OWNER.json` identifies
this diagnostic. Both `synthetic-live.db` and `sealed-snapshot.db` are 180224
bytes after handles close; neither has a remaining sidecar. Android's independent
`sha256sum` on the sealed synthetic file matched the production result:
`e4ab4211f8505cf2868833d89b8ec2189cfbf5c8b7b33055b67e60a079b1d60a`.

Log: `.codex-artifacts/restore-synthetic-avd-20260922/snapshot-runtime.log`.
The app and diagnostic Metro server were stopped after verification. Owned files
remain for review; no diagnostic route was integrated into main.

This accepts the SDK 57 online-backup/sealing prerequisite on the emulator and
the tested fresh-native current schema profile. It does not establish all native
historical layouts, SAF provider display-name/MIME/write/reopen behavior, physical
device performance, or replacement-restore transaction correctness. Those gates
remain distinct; iOS remains deferred.
