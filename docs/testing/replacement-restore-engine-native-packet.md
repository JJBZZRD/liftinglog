# MVP-006B5P Android engine diagnostic packet

Organiser preparation, 2026-09-22. Do not dispatch until the final B5 engine is
independently accepted and integrated. This is a non-shipping diagnostic branch,
not a new production persistence path or evidence of root startup integration.

## Objective and scope

Exercise the accepted production preparation, scheduling, synchronous replacement
and committed-control retry against actual Expo SQLite and native control/hash
facades on the fresh synthetic Android AVD. Own only a development-only
`app/restore-engine-probe.tsx` route and `docs/testing/restore-engine-probe.md` in
one separate worktree pinned to the accepted engine integration SHA. Never merge
this branch. No production file, dependency, native or app configuration edits.

Read AGENTS.md, DB ground truth/access patterns, the engine packet/implementation
notes, shared restore contract and native control/hash facades. Reuse the actual
engine facade for uninstrumented checks. A separately labelled fault mode may
instantiate its production runtime with the real platform dependencies and a
minimal throwing wrapper; it must not reimplement transaction or control logic.

## Isolation and controls

- No automatic mutation on import, render, focus or mount. Require `__DEV__` and
  Android for every action, not only the visible route. Production renders an
  unavailable message and performs no work.
- Operate only on explicitly named probe SQLite files in a unique private probe
  directory. Never open, copy, hash, query, seed or replace `LiftingLog.db`.
  Use an explicit supplied scratch live handle. Source fixtures are independently
  opened/bootstrapped and closed before preparation; no provider original opens.
- Refuse fixture initialization if the chosen probe files already exist. Refuse
  scheduling unless both physical control records are positively absent. Unknown,
  unavailable, malformed or unrelated records never become permission to overwrite.
- Do not log native process tokens or entire records. Show process equality/difference,
  restore ID, operation status, counts, hashes and bounded errors. Keep tokens in
  memory/UI only as required for comparison.
- Serialize buttons, report errors without unhandled promises, and do not offer
  unsafe cancellation after attempting/commit/ambiguity. No fake reload-as-cold-start
  shortcut: display the actual native process identity status.
- Cleanup is a distinct manual action, limited to demonstrably probe-owned records
  with the matching saved restore ID and probe files whose handles have closed.
  Never remove a pending candidate to escape an ambiguous result. Never delete any
  gallery/managed video or unrelated directory. Retain evidence on uncertainty.

## Required diagnostic actions and evidence

1. Build populated source and different populated scratch live fixtures using the
   production bootstrap. Include exercise IDs/UIDs, workout/entry/set notes,
   program hard/soft links, media metadata with a deliberately unusable stored URI,
   and live-only rows. Also support a separate empty-source run. Record all fifteen
   table snapshots and integrity/FK/soft-link checks through the explicit handles.
2. Prepare through the actual facade with an explicit probe source URI. Display
   the summary and verify the original source hash is unchanged. No source or live
   fixture is silently recreated when an expected file is missing.
3. Schedule under process A, then test same-process apply and a real JS reload:
   both must report restart required without changing scratch live rows. Reopen
   the existing scratch handle without bootstrap before each apply attempt.
4. After the organiser force-stops/restarts the synthetic app, cold process B may
   apply. Show exact candidate replacement, removed live-only rows, preserved IDs,
   UIDs/notes/links, cleared media URIs and canonical PB counts. Compare all fifteen
   tables against fixture expectations, accounting only for derived PB rebuilding.
5. Label fault runs separately from the uninstrumented run. Inject a throw after
   the real COMMIT returns, and an outcome-write or pending-delete failure. Keep
   the real production transaction/native facades under the wrapper. Show unknown
   commit stays blocked; a same-process reload cannot reapply; later cold C can
   reapply valid pending. Controls-only finalization retry must perform no second
   SQL replacement, demonstrated by a transaction-call counter.
6. Confirm the candidate can detach/close on the actual Expo handle and staging is
   retained until verified pending retirement. Record missing/changed-candidate
   behavior without opening a new empty file or changing live data.

The root organiser runs the diagnostic only on `WorkoutLogRestoreSynthetic`, ADB
server 5038, serial `127.0.0.1:5557`; the original populated emulator and physical
phone are outside this packet. The worker does not run ADB or operate devices.
Root preflight confirms AVD identity and absence/ownership of controls. This probe
does not prove pre-provider startup ordering, actual Router stale-link containment,
media completion or physical-device release acceptance; those remain later gates.

Handoff: exact commit and clean worktree, two changed files, button sequence,
expected statuses, fixture ownership/cleanup details, TypeScript/scoped lint/diff
results, assumptions and limitations. Do not merge, push or expand scope.
