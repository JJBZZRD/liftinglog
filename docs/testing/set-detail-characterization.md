# Set detail characterization (MVP-004A)

These tests record behavior at baseline `5892c323797a85d86a60ae09c9058b37f0808ab5`.

## Findings

- `SetInfoScreen` is a video surface. It offers gallery add/change/unlink and playback; no set-note add/edit/clear control is rendered.
- Source inspection confirms the persistence layer supports a durable set note: `updateSet(setId, { note })` accepts text, and null clears it; `deleteSet` performs set cleanup. The executed tests cover `media.note` attachment metadata, which is separate from `sets.note`; they do not prove set-note UI or `updateSet` execution.
- Gallery selection requests one asset (`allowsMultipleSelection: false`). A cancelled picker returns without persistence. Permission denial alerts and does not invoke the picker.
- Screen-level tests exercise add/cancel, replacement, and unresolved-file behavior. From a loaded video, the real `Edit` action opens `Video options`; its `Change video` callback calls `updateMedia` for the existing row, does not call `addMedia`, and reloads the replacement. Cancelling that loaded-video change makes no writes and leaves the loaded player state intact.
- The separate `lib/db/media` characterization verifies the DB-boundary field mapping for `updateMedia`, including replacement metadata. It does not stand in for the screen replacement action-chain test.
- Legacy rows are read by `getLatestMediaForSet` in `createdAt DESC, id DESC` order.
- Missing managed files do not invalidate the set. The route attempts the asset-id lookup and metadata rediscovery (including an empty MediaLibrary scan) and ends on the current empty-video UI without unlinking or deleting media. This test does not verify real training-database persistence; the documented history boundary remains `sets`.
- Host Jest mocks verify URI copying, metadata, and failure/null behavior, but cannot validate native decoder/fullscreen playback or real MediaLibrary permissions.
- `persistVideoForSetLink` preserves an explicit `filenameHint` (`picked.mov`) even when mocked canonical asset metadata reports `lift.mp4`; this filename precedence is a rediscovery risk for later 004B work, not a confirmed device defect.
- Confirmed existing defect for MVP-004C: installed `expo-image-picker` types define picker `duration` in milliseconds, while `SetInfoScreen` multiplies it by 1000 before calling `persistVideoForSetLink`. A realistic 12,500 ms picker duration is therefore passed as 12,500,000 ms. This ticket characterizes the behavior and does not change production code. Legacy MediaLibrary duration values remain seconds and are separate.

## Follow-up gaps

The unresolved screen state is rendered as the normal no-video/empty playback surface; host tests cannot assert native decoder or fullscreen behavior. Set-note UI and explicit set-note deletion relation need later 004B/004C/004D work. Native playback and real-device gallery behavior remain outside these host tests.
