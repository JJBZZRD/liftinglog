# Replacement restore gate view testing

`ReplacementRestoreGate` is a provider-independent startup view. Its owner supplies the
current `DatabaseStartupSnapshot` and performs every action; the view never opens a
database, navigates, or locally changes startup readiness.

The focused test suite verifies that children mount only for the typed `ready` snapshot,
Android hardware back is consumed while blocked and cleaned up on transition or unmount,
and `restored` remains blocked after acknowledgement until the lifecycle owner supplies a
ready snapshot.

Blocked controls are derived from both the typed blocker and `allowedActions`. The view
only submits a trusted restore ID, and safe discard additionally needs the error recovery
token. The suite covers unchanged, committed, and unknown outcomes so the UI does not
claim that data is unchanged when the transaction outcome is uncertain.

For post-commit recovery, users explicitly scan the gallery or skip it. A scan receives an
`AbortSignal`; stopping it only ends video matching and leaves restored training data
committed. Synchronous per-restore locks prevent duplicate actions across progress
snapshots, while late completions after a state transition cannot surface an error in the
new state.

Run the focused suite in each release profile:

```powershell
$env:EXPO_PUBLIC_RELEASE_PROFILE = "full"
npx.cmd jest --runInBand --selectProjects unit --runTestsByPath __tests__/app/replacement-restore-gate.test.tsx
$env:EXPO_PUBLIC_RELEASE_PROFILE = "mvp"
npx.cmd jest --runInBand --selectProjects unit --runTestsByPath __tests__/app/replacement-restore-gate.test.tsx
```
