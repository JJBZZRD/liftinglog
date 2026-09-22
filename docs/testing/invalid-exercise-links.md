# MVP-002F invalid exercise links

Organiser acceptance, 2026-09-22. Candidate `4a1b968` was independently reviewed
and exact-tree integrated as `5cd72ee`. Both-profile targeted checks pass five
suites / 39 tests, including real modal gating, malformed/missing IDs, lookup
errors/retry, stale lookup completion, focus/blur/unmount initialization ownership,
queued note durability and cold-link Back fallback. No DB helper or schema changed.

The organiser replayed the earlier native notification-shaped missing ID on the
fresh `WorkoutLogRestoreSynthetic` AVD (ADB server 5038, serial 127.0.0.1:5557).
Source was integrated `5cd72ee`, MVP profile, localhost Metro 8084. Installed
native APK SHA-256 remained
`EB65E5D9CC3FA3A3605CC0E9294D6C366BF60822EFAFC38415BACDFF4A97D9D8`;
this ticket changes JavaScript only.

- Warm `liftinglog://exercise/1900012?tab=record&source=notification&timerId=MVP002F-check`
  shows “This exercise is no longer available.” and Back, with no logging controls.
- Warm `liftinglog://exercise/1abc` shows “This exercise link is invalid.” and Back.
- Back from both cases returns to the functioning Overview screen. The earlier
  foreign-key error did not recur; this run's filtered Metro log contains no error
  events. No database before/after count claim is made by this UI-only check.
- A raw cold custom-scheme launch entered Expo DevLauncher rather than executing
  the JS route. Actual cold standalone-build behavior remains release-matrix work;
  the no-history Back fallback has host regression coverage, not a claimed native
  cold-launch pass.

Evidence: `.codex-artifacts/restore-synthetic-avd-20260922/` contains
`mvp002f-malformed-link.xml`, `mvp002f-missing-link.xml` and
`mvp002f-native-session.log`. The app was force-stopped and owned Metro stopped
after the check. Original populated-emulator data and the phone were untouched.

This guards invalid/missing catalog identities; it does not prove that an old
timer link cannot target an ID reused by restore. That separate generation and
actual Router obligation remains in MVP-006B6.
