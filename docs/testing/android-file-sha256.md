# Android native file SHA-256 implementation

MVP-006B4R routes `sha256FileSync` and `sha256File` through the `FileSha256`
native module on Android. Other platforms retain the existing incremental
`@noble/hashes` implementation. Android does not fall back when the native
module is absent or incompatible, because the JavaScript path is known to miss
the 256 MiB runtime budget under Hermes.

The native digest loop uses `java.security.MessageDigest` with `SHA-256` and a
single 64 KiB buffer. It opens only local `file:///` sources with
`FileInputStream`, compares the pre-open path and opened descriptor identity,
requires a regular file, reads the exact admitted size, probes EOF, and compares
the final descriptor and path identity and size. It never opens a writable
handle. These checks detect observed replacement, truncation, and growth; they
cannot prove the absence of concurrent same-size writes.

The synchronous bridge returns a success or error envelope so JavaScript can
validate every field without allowing a native exception to cross a blocking
bridge call. The asynchronous bridge uses two dedicated workers and a bounded
queue of two. Each request has a unique JavaScript-generated ID and one atomic
cancellation flag. `cancelSha256File` is a nonblocking Promise bridge method, so
React Native queues it behind the preceding `sha256FileAsync` admission on the
same native-method FIFO queue. The digest itself remains on the dedicated
executor. This prevents an immediate abort from overtaking and forgetting a job
that has not yet been admitted. JavaScript observes and validates the asynchronous
cancellation acknowledgement without settling the public abort until native hash
settlement has confirmed resource closure. Queued cancellation reaches the worker
before file open; running cancellation is checked between reads and immediately
before success. Invalidation marks all owned jobs cancelled, rejects new work,
and shuts the executor down after admitted jobs release their resources.

`FileSha256Test` exercises the production digest loop through its read-only
source seam. It covers empty, `abc`, multi-chunk, and 256 MiB vectors, the 64 KiB
read bound, invalid inputs, size changes, growth, truncation, read and close
failures, pre/mid/final cancellation, request isolation, queue admission, cleanup,
and invalidation. Jest covers native-module absence, malformed acknowledgements,
abort/result races, request IDs, listener cleanup, and canonical/generated native
source parity. The facade regression models an abort fired before queued native
admission and verifies FIFO submit/cancel ordering plus resource closure before
the public `AbortError` settles.

Run the focused verification with Java 17 and the Android SDK configured:

```powershell
$env:EXPO_PUBLIC_RELEASE_PROFILE='full'
npm.cmd test -- --runInBand --selectProjects unit --runTestsByPath __tests__/utils/fileSha256.test.ts __tests__/native/fileSha256.test.ts __tests__/config/fileSha256Native.test.ts
$env:EXPO_PUBLIC_RELEASE_PROFILE='mvp'
npm.cmd test -- --runInBand --selectProjects unit --runTestsByPath __tests__/utils/fileSha256.test.ts __tests__/native/fileSha256.test.ts __tests__/config/fileSha256Native.test.ts
npm.cmd run typecheck
node ./scripts/sync-android-restore-native.js
node ./scripts/verify-android-restore-native.js
./android/gradlew.bat -p android :app:testDebugUnitTest --tests com.anonymous.LiftingLog.restore.FileSha256Test
./android/gradlew.bat -p android :app:compileDebugKotlin
```

The independent review and the organiser's AVD performance, heartbeat, memory,
and abort probe remain integration gates. iOS runtime acceptance remains deferred.
