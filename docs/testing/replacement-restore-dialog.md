# Replacement restore dialog checks

`__tests__/app/replacement-restore-dialog.test.tsx` exercises the standalone preparation and confirmation UI using only mocked `ReplacementRestoreService` and `ReplacementRestoreLifecycleFacade` props.

The focused test covers unavailable platforms, picker cancellation, preparation aborts, stale progress callbacks, hide/show while preparation is held, late ready-token cleanup on external close and unmount, retryable cleanup failures, confirmation totals, synchronous preparation and scheduling double-tap protection, and the scheduling cancellation boundary. It verifies that a post-publication schedule result remains restart-required, while an unproven scheduling failure stays separately blocked rather than being reported as scheduled, cancelled, or restored.

This component does not run a device picker, open a database, schedule a native restore, or restart the app. Native process gating and committed-result rendering remain the responsibility of the future root integration gate.

Preparation and cleanup ownership are scoped to the identity of the stable discardPreparedRestore function, rather than to a component instance or the enclosing service object. The future Settings integration must supply singleton service functions for the dialog lifetime. A remounted dialog remains blocked while an earlier preparation has not settled, and a failed discard retains its token until one explicit retry; the dialog never retries cleanup in the background.
