# Android file SHA-256 runtime checkpoint

Organiser execution, 2026-09-22. **The corrected Android native digest prerequisite
is accepted** at `81b1b76`. The initial JS performance failure and its correction
are recorded separately below. Physical-device timing remains a release gate.

## Corrected native run

Independent review accepted `4aef58d`; the exact candidate tree was integrated as
`81b1b76`. The Android debug APK built successfully in 50 seconds (579 tasks),
SHA-256 `C11336629526D7F300BEAB9E576699BE672DE4225D64FC8DE7B23418D07DEE9B`.
It was installed only on `WorkoutLogRestoreSynthetic`. Reviewed, non-shipping
probe `701782e` ran against this code on Metro localhost:8084, PID 12817,
2026-09-22 11:33-11:34 BST. The fixture owner marker, logical sizes and all four
independent Android `sha256sum` values were reconfirmed before running.

| Logical bytes | Async elapsed | Async maximum 50 ms heartbeat gap | Sync elapsed | Digest |
| ---: | ---: | ---: | ---: | --- |
| 0 | 36 ms | 58 ms | 3 ms | Expected empty SHA-256 |
| 3 (`abc`) | 81 ms | 83 ms | 2 ms | Expected `abc` SHA-256 |
| 131109 | 83 ms | 83 ms | 1 ms | Matches independent oracle |
| 268435456 | 582 ms | 109 ms | 182 ms | Matches independent oracle |

All eight digests and byte counts match. The maximum synchronous heartbeat gap
was 183 ms. A 100 ms abort timer rejected in 113 ms, heartbeat gap 64 ms; immediate
abort in the same JS turn after invoking the helper rejected in 4 ms, heartbeat
gap 57 ms. Both returned `AbortError`, no byte count and no digest. Native
submission and cancellation now use the same asynchronous RN FIFO queue; hashing
runs on a separate bounded executor. This repairs the independently discovered
case where synchronous cancellation could overtake asynchronous admission.
Host resource-closure tests complement the actual bridge ordering observations.

The frozen budgets pass: each maximum digest below 5 seconds, cancellation below
1 second and async heartbeat below 250 ms. No Gradle or Jest runs were active
during timing. This remains a warm sparse-file debug-AVD measurement, not a
cold-storage or physical-device guarantee. The Java `MessageDigest` implementation
reads bounded 64 KiB chunks; non-Android retains the reviewed JS implementation.

Baseline PSS/RSS/swap PSS were 621310/689704/4613 KiB. Nine native samples around
the matrix runs ranged from 564810 to 601357 KiB PSS and 15512 to 244549 KiB swap
PSS. Sampling gaps and emulator paging prevent a peak-memory claim. No process
exhaustion occurred. Raw results and memory samples are retained as
`hash-native-results.log`, `hash-native-memory-baseline.txt` and
`hash-native-memory-samples.txt` under the synthetic-AVD artifact directory.
The diagnostic app and its Metro server were stopped after the run; fixtures and
the isolated diagnostic branch remain available. No diagnostic route ships.

## Initial JS run (superseded performance decision)

Digest correctness passed, but the original maximum-size latency failed. That
failure prompted MVP-006B4R; it did not restart the Expo upgrade.

## Environment and inputs

Fresh synthetic-only API 36 AVD `WorkoutLogRestoreSynthetic`, 1536 MiB RAM,
x86_64/SwiftShader, SDK 57 development build, Hermes, MVP profile. Native APK is
the B2 build identified in [the native-control evidence](android-restore-native-runtime.md).
JavaScript is reviewed non-shipping probe `7cc330e`, serving the accepted
`fileSha256.ts` / `@noble/hashes` 2.4.0 implementation on Metro localhost:8084.

Fixtures were newly created under app cache `mvp006b4-sha256-20260922` on this AVD.
Their expected hashes were independently checked with Android `sha256sum`.
The 256 MiB file is sparse zero-filled data; the entire fixture directory occupies
168 KiB physically. Setup reads warmed it. Host review/build activity and emulator
paging were present. These timings are not a release-build, physical-device or
cold-storage benchmark.

## Observations

| Logical bytes | Async elapsed | Async maximum 50 ms heartbeat gap | Sync elapsed | Digest |
| ---: | ---: | ---: | ---: | --- |
| 0 | 19 ms | 58 ms | 8 ms | Expected empty SHA-256 |
| 3 (`abc`) | 4 ms | 74 ms | 1 ms | Expected `abc` SHA-256 |
| 131109 | 88 ms | 88 ms | 76 ms | Matches independent oracle |
| 268435456 | 147655 ms | 758 ms | 141991 ms | Matches independent oracle |

The synchronous maximum run blocked the JS heartbeat for 141991 ms. The maximum
async abort check rejected with `AbortError`, no digest and no success claim in
581 ms (100 ms abort timer; observed heartbeat gap 564 ms).

The baseline native `dumpsys meminfo` reported PSS 635365 KiB, RSS 671920 KiB and
swap PSS 43350 KiB. Fifty samples across the runs ranged from 582503–630930 KiB
PSS and 63162–239852 KiB swap PSS. Samples have gaps and are not a guaranteed
peak or a proof of constant whole-app memory. The production code's 64 KiB
read bound and incremental digest remain separately covered by review/tests;
the maximum run completed without exhausting the process.

Exact JSON results and native memory samples are retained under
`.codex-artifacts/restore-synthetic-avd-20260922/`. The probe does not read workout
records or write the database. Ordinary app startup on the fresh AVD bootstraps
its new database; this run makes no original-user-data preservation claim.

## Follow-up decision

Correctness alone is insufficient: a single maximum-size synchronous digest
takes over two minutes here, and preparation/validation performs several digests.
Keep the public digest contract and file/size/change/abort checks, but investigate
using Android's maintained streaming
[`MessageDigest` SHA-256 implementation](https://developer.android.com/reference/java/security/MessageDigest)
behind the existing native integration. No new hash algorithm should be written.
Freeze the native synchronous/async cancellation contract before dispatch and
review it independently. Preserve the existing implementation for non-Android
compilation as appropriate; iOS runtime acceptance remains deferred.
