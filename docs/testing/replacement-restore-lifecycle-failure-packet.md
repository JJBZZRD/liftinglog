# MVP-006B6A lifecycle failure contract and gate

Organiser packet, 2026-09-22. This prerequisite addresses the independent B6
packet audit's missing representation for connection and infrastructure failures.
The organiser pins the current main SHA and an isolated worktree at dispatch.

## Objective and narrow scope

Add a truthful lifecycle failure blocker to the shared startup snapshot and render
it in the existing standalone gate. Implement no database opening, lifecycle,
timer, navigation, engine or Settings behavior. Existing restore results and
service signatures remain unchanged.

Allowed files: `lib/db/replacementRestoreContract.ts`,
`components/ReplacementRestoreGate.tsx`,
`__tests__/app/replacement-restore-gate.test.tsx`, and a bounded clarification in
`docs/testing/replacement-restore-startup-contract.md`. No other edits.

Read AGENTS.md, product facts sections 10-11, the shared contract, standalone
gate/tests and startup contract. Reuse the existing React Native gate and its
class-based theme styles; no new UI package, permission, dependency or provider.
Use codebase-memory first and exact source after documented graph misses.

## Supplied interface

Export `DatabaseLifecycleFailure` with readonly fields:

```ts
{
  status: "lifecycle_failed";
  stage: "open" | "pragmas" | "startup_engine" | "bootstrap" | "bindings"
    | "timer_cleanup" | "notification_cleanup" | "native_retirement"
    | "control_presence";
  restoreId?: string;
  liveDatabaseChanged: boolean | "unknown";
  recovery: "close_and_reopen" | "manual_recovery";
}
```

Export `DatabaseStartupBlock = RestoreStartupBlock | DatabaseLifecycleFailure`
and use it only as the blocked snapshot's `blocker` type. Keep
`RestoreStartupBlock`, the engine result union, error codes and every service or
action signature unchanged. Lifecycle failure is not an engine failure and must
not require inventing a restore ID or recovery token.

The future lifecycle producer owns honest change-state selection: a bootstrap
failure can follow partial migration and therefore cannot automatically claim
unchanged data; a known committed restore remains committed if subsequent
bootstrap fails. Do not infer outcome from stage names inside the gate.

## Gate acceptance

- Keep ordinary children unmounted and hardware Back blocked for lifecycle
  failure, with either `connectionInitialized` value and with/without restore ID.
- Render a plain "The app could not start safely" heading and brief outcome copy
  driven by the supplied change state. False may say current app data was not
  changed; true must acknowledge data changed without claiming restore completed;
  unknown must say the data outcome could not be confirmed. Do not expose raw
  SQL, native errors, stack traces or infrastructure stage names to users.
- `close_and_reopen` gives full-close/reopen guidance; `manual_recovery` gives
  recovery guidance without implying reset/delete or a safe cancellation.
- Show no action buttons for this blocker, even if a malformed caller supplies
  restore actions in `allowedActions`. No synthetic retry, cancel or discard.
- Include stage, `restoreId ?? "none"`, change state, recovery and
  `connectionInitialized` in the snapshot key so an error from
  an older action cannot be shown for a distinct lifecycle failure. Preserve all
  accepted restore-specific actions, scan/skip, acknowledgements and concurrency.

The future lifecycle producer must publish `allowedActions: []` for this blocker
and reject every startup action while it is current. Rendering no buttons is a
second defense, not action authorization. Independent Sol/high review accepted
this narrow contract with these snapshot-key and producer constraints.

## Required checks and handoff

Extend the actual gate tests for the new blocker across all change/recovery
states, both binding flags and absent/present IDs. Verify no children, provider
dependency or actions; existing restore-specific tests must still pass.
Run `npm.cmd test -- --runInBand --runTestsByPath
__tests__/app/replacement-restore-gate.test.tsx` separately with
`EXPO_PUBLIC_RELEASE_PROFILE=full` and `mvp`, then `npm.cmd run typecheck`, scoped
ESLint for the two production files/test and `git diff --check`.

One worker owns this ticket/branch/worktree. No merge, push or scope expansion.
Return exact commit SHA, changed files, implemented behavior, exact test results,
assumptions, remaining risks and scope confirmation. Rebase only conflict-free;
report cross-owner conflicts to the organiser. Root reviews before integration.
