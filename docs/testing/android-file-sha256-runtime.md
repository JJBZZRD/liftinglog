# Android file SHA-256 runtime checkpoint

Organiser execution, 2026-09-22. Digest correctness is demonstrated on the debug
emulator; **the maximum-size startup latency is not accepted for production**.
MVP-006B4R must address this before the restore engine relies on the 256 MiB
ceiling. This does not restart the Expo upgrade.

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
