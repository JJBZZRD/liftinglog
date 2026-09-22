# Android restore native prerequisite testing

This integration supplies two Android-only prerequisites for a future replacement restore:

- `AppProcessIdentity`, which exposes one process-lifetime `process-v1:<UUID-v4>` token;
- `RestoreControlStore`, which synchronously reads, atomically replaces, and deletes the fixed
  `pending.json` and `outcome.json` control records.

It does not schedule or apply a restore, touch a database, add a route, or enable iOS restore.
Replacement restore must replace current application data; it must never merge the candidate into
the live database.

The JavaScript read facade reports an unavailable bridge as `{ status: "unavailable" }`, separately
from `{ status: "absent" }`. A future restore engine must treat `unavailable` as fail-closed whenever
pending state could exist; it must never reinterpret it as proof that no pending record exists.

## Control-store contract

The native store accepts only `pending` and `outcome`. They map to
`filesDir/restore-control/pending.json` and `filesDir/restore-control/outcome.json`; callers cannot
supply paths. Each record must be a JSON object encoded in at most 256 KiB of UTF-8. Native code
checks only that bounded envelope and returns the exact string. It uses Gson 2.13.2's streaming
`JsonReader` with `Strictness.STRICT`, requires `BEGIN_OBJECT`, consumes that value with
`skipValue()`, and then requires `END_DOCUMENT`. This rejects comments, single quotes, unquoted
names, alternate separators, non-RFC escapes, case-variant literals, malformed numbers, and trailing
input without materializing a model or rewriting the string. A narrow lexical guard rejects raw C0
control characters inside strings and byte-order marks outside strings because Gson 2.13.2 strict
mode still accepts those forms. JavaScript restore code remains responsible for manifest version,
state, field, and relationship validation.

The Android platform JSON APIs were reviewed before adding Gson. `org.json.JSONTokener` is
intentionally lenient. The installed Android 36 `android.util.JsonReader` source still accepts
non-JSON escape forms, case-insensitive `true`/`false`/`null`, and malformed number forms even with
`setLenient(false)`, so it cannot enforce this control-record boundary. The app pins Gson directly
rather than relying on Expo's transitive versions: before the pin, the resolved debug graph supplied
Gson 2.13.2 while release supplied 2.8.6. The production helper has a focused native JVM regression
suite that executes the same parser and lexical guard used by reads and writes.

All operations share the `RestoreControlStore` object monitor. This supplies mutual exclusion among
threads in the application process, as Android's `AtomicFile` requires. It is not a multi-process
lock. No second Android process may access these files without a separately reviewed lock protocol.

Writes use `AtomicFile.startWrite()`, write and flush the bytes, and explicitly call
`FileDescriptor.sync()` so a data-sync failure is observable before publication. They then call
`AtomicFile.finishWrite()`, which closes and publishes the `.new` file through the library's atomic
replace contract. The atomic rename performed during `finishWrite()` is the successful write's
linearization point. The bridge reports success only after reopening through `AtomicFile` and
verifying the published bytes exactly. A synchronous native write returns `true`; the JavaScript
facade treats any other acknowledgement as failure.

If an error occurs before `finishWrite()` returns, the implementation calls `failWrite()` to close
the stream and discard the unpublished `.new` file. If the native call still reports an error after
publication may have occurred, the state is uncertain: the restore engine must reread and fail
closed. The implementation does not claim proof against every power-loss mode. In particular, this
ticket does not measure device-specific storage behavior or prove a parent-directory fsync.

Reads use `Os.lstat()` so `ENOENT` is the only evidence of absence. Access errors, symlinks, a
non-directory `restore-control` path, non-regular associated files, a committed file that disappears
before open, invalid UTF-8, invalid JSON, and oversized content return `unreadable`, never `absent`.

`AtomicFile` recovery is interpreted as follows:

- base file plus orphan `.new`: the base is the last published record; `openRead()` follows the
  library recovery behavior and ignores/removes the unpublished staging file;
- legacy `.bak`: it is a committed candidate and `openRead()` lets `AtomicFile` recover it;
- lone regular `.new` with no base or `.bak`: the first write never reached `finishWrite()`, so no
  record was published and the result is `absent`; a later write overwrites that staging path and an
  explicit delete removes it;
- malformed metadata or inaccessible base, `.new`, `.bak`, or parent state: the result is
  `unreadable`.

Deletion calls `AtomicFile.delete()` and then verifies that the base, `.new`, and legacy `.bak`
paths are all gone. A native delete returns `true` only after that check; otherwise the JavaScript
facade throws.

## Checked-in verification

From the repository root, run:

```powershell
node .\scripts\sync-android-restore-native.js
node .\scripts\verify-android-restore-native.js
npm.cmd test -- --runInBand --runTestsByPath `
  __tests__/native/appProcessIdentity.test.ts `
  __tests__/native/restoreControlStore.test.ts `
  __tests__/config/restoreNativePlugin.test.ts
npm.cmd run typecheck
npm.cmd run lint
.\node_modules\.bin\eslint.cmd `
  lib/native/appProcessIdentity.ts lib/native/restoreControlStore.ts `
  plugins/withAndroidRestoreNative.js scripts/sync-android-restore-native.js `
  scripts/verify-android-restore-native.js `
  __tests__/native/appProcessIdentity.test.ts `
  __tests__/native/restoreControlStore.test.ts `
  __tests__/config/restoreNativePlugin.test.ts --max-warnings=0
Set-Location android
.\gradlew.bat :app:testDebugUnitTest --tests `
  com.anonymous.LiftingLog.restore.RestoreJsonEnvelopeTest
.\gradlew.bat :app:compileDebugKotlin
.\gradlew.bat :app:dependencyInsight --dependency com.google.code.gson:gson `
  --configuration debugRuntimeClasspath
.\gradlew.bat :app:dependencyInsight --dependency com.google.code.gson:gson `
  --configuration releaseRuntimeClasspath
```

The Android JVM suite executes the production strict JSON-envelope helper and covers known lenient
syntax, invalid escapes, case-variant literals, malformed numbers, trailing input, non-object roots,
raw string controls, an out-of-string byte-order mark, and valid nested and Unicode objects. The Jest
tests use native-module mocks; they prove facade validation and plugin synchronization. Neither suite
proves Android process lifetime, filesystem recovery, or device durability.

## Coordinated Android runtime proof

Run this only on a reviewed debug build. Record the device/emulator API level, build SHA, commands,
tokens with their UUID bodies redacted consistently, observed PIDs, record reads, and file listings.
Do not report this proof from the Jest mocks.

### Process token

1. At a temporary debug-only invocation point, print `getNativeProcessToken()` and confirm it is a
   canonical lowercase `process-v1:` UUID-v4. Call it twice and record token A.
2. Trigger Fast Refresh, call it again, and require token A.
3. Call Expo `reloadAppAsync()`, call the facade after the JS reload, and require token A. This
   confirms that a JS reload is not a process restart.
4. Record `adb shell pidof com.anonymous.LiftingLog`, then run
   `adb shell am force-stop com.anonymous.LiftingLog`. Require `pidof` to return no process.
5. Relaunch the reviewed build, record its new PID, and require a valid token B different from A.
6. Repeat a real force-stop/relaunch and require token C different from A and B.
7. On an unsupported build/platform, and with temporary malformed native return values, require the
   facade to return `null` rather than inventing a time- or PID-based token.

### Atomic old/new recovery

Use only small synthetic JSON objects. Never put a database or video in this store.

1. Through a temporary debug-only caller, delete both records and require `absent`. Write an `old`
   pending object, read it back exactly, and inspect private state with
   `adb shell run-as com.anonymous.LiftingLog ls -la files/restore-control`.
2. With Android Studio or JDB over ADB JDWP, place a breakpoint in `RestoreControlStore.write()`
   after the new bytes have been written and `FileDescriptor.sync()` has returned, but before
   `finishWrite()`. Start a write of a distinct `new` object. While suspended, force-stop the process
   and verify it is gone.
3. Relaunch and read `pending`. Require the exact `old` object. Inspect the directory and confirm an
   orphan staging file cannot be interpreted as the new committed record.
4. Delete `pending`, then repeat the breakpoint/force-stop on the first write. Relaunch and require
   `absent`; a lone `.new` is an unpublished first attempt.
5. Write `old` again. Move the breakpoint to immediately after `finishWrite()` and start the `new`
   write. Force-stop while suspended, relaunch, and require the exact `new` object.
6. Repeat for `outcome`. Also inject malformed UTF-8/JSON, an oversized file, an inaccessible path,
   and a non-directory `restore-control` parent in the debug sandbox; require `unreadable`, not
   `absent`.
7. Delete each record and verify the base, `.new`, and `.bak` paths are gone. Make one associated
   path undeletable in the debug setup and require delete to throw rather than report success.

The organiser coordinates this runtime exercise after the reviewed build exists. Until its evidence
is captured, Android runtime behavior remains an acceptance gate rather than a completed proof.

## References

- [React Native Android native modules](https://reactnative.dev/docs/legacy/native-modules-android)
- [Android `AtomicFile`](https://developer.android.com/reference/android/util/AtomicFile)
- [Gson strictness troubleshooting](https://github.com/google/gson/blob/main/Troubleshooting.md#malformed-json-not-rejected)
- Installed RN 0.86 synchronous-method validation:
  `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/internal/turbomodule/core/TurboModuleInteropUtils.kt`
