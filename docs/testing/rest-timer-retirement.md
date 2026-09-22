# Rest-timer retirement verification

The Android rest-timer native module exposes
`retireRestTimerArtifactsForReplacementRestore()`. The call succeeds only after
all persisted timer alarms have been cancelled, the versioned registry has been
durably removed, the in-process timer cache has been cleared, and Android's
`NotificationManager.cancelAll()` has returned. The acknowledgement reports the
number of registry entries retired. Repeating the call is valid and reports zero
when no entries remain, while still clearing displayed app notifications.

Scheduled timers are written to a strict, bounded `AtomicFile` registry under a
dedicated app-files directory before the alarm is installed. Reads distinguish
physical absence from corrupt, unreadable, backup, or interrupted-write state;
writes are fsynced and reread byte-for-byte, and retirement verifies deletion of
the base, backup, and new files. Reads verify that `AtomicFile` recovery removed
the authoritative backup and orphaned new file before accepting base-file bytes.
Completion and countdown-dismiss broadcasts
must match the persisted `timerId`, `exerciseId`, and `endAt` exactly. Missing
registry state is treated as an upgrade/legacy absence and rejects delivery;
malformed state raises an error and does not post a notification.

Automated coverage is provided by:

- `__tests__/restTimerNotifications.test.ts` for the Android-only facade,
  acknowledgement validation, error codes, and repeat calls.
- `__tests__/config/restTimerRetirementNative.test.ts` for template/generated
  parity and checked native integration invariants.
- `RestTimerRetirementTest.kt` for the production registry logic across process
  recreation, stale identities, missing/invalid state, checked persistence,
  cancellation failures, and idempotent retirement.

Run the focused checks from the repository root:

```text
npm test -- --runInBand __tests__/restTimerNotifications.test.ts __tests__/config/restTimerRetirementNative.test.ts
npm run typecheck
npm run lint -- --no-cache lib/native/restTimerNotifications.ts __tests__/restTimerNotifications.test.ts __tests__/config/restTimerRetirementNative.test.ts
npm run verify:android-rest-timer-native
node scripts/verify-android-restore-native.js
android/gradlew.bat -p android :app:testDebugUnitTest --tests com.anonymous.LiftingLog.notifications.RestTimerRetirementTest
android/gradlew.bat -p android :app:compileDebugKotlin
```

These checks establish source, JVM, and compilation evidence. Device behavior
still requires a separate Android acceptance run: schedule timers, terminate the
process, invoke retirement after restart, then wait past each deadline and verify
that no old completion, countdown recreation, or reused exercise deep link is
delivered. Repeat with an already displayed completion and with legacy broadcasts
that omit or alter each identity field.
