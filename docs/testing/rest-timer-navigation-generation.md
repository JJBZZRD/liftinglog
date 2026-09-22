# MVP-006B2E rest-timer navigation generation

## Implemented boundary

Android now owns a durable rest-timer navigation generation in the fixed app-private
record `rest-timer-registry/navigation-generation.json`. The record has exactly two
fields, `version` and `generation`, and accepts only
`timer-nav-v1:<lowercase UUID-v4>`. Physical absence is reported as the legacy
`null` state. Invalid UTF-8, malformed or extended JSON, non-regular paths,
unresolved `AtomicFile` recovery files, failed publication, and failed readback all
fail closed.

The generation record reuses the registry's bounded `AtomicFile` implementation.
Its internal filename selector contains only `registered-timers.json` and
`navigation-generation.json`; callers cannot supply a path. The generation store
has no delete operation. Timer completion, cancellation, registry emptying, and
ordinary cleanup therefore cannot remove a published generation.

`getRestTimerNavigationGeneration()` is a blocking synchronous native bridge read.
The TypeScript facade accepts only exact acknowledgements:

- `{ status: "available", generation: null | canonicalGeneration }`
- `{ status: "unreadable", code: nonEmptyString }`
- `{ status: "unavailable" }`

Missing platforms or methods return `unavailable`. Native exceptions and invalid
acknowledgements return `unreadable`; neither case becomes the legacy `null` state.

## Lock and retirement ordering

Every countdown or completion content intent receives a generation captured at the
start of its manager operation, under `operationLock`. Capture happens before the
operation registers, removes, or otherwise changes timer state. A true legacy read
omits `navigationGeneration`; every non-null read appends it to the ACTION_VIEW URI.
A completion notification retains that captured value after its registry row is
removed.

Replacement-restore retirement uses the same lock and performs these steps:

1. generate a new UUID-v4 generation;
2. atomically publish it and verify a strict semantic readback;
3. cancel every registered alarm;
4. remove the timer registry;
5. clear process timer state;
6. clear displayed notifications.

An old receiver that finishes before retirement can only publish an old-generation
link, which `cancelAll()` then removes. A receiver that enters after retirement
cannot pass the existing exact registry identity check. A receiver waiting during
retirement observes the removed registry after acquiring the lock. This preserves
the existing no-recreation proof without adding generation to persisted timer rows.

If generation publication fails, retirement never starts. If a later retirement
step fails, the new generation remains authoritative and retry publishes another
new generation before retrying retirement. The restore lifecycle must still drain
JS native calls and suspend timer scheduling before invoking retirement; this
ticket does not change that lifecycle contract.

## Verification

The focused tests cover physical legacy absence, repeated reads, recreation of the
generation store, empty-registry and repeated rotation, strict stale/current/missing
matching, completion after registry removal, malformed records, injected
inaccessible/recovery failure propagation, failed readback, failed retirement, and
retry ordering. The generation record reuses the same production path inspection,
AtomicFile recovery, bounded-read, fsync, and raw readback implementation already
covered by the registry tests; the static integration tests verify that routing.
Adapter tests cover all valid acknowledgement variants, thrown reads, missing native
capabilities, non-canonical generations, and extra or missing fields. Static native
integration tests and the verifier prove canonical/generated parity, the two fixed
record names, synchronous bridge exposure, capture-before-mutation ordering, URI
stamping, and rotation-before-retirement.

This prerequisite does not add the future `+native-intent` consumer, change an
Activity, or provide device/process-recreation or physical-path recovery acceptance
evidence.
