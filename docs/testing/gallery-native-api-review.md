# Android gallery API review

Date: 2026-09-22. Organiser-run diagnostic at
`5bbbb34c776196e3978e2641573983abab3eea72`, based on main `2bc7b2b`, in sibling
worktree `WorkoutLog-MVP004E2`. Its development-only route is not integrated into
main. The existing SDK 57 x86_64 Android development client used a separate MVP
Metro server on localhost port 8083; the existing 8082 server was preserved.

The probe uses installed public ImagePicker, MediaLibrary legacy, and FileSystem
legacy APIs. It does not call application persistence or gallery mutation APIs.
Raw evidence is retained under `.codex-artifacts/mvp-gallery-probe-20260922/`.

## Observations

The initial MediaLibrary grant was **limited**, exposing fixture B only. The
existing app-managed A copy had MD5 `5b8afd2c771dd85d7ef11dc26e7d563b`.
Enumerating videos returned canonical B (ID 51), whose documented content URI
could be hashed and had MD5 `f271f6ae28c96deb048a808781327fd3`. Selecting A through
the system picker returned null `assetId`, `50.mp4`, and a cache file equal to the
managed A copy, but no match in the accessible gallery. That must remain unresolved.

The organiser temporarily granted full video-library read permission. Enumeration
then returned both canonical rows. `getAssetContentUriAsync` followed by
`FileSystem.getInfoAsync(uri, { md5: true })` successfully read both files:

| Fixture | Canonical ID | Bytes | Duration | Digest match |
| --- | --- | --- | --- | --- |
| A | 50 | 5,069 | 2,000 ms | Picker A and managed A equal gallery A, not B |
| B | 51 | 5,168 | 2,000 ms | Picker B equals gallery B, not A |

Both expose canonical filename, dimensions 320 by 180, album `Download`, and
creation time **0**. The MediaStore `datetaken` column is null. Do not promote
this unavailable timestamp to evidence that both videos were created together.
Both picker selections still return null IDs and numeric save filenames under
full permission. Cancelling the picker returns no asset or digest.

The full enumeration/inspection completed in 104 ms; individual small-fixture
content hashes took 3–5 ms. Picker action totals include the operator's selection
time and are not processing benchmarks. These tiny fixtures do not establish a
safe maximum file size or worst-case gallery latency.

## Preservation and acceptance boundary

The original video permission grants were restored: `READ_MEDIA_VIDEO` false and
`READ_MEDIA_VISUAL_USER_SELECTED` true, with the same recorded permission flags.
Original gallery file SHA-256 values and queried metadata are identical before
and after. Exact rows in all 15 app tables equal the pre-probe snapshot; integrity
and foreign-key checks pass. Only normal picker-owned cache results were created.
The app was left force-stopped and the diagnostic Metro process was stopped.

This accepts the installed-API mechanism on this emulator and demonstrates the
limited-access no-match case. It does not accept a production matcher, physical
device behavior, large-file limits, read-error recovery, or duplicate-content
ambiguity handling. Those remain implementation and device-review gates.

## Organiser contract for the production follow-up

### Supplemental large-file probe (MVP-004E2P)

On 2026-09-22 the organiser independently reviewed diagnostic commit
`e0ce3a0890583923b7a9789ac67722f8730eaf7f` and ran its read-only measurement on
the same Android emulator. The disposable `MVP004E2P_64MiB.mp4` was a valid copy
of fixture A padded with an ISO Base Media `free` box to exactly 67,108,864 bytes.
Android indexed it as a two-second, 320 by 180 video. This measures file-reading
cost; it is not a representative 64 MiB encoded clip or a physical-device benchmark.

All eight sequential content-URI MD5 reads returned the expected digest
`56ff13426497d19bca2406dd36b8f447` and exact reported size, with no errors.
Individual reads took 179–214 ms; the complete loop took 1,577 ms. The maximum
gap between 250 ms JavaScript heartbeat ticks was 267 ms. The inspection had
already read the file, so these are repeated warm-cache measurements.

Evidence is retained under `.codex-artifacts/mvp-gallery-performance-20260922/`:
`probe-records.json`, `probe-log.txt`, UI XML, gallery metadata, database archive,
and `database-comparison.json`. A stale cross-worktree Metro transform initially
prevented the diagnostic screen loading; clearing Metro's cache resolved it before
measurement. No production source was changed for that issue.

After measurement the organiser deleted only the verified disposable MediaStore
row and file, restored the original limited-access permission grants, stopped the
app and diagnostic Metro, and removed its temporary ADB reverse mapping. Original
A/B gallery bytes and metadata are unchanged; exact rows in all 15 app tables match
the pre-notes baseline, with integrity and foreign-key checks passing.

This supports the provisional 64 MiB/eight-candidate limits for implementation
review. It does not establish worst-case latency, provider size accuracy, physical
device behavior, or production matching correctness. The diagnostic route remains
outside `main`.

### Production contract

MVP-004E3 may implement acquisition and unify both automatic repair paths without
schema, dependency, native, or backup-module changes. Preserve the existing
`resolveVideoLibraryReference` return type so backup remains a later owner.

- Add an explicit optional gallery-selection context to `persistVideoForSetLink`;
  only the set gallery caller supplies it. Retain the full-profile recording flow.
- Use the ADR's explicit resolved/unresolved acquisition result. Persist a durable
  copy before optional enrichment; enrichment failure cannot fail the attachment.
- Start conservatively at a **64 MiB selected-copy ceiling**, eight sequential
  candidate hashes and 1,500 enumerated videos. Larger selections remain playable
  with unresolved metadata. These limits require performance review before release.
- Inspect a candidate's reported size before hashing; an unavailable, nonpositive
  or over-limit size leaves resolution incomplete. Size is a budget guard, never
  identity evidence. The legacy content provider size API may underreport, so this
  is not a proven hard bound on bytes read from every provider.
- Never persist picker cache filenames as canonical gallery filenames. Creation
  time zero and missing/nonfinite values are unavailable matching evidence.
- The existing permission gate remains; enrichment and automatic repair do not
  introduce permission prompts. Limited access searches only visible assets.
- Stored IDs do not break metadata ties. A repair requires a unique canonical
  filename plus a positive creation time or duration, with every available field
  consistent across a complete bounded scan. Contradictions, incomplete scans,
  read errors or ambiguity return unresolved. Album is a hint, not identity.
- The set screen's direct asset-ID shortcut and local first-match rediscovery must
  use the shared conservative resolver. Do not fall back to a rejected library
  reference. Keep valid existing managed copies playable.
- On Android use the documented content URI for resolved gallery access; preserve
  the managed-copy lifecycle and stable media-row identity. No gallery deletion.

The full production candidate still needs independent review, focused negative
tests and native playback/metadata verification. No persistence fingerprint or
new schema is authorized by this follow-up.
