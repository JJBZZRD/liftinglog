# MVP-004E3 Android integration review

Reviewed by the organiser on 2026-09-22 against integrated main `f045adb`
(gallery implementation `e8caf44`). The existing SDK 57 development APK ran the
MVP bundle on `emulator-5554` through a temporary localhost Metro on port 8084.
This is emulator integration evidence, not physical-device release acceptance.

## Scenarios

The organiser used existing set 5744, which initially had no media row, without
editing its training data. Original media row 1 on set 5741 was untouched.

1. Selected fixture B through **Add From Gallery** with the existing limited
   permission state. Its durable app copy rendered correctly in the video view.
   Optional canonical metadata remained unresolved: ID, filename, time and album
   were null, while duration remained 2,000 ms. No cache filename was promoted to
   canonical identity. This verifies safe unresolved behavior; the precise reason
   for this limited-access no-match was not instrumented in the production bundle.
2. Force-stopped and cold-started the app. The B attachment remained available and
   rendered again from its managed copy.
3. Temporarily granted full video read permission and replaced B with fixture A.
   The media row remained ID 2. It stored canonical ID `50`, filename
   `PRE001H_5554_20260921_0700_A.mp4`, album `Download`, duration 2,000 ms, and null
   creation time because MediaStore reports zero. The replaced B managed copy was
   removed; no original gallery asset was deleted.
4. Created one disposable duplicate A in a distinct gallery directory with the
   same canonical filename and duration. Verified its exact MediaStore row 103,
   then removed only the newly created managed A copy to trigger repair. After
   cold start, set 5744 showed **The linked video is unavailable.** Stored ID 50
   did not break the tie, and the row/set remained present.
5. Deleted only the verified disposable duplicate and its empty directory. A new
   cold start found the unique canonical A, copied its content URI into a new
   managed file, and rendered the correct A fixture. Media row ID 2 and its
   original linked timestamp were retained.
6. Unlinked the test video through the app. Set 5744 returned to **No video linked
   to this set.** Normal unlink semantics retain the physical copy; the organiser
   verified that the test-owned copy was unreferenced and removed that exact file
   as test cleanup.

## Preservation

Exact ordered rows in all 15 app tables match the pre-notes baseline after unlink;
integrity is `ok` and foreign-key violations are empty. The original managed copy
is the only remaining file in `set-videos`. Original gallery A/B metadata and
SHA-256 values are unchanged. Temporary gallery row 103 and its file are gone.

The original grants were restored: `READ_MEDIA_VIDEO=false` and
`READ_MEDIA_VISUAL_USER_SELECTED=true`, with the recorded flags unchanged. The
app was left force-stopped, the temporary Metro was stopped, and reverse port 8084
was removed. Existing 8081/8082 mappings were not changed.

Evidence is retained under `.codex-artifacts/mvp-gallery-integration-20260922/`:
UI XML, screenshots of picker/B/repaired A, database archives at each significant
stage, `database-comparison.json`, gallery enumeration, and native logs. The
pre-test exact-row baseline is
`.codex-artifacts/mvp-notes-native-20260922/before-inspection/LiftingLog.db`.

## Acceptance boundary

The organiser accepts emulator attachment, replacement, cold-start persistence,
canonical acquisition with full access, ambiguity rejection, unique rediscovery,
stable media-row identity, and unlink behavior. Host tests additionally cover
unreadable/over-limit/incomplete scans, duplicate content with missing metadata,
rejected stored URIs, and empty restored URIs.

Both profiles pass 60 suites / 609 tests after the gallery and restore-design
proof merge. Physical-device permission behavior and performance, a release
binary, and integrated replacement-restore reconciliation remain separate gates.
