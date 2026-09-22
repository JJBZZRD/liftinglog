# MVP-006B6 lifecycle preparation review

Initial independent Sol/high read-only source review of `70bedfa`, followed by
organiser challenge of ordinary notification behavior and post-acknowledgement
restart cases. The preparation below led to the frozen implementation packet.

## First production checkpoint review

The lifecycle worker is now implementing B6. Independent Sol/high review of exact
checkpoint `1d82389801b16ae04ae631f2343602bab91c0c0d` found two P2 guard defects:
successfully parsed encoded timer markers could bypass classification, and blank
timer IDs/zero end times were accepted despite native producer invariants. Root
also found that a retained notification promise captured its navigation epoch at
resolution rather than request time, allowing an old response after a safe failed
schedule without provider unmount. These require corrections and dedicated tests
before acceptance; worker reports of local fixes do not close exact-SHA review.

A bounded cancellation UI limitation is retained under the current shared
contract. `restart_required` with unchanged data represents both an original
scheduled process and a same-process verified rollback. It has no discriminator
for cancellation eligibility. The gate can therefore offer cancellation after a
verified rollback, but the engine safely rejects it and normal use remains
blocked; full close/reopen is the valid recovery path. This is not a data-loss
bypass, and this ticket does not broaden engine results or parse manifests in the
lifecycle to infer permission. A future UI improvement needs an explicit reviewed
engine capability rather than weaker cancellation validation.

## Integration order and bounded ownership

Installed Expo Router 57.0.22 supports top-level `app/+native-intent.ts` and
`redirectSystemPath({ path, initial })`. `getLinkingConfig.js` invokes it before
native initial route state is created; `link/linking.js` invokes it for warm URL
events. This is the library seam to test, rather than relying on an unmounted
Stack to consume an old Activity intent.

The proposed lifecycle singleton imports a thin connection module, opens one
handle and applies PRAGMAs, calls the synchronous engine, and conditionally
bootstraps/constructs Drizzle before route creation. `+native-intent` and root must
share that singleton. A concrete initially unassigned `db` module live binding
can preserve query consumers' existing type; no dummy DB or successful placeholder
is allowed. The actual import graph must prove consumers remain inert while
uninitialized, including when a route module imports before the root layout.

Future bounded scope: `connection.ts`, new `replacementRestoreLifecycle.ts`, root
layout, `app/+native-intent.ts`, new router-independent
`lib/restTimerNavigationGuard.ts`, and the existing notification handler. Importing
the guard must not import Expo Router back into a lifecycle/+native-intent cycle.
Consume the accepted standalone gate, JS timer quiescence and native retirement.
Scheduling quarantines navigation synchronously, drains JS/native timer work,
retires native artifacts, schedules the engine, then publishes the blocked
snapshot before resolving. Failure to prove publication absence stays blocked.

## Native timer-link blocker

The first suggestion to rewrite every timer URL was rejected: custom Android
notifications use plain ACTION_VIEW and the Expo notification response hook is
not a replacement delivery source. Ordinary timer taps must remain functional.
An active registry lookup is also insufficient because completion removes its
registry row before posting the notification. Process-local suppression after
acknowledgement disappears on JS reload or process recreation, while an old
Activity/task intent can still name an ID reused by restored data.

The separate [MVP-006B2E native contract](rest-timer-navigation-generation-contract.md)
provides durable link identity. Do not dispatch lifecycle integration until this
seam is reviewed. No MainActivity edit is currently authorized by this ticket;
`setIntent` alone has no proven task-recreation guarantee.

## Required integration proof

- Actual root/provider/query imports in every blocked state: exactly one open and
  PRAGMAs, no ordinary bootstrap/Drizzle/provider reads, permission/channel work,
  timers, seeding or route mounts before readiness.
- Stable external-store snapshots, synchronous publication, and blocked state
  before schedule promise resolution. Failed retirement never calls scheduler.
- Cancel/discard reload initializes anew and cannot locally release a stale or
  uninitialized binding. Controls-only retry never calls SQL replacement.
- Actual Expo Router tests include `+native-intent`, native initial URL and warm
  events. Old timer links never mount reused exercise IDs after restore, after
  acknowledgement, after JS reload, or after process recreation. Valid ordinary
  and new-generation completion taps still navigate; ordinary other links survive.
- Clear/suppress retained Expo notification responses without treating them as
  the native ACTION_VIEW channel. Stale callbacks cannot navigate after quarantine.
- Both release profiles and actual Android proof; mocks alone cannot close the
  native task/intent obligation.

Media completion additionally waits for the engine ownership seam and explicit
scan/skip contract. The lifecycle layer does not write pending/outcome files.
