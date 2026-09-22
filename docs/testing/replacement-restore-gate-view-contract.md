# MVP-006D2 standalone restore gate view

Organiser contract, 2026-09-22. This ticket implements only the provider-independent
view used by the later lifecycle owner. It does not open, schedule or restore a
database, connect Settings, subscribe to startup state, or mount the real router.

`components/ReplacementRestoreGate.tsx` exports a default component with props:

```ts
type ReplacementRestoreGateProps = {
  snapshot: DatabaseStartupSnapshot;
  performAction: (action: DatabaseStartupAction) => Promise<void>;
  children: React.ReactNode;
};
```

Use the frozen types in `lib/db/replacementRestoreContract.ts`. Import them with
`import type`; do not import a DB, native module, lifecycle service, provider,
router, or a component that consumes those dependencies. Reuse React Native
primitives and the existing class-based action-button pattern; no dependencies.
The later integration owner supplies stable singleton actions and snapshots.

Only `phase: ready`, with its typed readiness flags true, renders children. Every
other phase excludes children completely, including `restored` until a matching
acknowledgement is processed by the lifecycle owner. While blocked, consume
Android hardware back without navigating. Remove the listener on ready/unmount.
Do not imply this proves OS initial-URL containment; that remains an integration
gate with the actual Expo Router.

Show plain user-facing states: checking restore; full-close-and-reopen instructions;
safe failure recovery; unknown-state/manual recovery; committed completion pending;
gallery scan or explicit skip; and final result with unresolved attachments and
warnings. Clearly distinguish unchanged, committed, and unknown data outcomes.
Never display a successful restore before `restored`, or imply that a JS reload
performs the required cold process start. Do not expose raw control paths/tokens.

For `blocked`, offer only allowed actions compatible with that blocker and its
trusted restore ID. Safe discard additionally requires its recovery token. Do not
construct an action from a missing ID/token or show impossible combinations merely
because an inconsistent `allowedActions` array lists them. The engine revalidates
all actions independently. Cold-close instructions are text, not a fake restart
button. No generic dismiss or Continue action bypasses a blocked state.

For `postcommit`, offer explicit scan or skip for the current restore ID when idle.
An ongoing scan can be stopped through its supplied AbortSignal; this is stopping
video matching, not cancelling restored training data. Do not start scan/skip from
a render or effect. For `restored`, Continue sends `acknowledge_completion` for the
result's restore ID; it never locally releases children.

Prevent double actions synchronously before the first promise settles. Attribute
pending UI/errors to the current snapshot/restore ID and ignore stale completion
after transition or unmount. An error must remain visible and must not open the
gate. Keep an in-flight same-restore operation locked across progress snapshots;
new snapshot identity alone is not permission to submit another operation.
Action ownership and remount safety ultimately belong to the lifecycle owner.

Write scope: the one component, `__tests__/app/replacement-restore-gate.test.tsx`,
and `docs/testing/replacement-restore-gate-view.md`. No other production edits.
Tests must prove child mount counts, readiness transitions, allowed-action guards,
typed payloads, unchanged/unknown/committed copy, double tap and stale async error
handling, back cleanup, final acknowledgement, and media-abort semantics. Run the
focused suite in both profiles, TypeScript, scoped lint and `git diff --check`.
