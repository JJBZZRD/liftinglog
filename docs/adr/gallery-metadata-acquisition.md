# ADR: Android gallery metadata acquisition proof

- Status: Research complete; production implementation is gated on the native runtime procedure below
- Date: 2026-09-22
- Pinned application source: `e29b6a992081a5f9c05682b19c236f0374e1148f`
- Installed packages inspected: `expo-image-picker` 57.0.19 (`gitHead` `7687b07947a5c866adeb11abbceae72403ccb188`), `expo-media-library` 57.0.5 and `expo-file-system` 57.0.7 (both `gitHead` `9e5319c0f821a27b7924841903abae50e2b41790`)
- Platform boundary: Android only. iOS is deferred.

## Decision

No option or public JavaScript result in the installed image picker can directly recover a canonical MediaStore identity for the observed Android Photo Picker result. Keep the default Android Photo Picker, do not enable `legacy: true`, do not parse picker URIs, and never interpret a numeric cache basename as a MediaStore ID.

The smallest viable selection-time enrichment is a best-effort, bounded, unique content match using only the installed Expo modules:

1. Keep the current permission gate and `launchImageLibraryAsync` options.
2. On a successful selection, first create the durable app-owned copy as today.
3. If the picker returns an asset ID, resolve its canonical metadata through `expo-media-library/legacy` and use it only when the asset still resolves and does not contradict the selected video's duration and dimensions. The picker-supplied filename is not a canonical comparison field.
4. If the ID is null or unusable, hash the durable selected copy once, enumerate a bounded set of video assets with `getAssetsAsync`, convert each plausible candidate ID with `getAssetContentUriAsync`, and hash those read-only `content://` URIs with `expo-file-system/legacy.getInfoAsync(uri, { md5: true })`.
5. Accept only one exact digest match after the complete bounded search. Fetch that candidate's canonical filename, creation time, duration, and album and persist the existing media fields. Zero matches, multiple matches, an incomplete scan, permission loss, an unreadable URI, or a limit breach is explicitly unresolved.

This is a recommendation, not a completed device proof. Installed source supports every API step, but no emulator or physical-device operation was authorized for this ticket. Production work must not ship the fallback until the runtime procedure in this ADR proves that MediaStore candidate `content://` URIs can be read and hashed on the supported Android matrix with acceptable latency.

The fallback does not require a schema change because the digest is used only to map the just-selected bytes to one current MediaStore row. A persistent digest is separate scope and is discussed below.

## Observed failure this decision addresses

The accepted emulator observation selected gallery fixture A but returned:

- `assetId = null`
- `fileName = "50.mp4"`
- `duration = 2000` ms
- no creation time or album

The corresponding MediaStore row is ID `50`, filename `PRE001H_5554_20260921_0700_A.mp4`. Fixture B is ID `51`, has a different canonical filename, and shares A's duration and creation time. The durable managed copy plays, but `50.mp4` and `2000` ms do not identify A. The fallback must distinguish A from B by content or return unresolved; it must not turn `50.mp4` into ID `50` by convention.

## Installed-source findings

### Image Picker cannot provide the missing identity

`ImageLibraryContract.kt` uses AndroidX `PickVisualMedia` by default and switches to `ACTION_GET_CONTENT` only for `legacy: true`. `MediaHandler.kt` then copies the selected video stream to a generated `.mp4` cache file. It queries the source URI only for `OpenableColumns.DISPLAY_NAME` and `SIZE`, extracts video dimensions/duration from the copied file, and calls `sourceUri.getMediaStoreAssetId()`.

`ImagePickerUtils.kt` implements `getMediaStoreAssetId()` only for MediaDocumentsProvider URIs and qualifying DownloadsProvider `msf:` URIs. The default Photo Picker URI in the observed flow is neither. The returned JavaScript `uri` is the generated cache file, not the source picker URI. `ImagePickerAsset` has no creation-time, album, original-source-URI, or provider-metadata field. Its contract explicitly permits a null `assetId` and describes `fileName` only as a preferred save name.

Android documents Photo Picker URIs as restricted, read-only picker URIs that can be queried only for `PickerMediaColumns`. `MediaStore.getMediaUri` is documented only for `ExternalStorageProvider` and `MediaDocumentsProvider` document URIs and can return null. Therefore parsing a picker path segment or treating it as a MediaStore `_ID` would depend on provider internals and is rejected.

`legacy: true` is also rejected. In this installed picker it changes the contract to `ACTION_GET_CONTENT`; it can return a MediaDocumentsProvider URI with an ID, but it can also return DownloadsProvider or arbitrary filesystem/provider content with no MediaStore identity. Expo documents that its purpose is to allow selection outside the user's photo library. It changes product selection semantics without guaranteeing metadata.

There is an open Expo pull request attempting to add picker media dates. Its discussion records the same `content://media/picker/...` null-ID behavior and notes that the granted picker URI can be queried while a reconstructed MediaStore URI may not be accessible. It is not part of installed 57.0.19 and does not supply a supported canonical ID path.

### Media Library exposes canonical candidates

The installed legacy Media Library can enumerate videos and returns the MediaStore numeric ID, canonical display filename, creation time, duration, dimensions, and Android album ID. Its Android query uses `MediaStore.Files.getContentUri("external")`; `getAssetInfoAsync(id)` queries `_ID = ?`.

`getAssetContentUriAsync(id)` is a public legacy API in 57.0.5. Android native code resolves the row's media type and returns the corresponding `content://media/.../<id>` URI. It requires readable media-library permission. This avoids raw-path access and avoids parsing IDs from undocumented picker URIs.

Album title is not included in `AssetInfo`. After a unique match, the implementation may map the candidate's `albumId` through `getAlbumsAsync()` and store the matching title. Album title is a search hint, not identity: titles are not guaranteed unique and assets can move.

### File System can read candidate content URIs, subject to runtime proof

The public SDK 57 legacy FileSystem contract says `getInfoAsync` accepts external content/assets, preserves `content://` schemes, and returns MD5 when requested. Its installed Android implementation opens a content URI through `ContentResolver.openInputStream` and computes MD5 over the stream. This is the key source-level support for the fallback.

The same implementation derives content-URI `size` from `InputStream.available()` and comments that this is not a generally reliable size source. Candidate size must therefore be an optimization only after runtime proof; it must not be the sole identity test or the reason to discard a candidate. The picker-provided `fileSize` is useful for budgeting but does not make its filename canonical.

The new `File` API also has native generic-content-provider support and can open a read-only file handle for a `content://` URI. A chunked byte-for-byte comparator could remove MD5 collision concerns, but its content-URI behavior is not stated as clearly in the SDK 57 public constructor contract, its reads are synchronous at the JavaScript boundary, and it would add more UI scheduling and cancellation work. It is not the first production choice. If the MD5 route fails runtime validation or an adversarial collision model is required, prove this file-handle route in a separate spike or use a native streaming digest implementation.

## Bounded matching contract

The initial production constants should be explicit and conservative:

- scan at most 1,500 accessible video rows, matching the existing repair ceiling;
- hash at most 8 plausible candidates;
- attempt fallback enrichment only when the selected copy is at most 512 MiB;
- prefilter only by media type plus nonzero dimensions (allowing width/height swap) and duration within 2,000 ms;
- hash candidates sequentially, never in parallel;
- treat any truncated library scan as unresolved, even if an earlier candidate matched;
- never write, move, delete, import, or create a MediaStore asset during enrichment.

Dimensions and duration reduce I/O but are not identity. Filename from the picker is not a filter in the null-ID case. Candidate file size may be used to prioritize candidates if the provider reports it consistently in the runtime proof, but a reported mismatch is not a rejection unless that reliability is separately demonstrated.

The 512 MiB, eight-candidate, and 1,500-row ceilings bound worst-case work; they are not claims that all real galleries will resolve. A limit breach deliberately sacrifices rediscovery metadata while preserving the playable attachment. Runtime measurements may justify lower ceilings. Raising them requires a reviewed performance result rather than an unbounded loop.

MD5 here is a transient equality discriminator over user-selected local media, not a security or integrity guarantee. Requiring exactly one digest match avoids ordinary filename/time/duration collisions and the observed A/B collision. It does not defend against deliberately constructed MD5 collisions. If that threat is in scope, use exact chunk comparison or a streaming SHA-256 implementation and keep its algorithm/version explicit.

## Proposed interface

The production ticket should introduce one shared result contract in `lib/utils/videoStorage.ts`:

```ts
type CanonicalVideoMetadata = {
  assetId: string;
  originalFilename: string | null;
  mediaCreatedAt: number | null;
  durationMs: number | null;
  albumName: string | null;
};

type SelectionMetadataResolution =
  | {
      status: "resolved";
      method: "picker_asset_id" | "unique_content_match";
      metadata: CanonicalVideoMetadata;
    }
  | {
      status: "unresolved";
      reason:
        | "permission_denied"
        | "asset_unreadable"
        | "selected_file_too_large"
        | "scan_limit"
        | "candidate_limit"
        | "hash_unavailable"
        | "no_match"
        | "ambiguous";
    };

async function acquireSelectedVideoMetadata(args: {
  durableLocalUri: string;
  pickerAssetId: string | null;
  pickerDurationMs: number | null;
  pickerWidth: number | null;
  pickerHeight: number | null;
  pickerFileSize: number | null;
}): Promise<SelectionMetadataResolution>;
```

`persistVideoForSetLink` should call this after the managed copy succeeds. A resolved result replaces picker hints with canonical values. An unresolved result returns the durable descriptor with `assetId`, `originalFilename`, `mediaCreatedAt`, and `albumName` set to null; it may retain picker duration as non-identifying playback metadata. In particular, it must not persist `50.mp4` as `originalFilename` merely because the picker supplied it.

Selection cancellation must still return before copying or database writes. The existing denied-permission alert/return must remain. If permission is lost or limited after selection, or enrichment fails, the successful durable attachment remains linked with unresolved metadata. No failure in optional enrichment may delete the prior attachment before the new durable copy and database update have succeeded.

Enrichment must only inspect the permission already established by the selection flow. It must not trigger a second permission prompt after the user has selected a video.

## Restore and repair contract required with the production ticket

Acquiring canonical metadata does not make the current repair functions safe. Both automatic repair paths must use one shared resolver contract:

- A stored asset ID is a candidate, not proof. Asset IDs can be reused on another device. Resolve the current row and reject it if any available canonical filename, creation time, or duration contradicts stored canonical metadata.
- Album narrows a search but is not identity.
- Metadata search must collect all candidates that satisfy the required fields. It must return a match only when exactly one candidate remains.
- At minimum, a metadata-only match needs canonical filename plus one independent matching value (creation time or duration), and every other stored canonical field must be non-contradictory. Weaker legacy rows remain unresolved.
- Equal scores do not authorize a first result. A first filename match or first creation-time match is never enough.
- Missing, inaccessible, contradictory, truncated, or ambiguous results leave the media link unresolved and never modify its workout, exercise-entry, or set.

At the pinned source, `app/set/[id].tsx::attemptVideoRediscovery` returns the first filename match or, when filename is absent, the first close creation-time match. `lib/utils/videoStorage.ts::searchVideoScope` retains the first highest score, and `resolveVideoLibraryReference` accepts any row returned by a direct asset-ID lookup without validating stored metadata. Fixing only selection-time acquisition would leave both guess paths active.

The narrow no-schema production ticket should therefore touch:

- `lib/utils/videoStorage.ts`: selection enrichment, canonicalization, bounded I/O, and the single fail-closed resolver contract;
- `app/set/[id].tsx`: pass picker duration/dimensions/size, stop persisting picker cache names as canonical names, and replace the local rediscovery implementation with the shared resolver;
- `lib/db/backup.ts`: adapt only if the shared resolver's explicit resolution result requires it;
- `__tests__/lib/videoStorage.test.ts` and focused set-route tests: direct-ID contradiction, unique match, no match, ambiguous match, caps, read failure, permission loss, cancellation/no-write, and no first-match behavior.

`lib/db/media.ts`, `lib/db/schema.ts`, bootstrap/migrations, package dependencies, and native sources do not need to change for this recommendation.

## Native runtime proof required before implementation is accepted

Run this against the existing SDK 57 development client and disposable test state. Do not rename, move, delete, or overwrite fixtures A or B.

1. Grant full video-library read permission. Select A with the unchanged default picker and confirm the observed picker result remains null ID / cache-style name.
2. After creating the managed copy, call `getInfoAsync(managedUri, { md5: true })` and require a nonempty digest.
3. Enumerate the accessible Media Library video rows and locate IDs 50 and 51 through returned canonical metadata, not through the picker basename.
4. Call `getAssetContentUriAsync` for both rows, then `getInfoAsync(contentUri, { md5: true })`. Require both URIs to be readable. Require the managed A digest to equal A's digest and differ from B's digest.
5. Fetch canonical metadata for the unique row and require ID 50, filename `PRE001H_5554_20260921_0700_A.mp4`, creation time, 2,000 ms duration, and the expected album mapping. Repeat for B and require ID 51 and B's canonical filename.
6. Confirm each original MediaStore file has the same bytes and metadata before and after the procedure and that only the existing app-managed copy lifecycle changes.
7. Cancel the picker and verify no managed file or media-row write. Deny permission and verify the existing alert/return and no writes. On Android 14+, repeat with limited access; a candidate not visible to Media Library must return unresolved while the durable selection remains usable if the current product permission gate allowed selection.
8. Exercise zero matches, a forced content-URI read failure, more than eight plausible candidates, a library count above 1,500, and a selected file above 512 MiB. Every case must return the documented unresolved reason without choosing a candidate.
9. In disposable test media only, add a second MediaStore row with byte-identical content and verify the result is `ambiguous`, not the first row.
10. Measure elapsed time and UI responsiveness for one typical clip and the maximum admitted clip. Reject the mechanism if the hash call causes visible UI starvation or unacceptable selection latency; source inspection cannot establish this.

The proof is successful only if A/B resolve exactly as above and every negative case fails closed. A unit test with mocked native APIs cannot substitute for these checks.

## When a persistent fingerprint or native patch becomes necessary

This ADR's transient content match improves metadata at selection time. It does not make link-only backup capable of finding a file that was renamed, retimestamped, moved across albums, duplicated, or copied to another device with changed container bytes.

If acceptance requires recovery through those changes, a separate reviewed ticket must persist a content fingerprint and byte length with an algorithm/version marker. Minimum scope is `lib/db/schema.ts`, `lib/db/bootstrap.ts`, `lib/db/media.ts`, `lib/utils/videoStorage.ts`, replacement backup import/export in `lib/db/backup.ts`, historical-shape migration tests, and restore ambiguity tests. The installed FileSystem exposes MD5 only; a security-grade or collision-resistant persistent fingerprint requires a proved streaming SHA-256 implementation or a reviewed native/library addition. Existing rows without a fingerprint must remain supported as lower-confidence, fail-closed inputs.

A native picker patch is justified only if the current-library content-URI proof fails or its cost is unacceptable. Merely exposing or parsing the Photo Picker URI is insufficient: Android does not promise that URI maps to a canonical MediaStore row, and the URI grant is not portable through app reinstall or backup restore. A native solution would need to return documented canonical fields or perform the same explicit content resolution, preserve picker cancellation and permission behavior, and carry an ongoing Expo patch-maintenance burden.

## Sources

Installed sources inspected in this worktree:

- `node_modules/expo-image-picker/android/src/main/java/expo/modules/imagepicker/MediaHandler.kt`
- `node_modules/expo-image-picker/android/src/main/java/expo/modules/imagepicker/ImagePickerUtils.kt`
- `node_modules/expo-image-picker/android/src/main/java/expo/modules/imagepicker/contracts/ImageLibraryContract.kt`
- `node_modules/expo-image-picker/src/ImagePicker.types.ts`
- `node_modules/expo-media-library/src/legacy/MediaLibrary.ts`
- `node_modules/expo-media-library/android/src/main/java/expo/modules/medialibrary/assets/GetAssets.kt`
- `node_modules/expo-media-library/android/src/main/java/expo/modules/medialibrary/assets/GetAssetInfo.kt`
- `node_modules/expo-media-library/android/src/main/java/expo/modules/medialibrary/assets/GetAssetContentUri.kt`
- `node_modules/expo-media-library/android/src/main/java/expo/modules/medialibrary/assets/AssetUtils.kt`
- `node_modules/expo-file-system/android/src/main/java/expo/modules/filesystem/legacy/FileSystemLegacyModule.kt`
- `node_modules/expo-file-system/android/src/main/java/expo/modules/filesystem/FileSystemFile.kt`
- `node_modules/expo-file-system/android/src/main/java/expo/modules/filesystem/unifiedfile/ContentProviderFile.kt`

Primary references:

- [Expo SDK 57 Image Picker](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/)
- [Expo SDK 57 Media Library](https://docs.expo.dev/versions/v57.0.0/sdk/media-library/)
- [Expo SDK 57 FileSystem legacy](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem-legacy/)
- [Android MediaStore API](https://developer.android.com/reference/android/provider/MediaStore)
- [Android Photo Picker](https://developer.android.com/training/data-storage/shared/photo-picker)
- [Expo pull request #37933: return file media date](https://github.com/expo/expo/pull/37933)

## Consequences

The observed picker output cannot support reliable restore by itself, and no picker flag fixes it without changing selection semantics. The installed libraries contain enough source-level capability for a bounded, exact-content selection fallback with no dependency, schema, native, or gallery mutation, but the content-URI and performance steps still require real Android proof. Until that proof passes, successful selections remain playable from their durable app copies and metadata acquisition must report unresolved rather than guess.
