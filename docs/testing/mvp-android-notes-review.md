# Android notes integration review

Date: 2026-09-22. Organiser review of integrated note-editor source `a550a8a`
(main `a550e7d` adds documentation only), MVP profile, existing SDK 57 x86_64
development client on `emulator-5554`. The physical phone was not connected.
This is the notes integration gate, not final release or backup/restore acceptance.

## Evidence

Local archives, UI hierarchies and a reviewed screenshot are retained in
`.codex-artifacts/mvp-notes-native-20260922/`. The app was force-stopped before
each DB/WAL/SHM archive; inspection opened extracted copies only.

Before archive SHA-256:
`D7305B3A5DBCB8C51B71B4315F14A579FA9B6959A9C3520C3AC363D0EC86F1FC`.

The existing fixture uses workout 728, in-progress exercise entry 729 and set
5741. All three note fields were initially null. No exercise completion or set
mutation was requested during this review.

## Observed behavior

- The canonical entry route loads separate Workout Note and Exercise Entry Note
  fields. Saving each writes its intended row; both values are visible in the
  copied database.
- Android hardware Back with a newer unsaved workout draft presents the discard
  confirmation. Discard returns without writing the draft.
- Both saved notes reload after a force-stop and cold app launch. The first
  attempted restart capture preceded app readiness; it is not evidence. The later
  `cold-restart-editor.xml` capture contains both saved values.
- The workout-day screen displays the workout note on both entries sharing that
  workout, and the entry note only on entry 729. The In Progress label remains.
- Editing the entry note from the day screen and returning refreshes its displayed
  value. An early tap sequence did not submit the save and instead triggered the
  unsaved-note prompt; Keep Editing followed by the observed Save action completed
  the edit. `day-refreshed.xml` and `day-refreshed.png` record the successful result.
- Exercise History also displays the workout and entry note on the correct entry.
  The recording tab loads the same entry note.
- Clearing and saving the workout note through the editor writes null. Clearing
  the entry note in the recording screen and moving focus saves null; returning
  to History removes both note blocks. The entry remains in progress.

After clearing the synthetic values, exact ordered rows in **all 15 app tables**
equal the before snapshot. `integrity_check` is `ok`, the foreign-key check is
empty, and counts remain 4 exercises, 734 workouts, 735 entries, 5,744 sets and
one media row. `comparison.json` records the equality and saved/cleared notes.
The app was left force-stopped with its original data restored through the UI.

## Acceptance boundary

Combined with the earlier [set-note review](mvp-android-media-review.md) and the
real-SQLite and component tests, this accepts the integrated notes save/display/
clear/restart behavior on this emulator. Both profiles pass 58 suites / 578 tests;
typecheck passes and lint has zero errors with 19 retained warnings.

Pending-save failures and stale-route races are covered by targeted automated
tests, not induced on this native run. Notes surviving replacement backup/restore,
the physical Android release matrix, and release-build verification remain later
gates. iOS remains deferred. No database snapshot was copied back over live data,
and no gallery or media row was changed.
