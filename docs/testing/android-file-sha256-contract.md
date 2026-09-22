# MVP-006B4R Android streaming digest contract

Organiser contract, 2026-09-22. This corrects the maximum-file performance failure
in [the runtime checkpoint](android-file-sha256-runtime.md). It does not change
the restore size ceiling or enable the restore engine.

## Reuse and interface

Installed `expo-file-system` 57.0.7 exposes MD5 but no incremental SHA-256 file
digest. SDK 57 [Expo Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/)
digests take complete strings or buffers. Use Android's maintained
[`MessageDigest`](https://developer.android.com/reference/java/security/MessageDigest)
with SHA-256 and bounded file reads; do not implement a hash algorithm, upgrade
Expo, or add a third-party native crypto dependency for this correction.

Keep `sha256FileSync(uri, { maxBytes? })` and
`sha256File(uri, { maxBytes?, signal? })`, returning exactly a lowercase 64-character
SHA-256 and safe-integer byte count. The default ceiling remains 256 MiB and the
read buffer remains at most 64 KiB. The Android path must use the native module;
an absent or incompatible module rejects explicitly instead of silently using the
known slow implementation. Keep the existing maintained JS implementation for
non-Android compilation and its tests; iOS runtime is deferred.

Register `FileSha256` in the existing `RestoreNativePackage`, with canonical and
generated Kotlin parity. Native surface:

- `sha256FileSync(uri, maxBytes)` returns a validated result/error envelope.
- `sha256FileAsync(uri, maxBytes, requestId)` returns a promise for a result.
- `cancelSha256File(requestId)` signals cancellation without waiting behind the
  file hashing work. A small dedicated executor performs asynchronous reads.

The JS facade validates all success acknowledgements. Native code independently
validates URI and numeric inputs. Preserve the public file-URI, regular-file,
size-limit, exact-byte-count, EOF, and final-size checks. Read only; never create,
truncate, copy, or modify a source. Reject unsupported URI schemes, authorities,
directories, unreadable or missing files, premature EOF and growth. Compare the
opened descriptor and final path identity/size where Android permits; do not claim
that size checks prove the absence of arbitrary concurrent same-size writes.

## Cancellation and resource ownership

Each asynchronous invocation has a unique request ID. Cancellation before launch
does no native work. Cancellation after launch rejects with `AbortError` and no
digest; it settles only after native work has released its file descriptor. Check
cancellation between bounded reads and immediately before publishing success.
An abort racing a completed native result must not become JS success if the
signal is already aborted before settlement. Remove the JS listener on every
settlement. Cancellation must not affect another request or a later request.

Bound admitted native jobs and executor work. Reject excess work explicitly;
never create an unbounded queue or retain completed/cancelled request records.
Module invalidation cancels owned work and releases executor resources. Handle
submission failure and cancellation-before-admission ordering without leaked work
or a permanently pending promise. Preserve a primary I/O error if close also
fails; report a standalone close failure.

## Review and acceptance evidence

Test the actual production digest loop with known empty, `abc`, multichunk and
maximum-size data; invalid size/URI, growth/truncation, read/close failure,
pre/mid/final cancellation, concurrent request isolation, admission limits and
invalidation. Facade tests cover malformed acknowledgements, module absence and
abort/result races. Tests must not substitute a second hash implementation for
the production loop. Run targeted Jest in both profiles, TypeScript, scoped lint,
native sync/verifiers, focused JVM tests and `compileDebugKotlin`.

Independent specialist review is required before integration. The organiser
then reruns the existing non-shipping probe on the fresh synthetic AVD, including
all eight digest checks, maximum-size heartbeat/memory observation and abort.
Initial performance budget on a quiet debug AVD: each 256 MiB digest within five
seconds, async cancellation within one second, and async heartbeat gaps below
250 ms. A failure remains an explicit decision gate, not permission to raise the
budget silently. Physical-device timing remains a separate release obligation.

Allowed production scope: the existing digest helper, a new narrow native facade,
new Kotlin digest/module helpers, `RestoreNativePackage`, native template lists
and verifier expectations. Focused Jest/JVM tests and digest implementation notes
are allowed. No control-store/registry semantics, database, startup gate, Settings,
dependency versions, MainApplication, Gradle configuration or shipping probe route
changes belong to this ticket.
