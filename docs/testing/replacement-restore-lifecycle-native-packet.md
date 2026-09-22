# MVP-006B6P integrated Android lifecycle diagnostic

Organiser preparation, 2026-09-22. Dispatch only after the B6 production candidate
has passed source review. Pin that exact candidate and its accepted media service;
do not introduce a stub facade or duplicate startup implementation. This is a
separate non-shipping branch, never a production route or release feature.

## Objective and isolation

Prove that the actual app lifecycle performs replacement before ordinary providers
and navigation, and that its gate controls cancellation, restart, media completion
and acknowledgement on Android. The earlier passed-handle engine diagnostic is
accepted, but deliberately did not operate on the application's live handle.

Operate only on the fresh `WorkoutLogRestoreSynthetic` AVD, ADB server 5038,
serial `127.0.0.1:5557`. The organiser verifies this identity before every session.
Unlike B5P, this explicitly authorises replacement of the **synthetic AVD's**
`LiftingLog.db` through the reviewed production lifecycle. It does not authorise
access to the original populated emulator or physical phone. Record the APK,
bundle SHA/profile and synthetic baseline before mutation. Never clear app data
to escape a blocked or ambiguous restore.

The worker owns only `app/restore-lifecycle-probe.tsx` and
`docs/testing/restore-lifecycle-probe.md` in an isolated diagnostic worktree.
No production, native, dependency or configuration edits. No automatic mutation
on module import, render or mount. Every operation requires Android, `__DEV__`,
an explicit user action and synchronous operation ownership. Root alone runs ADB.

## Production boundaries

- Consume the real lifecycle and its actual connection bindings. Preparation uses
  the accepted service; scheduling uses only
  `scheduleReplacementRestoreAndBlock`. Never invoke the raw scheduler, startup
  apply, completion engine or control-write API from the probe. The production
  root gate owns every blocked/postcommit/restored action.
- Create independent, explicitly named source fixtures in a unique private probe
  directory; close their handles before preparation. Refuse existing fixture
  names, unknown directory contents and pending/outcome ambiguity. Do not create
  or overwrite a source when a previously owned file is unexpectedly absent.
- A populated source includes all 15 tables, fixed IDs/UIDs, the three note levels,
  settings distinguishable in the UI, valid program hard/soft links and media
  metadata with an unusable URI. The empty source has zero rows in all 15 tables.
  Include different live-only rows in the synthetic app through an explicit setup
  action, only while the real lifecycle is ready and controls are absent.
- Save a bounded versioned ownership receipt before scheduling: fixture identity,
  source hash, expected summaries and pre-schedule synthetic baseline. Do not
  assume the route remains mounted long enough to save evidence after scheduling;
  closing the gate is expected to unmount it. Correlate the published restore ID
  from the actual gate/native record without claiming ownership of unknown state.
- Inspect through the published real handle only when ready. Show expected versus
  actual snapshots/counts for all 15 tables, integrity/FK/soft-link status, media
  URI disposition and canonical PB results. Do not mutate restored rows merely
  to make assertions pass. Distinguish normal defaults after an empty restore
  from rows reintroduced by an incorrect bootstrap or development seed effect.
- Errors remain bounded and visible. No complete process tokens or control JSON
  in logs. Do not offer a diagnostic control deletion or force-unblock action.
  Cleanup is explicit and limited to verified owned source/receipt files after
  handles close and pending absence is proven. Preserve ambiguous evidence.

## Organiser execution sequence

1. Capture the synthetic baseline and prove ordinary MVP readiness. Prepare a
   populated source without changing live rows. Cancel preparation and verify
   unchanged live data; then prepare again through the same actual service.
2. Schedule in process A. The ordinary screen must unmount and the production gate
   must show restart required. A real JS reload in A must remain gated. Back,
   ordinary deep links and stale timer targets cannot reveal normal providers.
3. Exercise the gate's safe scheduled cancellation. Its controlled reload must
   initialise a no-pending app without releasing the old instance locally. Verify
   unchanged training rows; repeat preparation/scheduling for the committed case.
4. Force-stop/restart to B. Observe the production postcommit gate before ordinary
   app UI. Use explicit skip, then acknowledge the actual result. Inspect the
   restored rows, removed live-only rows, notes/links/PBs and cleared media URI.
   Verify restored theme/units/formula on the first allowed ordinary UI mount.
5. Repeat with an empty source. Verify the engine's zero-row result and legitimate
   getter/default behavior after the gate releases; no historical rows return.
6. For process-death media evidence, stop after the real postcommit gate, then
   cold-start again. The gate offers a fresh explicit scan/skip; no old candidate
   media ID or automatic gallery permission request is replayed. Complete and
   acknowledge through the production UI.
7. Exercise actual native timer links before scheduling, while blocked, after
   acknowledgement, after JS reload and after process recreation. Use a known
   synthetic exercise ID reused by restore. Old/malformed generation links never
   open the restored exercise; valid current completed-timer taps and unrelated
   links remain usable. Record native initial and warm delivery separately. A
   DevLauncher failure to deliver a cold raw scheme is a limitation, not a pass.
8. Integrated gallery scan/playback, denied/limited access and SAF filename/MIME
   round trip may follow the Settings integration on the same reviewed production
   source. Existing engine fault injection need not be reimplemented in this probe.
   Exact untested native kill points remain explicit release obligations.

The actual Settings picker flow is a separate D3 integration check. This probe
does not replace it, a release-binary cold-link check, or physical-device media
permission/performance acceptance. iOS remains deferred.

Handoff: exact clean commit, two-file diff, TypeScript/scoped lint/diff results,
fixture/receipt ownership, precise button sequence and expected assertions,
remaining limitations. No worker merge, push, device operation or scope expansion.
