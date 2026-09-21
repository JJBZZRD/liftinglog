# MVP Android media review, 2026-09-21

This supplementary emulator review used application source `06fc4cf7c363063db80a8ed985d7a2282390f96e`
with `EXPO_PUBLIC_RELEASE_PROFILE=mvp`. It does not close physical-device
MVP-004R or the release matrix. iOS remains deferred by the user.

## Runtime and preserved state

- Target: `emulator-5554`, existing populated SDK 57 development client.
- Installed APK SHA-256: `4ed9c5de17025be8552dc3c7b6cf5a91e1fea20bb3b0630623f003dbcd76ea8a`,
  independently read from the installed package; this is the accepted prerequisite
  x86_64 artifact, not a newly built standalone MVP binary.
- A separate offline MVP Metro process uses localhost port 8082 and ADB reverse.
  The pre-existing port 8081 server was left untouched after an occupied-port error.
  Metro recovered from an incompatible disk-cache entry by crawling source again.
- The app was force-stopped before copying all DB/WAL/SHM files. The original
  archive was retained; inspection used extracted copies only.
- Evidence folder: `.codex-artifacts/mvp-android-review-20260921/` (local, untracked).
  Before-archive SHA-256: `AFFB5D116CB9CC448A96CD497BFB4F5878CF7E55383A2AA84FE96E65B6A8F46C`.
- The before snapshot already had the nonunique exercise-name schema. This run
  proves populated startup, not an independently observed legacy-to-new migration.

## Executed checks

- Populated Overview renders in MVP; Programs shows Coming Soon.
- Existing set 5741 opens with its 1 kg / 1 rep values and attached gallery B video.
- Add Note and Save Note persist a synthetic note across a force-stop/cold launch.
  Edit Note saves an updated value. Clear Note followed by Save Note restores null.
- Edit video > Change video opens the Android system picker. Selecting fixture A
  replaces B, renders inline, and enters fullscreen. Android media-session state
  reports `PLAYING(3)`, duration/buffer position 2000 ms, with no player error.
- The replacement retains media row ID 1 and its original `created_at`; its
  `duration_ms` is 2000, not the former erroneous 2,000,000.
- Only the new managed copy remains in the app's `set-videos` directory. Both
  original A/B videos remain in MediaStore. This confirms previous-copy cleanup
  for this unshared replacement without deleting the gallery originals.
- The final snapshot has `integrity_check = ok`, an empty foreign-key check, and
  the same counts: 4 exercises, 734 workouts, 735 entries, 5744 sets, and 1 media row.
  Exact ordered rows in all 14 non-media tables match the before snapshot. The set
  note is null again, and set 5741's weight/reps are unchanged.

The first attempted note-edit tap sequence did not submit an edit; a subsequent
observed draft/save sequence verified the update. The cold restart proves the
initial saved note, not that discarded attempt. The retained log tail has no
matched app-owned ReactNative error/warning, fatal exception, or SQLite exception;
codec/system teardown messages accompany the deliberate force-stop. This is not
a full console audit of every route.

## Open metadata finding

The Android system picker returned `assetId = null`, `fileName = "50.mp4"`, and
no creation-time/album metadata for gallery A. The actual MediaStore filename is
`PRE001H_5554_20260921_0700_A.mp4` (ID 50). Fixture B has a different filename but
the same duration and creation time. The current attachment therefore plays from
its durable app copy, but its stored filename is not a reliable gallery identifier
for a future restore. Numeric cache filenames or duration alone must not be treated
as proof of identity.

This observed case is an input to MVP-006A and a bounded metadata-acquisition
follow-up before claiming complete gallery rediscovery coverage. A failed or
ambiguous lookup must remain unresolved without damaging the training rows.
Neither physical-device permission behavior nor missing-file restore recovery was
accepted by this run. The emulator was left force-stopped with fixture A attached;
the database snapshots and screenshots remain available for continued review.
