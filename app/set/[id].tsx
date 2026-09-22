import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as MediaLibrary from "expo-media-library/legacy";
import { VideoView, useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  getLatestMediaForSet,
  listMediaForLocalUris,
  unlinkMediaForSet,
  updateMedia,
  upsertVideoForSet,
  type Media,
} from "../../lib/db/media";
import { getSetById, updateSet, type SetRow } from "../../lib/db/workouts";
import { useUnitPreference } from "../../lib/contexts/UnitPreferenceContext";
import { useTheme } from "../../lib/theme/ThemeContext";
import { formatWeightFromKg } from "../../lib/utils/units";
import {
  deleteManagedVideoUri,
  doesFileUriExist,
  getUriScheme,
  inferVideoMimeFromUri,
  isFileUri,
  isLikelyTransientUri,
  persistVideoForSetLink,
  persistVideoUriToAppStorage,
  resolveVideoLibraryReference,
  toMillis,
} from "../../lib/utils/videoStorage";

function toDisplayMillis(value?: number): number {
  return toMillis(value) ?? Date.now();
}
export default function SetInfoScreen() {
  const { rawColors } = useTheme();
  const { unitPreference } = useUnitPreference();
  const params = useLocalSearchParams<{ id?: string }>();
  const setId = typeof params.id === "string" ? Number(params.id) : null;
  const isValidId = typeof setId === "number" && Number.isSafeInteger(setId) && setId > 0;

  const [setRecord, setSetRecord] = useState<SetRow | null>(null);
  const [loadingSet, setLoadingSet] = useState(true);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [videoMedia, setVideoMedia] = useState<Media | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);
  const [unlinkingVideo, setUnlinkingVideo] = useState(false);
  const [resolvedVideoUri, setResolvedVideoUri] = useState<string | null>(null);

  const videoViewRef = useRef<VideoView | null>(null);
  const loadSetRequestRef = useRef(0);
  const loadVideoRequestRef = useRef(0);
  const routeGenerationRef = useRef(0);
  const routeSetIdRef = useRef<number | null>(null);
  const mediaMutationRef = useRef(0);
  const pickerInFlightRef = useRef(false);
  const pickerRequestRef = useRef(0);
  const noteSaveInFlightRef = useRef(false);
  const noteSaveRequestRef = useRef(0);
  const unlinkInFlightRef = useRef(false);
  const unlinkRequestRef = useRef(0);
  const videoUri = resolvedVideoUri;
  routeSetIdRef.current = isValidId ? setId : null;
  const player = useVideoPlayer(null, (player) => {
    player.loop = true;
    player.muted = true;
  });

  const loadSet = useCallback(async () => {
    const requestId = ++loadSetRequestRef.current;
    const routeGeneration = ++routeGenerationRef.current;
    mediaMutationRef.current += 1;
    setLoadingSet(true);

    if (!isValidId || !setId) {
      setSetRecord(null);
      setVideoMedia(null);
      setResolvedVideoUri(null);
      setLoadingSet(false);
      return;
    }

    // Do not let a previous route's set or attachment remain actionable while
    // the next route result is still in flight.
    setSetRecord(null);
    setVideoMedia(null);
    setResolvedVideoUri(null);
    pickerInFlightRef.current = false;
    pickerRequestRef.current += 1;
    setPickerLoading(false);
    setSavingSelection(false);
    unlinkInFlightRef.current = false;
    unlinkRequestRef.current += 1;
    setUnlinkingVideo(false);
    noteSaveInFlightRef.current = false;
    noteSaveRequestRef.current += 1;
    setSavingNote(false);

    try {
      const nextSet = await getSetById(setId);
      if (
        requestId !== loadSetRequestRef.current ||
        routeGeneration !== routeGenerationRef.current ||
        routeSetIdRef.current !== setId
      ) return;
      setSetRecord(nextSet);
      setNoteDraft(nextSet?.note ?? "");
      setEditingNote(false);
      if (!nextSet) {
        setVideoMedia(null);
        setResolvedVideoUri(null);
      }
    } catch (error) {
      if (__DEV__) console.error("[SetInfo] Failed loading set:", error);
      if (
        requestId !== loadSetRequestRef.current ||
        routeGeneration !== routeGenerationRef.current ||
        routeSetIdRef.current !== setId
      ) return;
      setSetRecord(null);
      setVideoMedia(null);
      setResolvedVideoUri(null);
    } finally {
      if (requestId === loadSetRequestRef.current) setLoadingSet(false);
    }
  }, [isValidId, setId]);

  useEffect(() => {
    void loadSet();
  }, [loadSet]);

  useEffect(() => () => {
    routeGenerationRef.current += 1;
    mediaMutationRef.current += 1;
    loadVideoRequestRef.current += 1;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSource = async () => {
      if (!videoUri) {
        player.pause();
        return;
      }

      try {
        await player.replaceAsync(videoUri);
        if (cancelled) return;
        player.play();
      } catch (error) {
        if (__DEV__) {
          console.warn("[SetInfo] Failed to load video source:", {
            uri: videoUri,
            scheme: getUriScheme(videoUri),
            error: String(error),
          });
        }
      }
    };

    void loadSource();
    return () => {
      cancelled = true;
    };
  }, [player, videoUri]);

  const handleFullscreenEnter = useCallback(() => {
    player.loop = true;
    player.muted = false;
  }, [player]);

  const openFullscreen = useCallback(() => {
    if (!videoUri) return;
    handleFullscreenEnter();
    player.play();
    void videoViewRef.current?.enterFullscreen();
  }, [handleFullscreenEnter, player, videoUri]);

  const handleFullscreenExit = useCallback(() => {
    player.loop = true;
    player.muted = true;
    player.play();
  }, [player]);

  const loadVideoMedia = useCallback(async () => {
    // A stale callback can still hold this function after route params change.
    // Reject it before touching the shared request counter or loading state.
    if (
      !isValidId ||
      !setId ||
      setRecord?.id !== setId ||
      routeSetIdRef.current !== setId
    ) return;

    const requestId = ++loadVideoRequestRef.current;
    const routeGeneration = routeGenerationRef.current;
    const mutationGeneration = mediaMutationRef.current;
    const isCurrentRequest = () =>
      requestId === loadVideoRequestRef.current &&
      routeGeneration === routeGenerationRef.current &&
      mutationGeneration === mediaMutationRef.current &&
      routeSetIdRef.current === setId;

    setLoadingVideo(true);
    let loadedMedia: Media | null = null;
    try {
      const media = await getLatestMediaForSet(setId);
      if (!isCurrentRequest()) return;

      if (!media) {
        setVideoMedia(null);
        setResolvedVideoUri(null);
        return;
      }

      setVideoMedia(media);
      loadedMedia = media;

      const storedUri: string | null = media.localUri ?? null;
      let nextUri: string | null = storedUri;
      let nextAssetId = media.assetId ?? null;
      let nextOriginalFilename = media.originalFilename ?? null;
      let nextMediaCreatedAt = media.mediaCreatedAt ?? null;
      let nextDurationMs = media.durationMs ?? null;
      let nextAlbumName = media.albumName ?? null;
      let assetResolved = false;

      const storedFileMissing = isFileUri(storedUri) ? !(await doesFileUriExist(storedUri)) : false;
      if (storedFileMissing) {
        nextUri = null;
      }
      const needsLibraryRepair =
        !nextUri || !isFileUri(nextUri) || isLikelyTransientUri(nextUri);
      if (needsLibraryRepair) {
        nextUri = null;
      }

      let canReadMediaLibrary = false;
      try {
        const permission = await MediaLibrary.getPermissionsAsync(false, ["video"]);
        canReadMediaLibrary = permission.granted && permission.accessPrivileges !== "none";
      } catch {
        canReadMediaLibrary = false;
      }

      if (needsLibraryRepair && canReadMediaLibrary) {
        if (__DEV__) {
          console.log("[SetInfo] Attempting verified video resolution...", {
            assetId: media.assetId,
            originalFilename: media.originalFilename,
            mediaCreatedAt: media.mediaCreatedAt,
            durationMs: media.durationMs,
            albumName: media.albumName,
          });
        }

        const rediscovered = await resolveVideoLibraryReference({
          assetId: media.assetId,
          originalFilename: media.originalFilename,
          mediaCreatedAt: media.mediaCreatedAt,
          durationMs: media.durationMs,
          albumName: media.albumName,
        });
        if (rediscovered) {
          nextAssetId = rediscovered.assetId;
          nextOriginalFilename = rediscovered.originalFilename;
          nextMediaCreatedAt = rediscovered.mediaCreatedAt;
          nextDurationMs = rediscovered.durationMs;
          nextAlbumName = rediscovered.albumName;
          const rediscoveredCandidate = rediscovered.localUri ?? rediscovered.uri;
          if (rediscoveredCandidate) {
            nextUri = rediscoveredCandidate;
            if (!isFileUri(rediscoveredCandidate) || isLikelyTransientUri(rediscoveredCandidate)) {
              const persistedUri = await persistVideoUriToAppStorage(rediscoveredCandidate, media.originalFilename);
              if (persistedUri) {
                nextUri = persistedUri;
              }
            }
            assetResolved = true;
          }

          if (__DEV__) {
            console.log("[SetInfo] Video reference verified:", {
              setId,
              mediaId: media.id,
              newAssetId: nextAssetId,
              newUri: nextUri,
            });
          }
        }
      }

      // Stabilize non-file URIs (e.g. content://) to a persistent app file when possible.
      if (nextUri && (!isFileUri(nextUri) || isLikelyTransientUri(nextUri))) {
        const persistedUri = await persistVideoUriToAppStorage(nextUri, nextOriginalFilename);
        if (persistedUri) {
          nextUri = persistedUri;
        }
      }

      if (nextUri && isFileUri(nextUri)) {
        const nextFileExists = await doesFileUriExist(nextUri);
        if (!nextFileExists) {
          nextUri = null;
        }
      }

      const fallbackUri = needsLibraryRepair || storedFileMissing ? null : storedUri;
      const finalUri = nextUri ?? fallbackUri;

      const shouldPersistRepair =
        typeof finalUri === "string" &&
        (finalUri !== media.localUri ||
          nextAssetId !== media.assetId ||
          nextOriginalFilename !== media.originalFilename ||
          nextMediaCreatedAt !== media.mediaCreatedAt ||
          nextDurationMs !== media.durationMs ||
          nextAlbumName !== media.albumName);

      if (shouldPersistRepair && isCurrentRequest()) {
        try {
          await updateMedia(media.id, {
            local_uri: finalUri,
            asset_id: nextAssetId,
            original_filename: nextOriginalFilename,
            media_created_at: nextMediaCreatedAt,
            duration_ms: nextDurationMs,
            album_name: nextAlbumName,
          });
          if (isCurrentRequest()) {
            const repairedMedia: Media = {
              ...media,
              localUri: finalUri,
              assetId: nextAssetId,
              originalFilename: nextOriginalFilename,
              mediaCreatedAt: nextMediaCreatedAt,
              durationMs: nextDurationMs,
              albumName: nextAlbumName,
            };
            loadedMedia = repairedMedia;
            setVideoMedia(repairedMedia);
          }
        } catch (updateError) {
          if (__DEV__) console.warn("[SetInfo] Failed to persist repaired media linkage:", updateError);
        }
      }

      if (__DEV__ && !assetResolved) {
        console.log("[SetInfo] Using stored media URI fallback:", {
          setId,
          mediaId: media.id,
          uri: finalUri,
          scheme: getUriScheme(finalUri),
        });
      }

      if (!isCurrentRequest()) return;
      setResolvedVideoUri(finalUri);
    } catch (error) {
      if (__DEV__) console.error("[SetInfo] Failed loading media:", error);
      if (!isCurrentRequest()) return;
      // A broken gallery asset is still a real link. Keep it available for
      // replacement or unlinking instead of presenting it as no attachment.
      setVideoMedia(loadedMedia);
      setResolvedVideoUri(null);
    } finally {
      if (!isCurrentRequest()) return;
      setLoadingVideo(false);
    }
  }, [isValidId, setId, setRecord]);

  useEffect(() => {
    loadVideoMedia();
  }, [loadVideoMedia]);

  const ensureVideoLibraryPermission = useCallback(async () => {
    let permission = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    }
    return permission.granted;
  }, []);

  const openVideoPicker = useCallback(async () => {
    if (!isValidId || !setId || !setRecord || pickerInFlightRef.current) return;
    const targetSetId = setId;
    const routeGeneration = routeGenerationRef.current;
    const canContinue = () =>
      routeGeneration === routeGenerationRef.current && routeSetIdRef.current === targetSetId;
    if (!canContinue() || setRecord.id !== targetSetId) return;
    const pickerRequest = ++pickerRequestRef.current;

    pickerInFlightRef.current = true;
    setPickerLoading(true);
    try {
      const hasPermission = await ensureVideoLibraryPermission();
      if (!canContinue()) return;
      if (!hasPermission) {
        Alert.alert("Permission required", "Allow video library access to link a video to this set.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "videos",
        allowsMultipleSelection: false,
        quality: 1,
      });

      if (!canContinue()) return;
      if (result.canceled || result.assets.length === 0) return;

      const selectedAsset = result.assets[0];
      if (!selectedAsset.uri) {
        Alert.alert("Error", "Failed to resolve selected video.");
        return;
      }

      const persistedVideo = await persistVideoForSetLink({
        sourceUri: selectedAsset.uri,
        assetId: selectedAsset.assetId ?? null,
        filenameHint: selectedAsset.fileName ?? null,
        durationMs:
          selectedAsset.duration != null
            ? Math.round(selectedAsset.duration)
            : null,
        saveToLibrary: false,
        gallerySelection: {
          width: selectedAsset.width ?? null,
          height: selectedAsset.height ?? null,
          fileSize: selectedAsset.fileSize ?? null,
        },
      });

      if (!canContinue()) return;
      if (!persistedVideo) {
        Alert.alert("Error", "Failed to save a durable copy of the selected video.");
        return;
      }

      setSavingSelection(true);
      try {
        const previousLocalUri = videoMedia?.localUri ?? null;
        // Invalidate any read/repair begun before this replacement. The route
        // guard above prevents a picker result from starting a write for a new route.
        mediaMutationRef.current += 1;
        loadVideoRequestRef.current += 1;
        await upsertVideoForSet(targetSetId, {
          ...persistedVideo,
          mime: selectedAsset.mimeType ?? inferVideoMimeFromUri(persistedVideo.localUri),
        });

        if (canContinue()) {
          try {
            if (previousLocalUri && previousLocalUri !== persistedVideo.localUri) {
              const remainingRows = await listMediaForLocalUris([previousLocalUri]);
              if (remainingRows.length === 0) {
                try {
                  await deleteManagedVideoUri(previousLocalUri);
                } catch (cleanupError) {
                  if (__DEV__) console.warn("[SetInfo] Video replacement succeeded but old-file cleanup failed:", cleanupError);
                  Alert.alert("Video linked", "The new video was linked, but the previous local copy could not be removed.");
                }
              }
            }
          } catch (cleanupError) {
            if (__DEV__) console.warn("[SetInfo] Video replacement succeeded but reference cleanup failed:", cleanupError);
            Alert.alert("Video linked", "The new video was linked, but the previous local copy could not be checked or removed.");
          } finally {
            // A committed replacement always refreshes the current route, even
            // when the optional cleanup/reference lookup fails.
            if (canContinue()) await loadVideoMedia();
          }
        }

        if (__DEV__) {
          console.log("[SetInfo] Linked picked video to set:", {
            setId,
            mediaId: videoMedia?.id ?? null,
            assetId: persistedVideo.assetId,
            assetUri: selectedAsset.uri,
            fileName: persistedVideo.originalFilename,
            mediaCreatedAt: persistedVideo.mediaCreatedAt,
            durationMs: persistedVideo.durationMs,
            albumName: persistedVideo.albumName,
            resolvedUri: persistedVideo.localUri,
            uriScheme: getUriScheme(persistedVideo.localUri),
          });
        }

      } catch (error) {
        if (__DEV__) console.error("[SetInfo] Failed linking selected video:", error);
        if (canContinue()) {
          Alert.alert("Error", "Failed to link video to this set.");
          // The failed write invalidated an earlier read/repair. Re-read the
          // persisted link so a current route cannot remain loading forever.
          await loadVideoMedia();
        }
      } finally {
        if (canContinue()) setSavingSelection(false);
      }
    } catch (error) {
      if (__DEV__) console.error("[SetInfo] Failed opening system gallery picker:", error);
      if (canContinue()) Alert.alert("Error", "Failed to open gallery.");
    } finally {
      if (pickerRequest === pickerRequestRef.current) {
        pickerInFlightRef.current = false;
        if (canContinue()) setPickerLoading(false);
      }
    }
  }, [ensureVideoLibraryPermission, isValidId, loadVideoMedia, setId, setRecord, videoMedia]);

  const unlinkVideo = useCallback(async () => {
    if (!isValidId || !setId || !setRecord || !videoMedia || unlinkInFlightRef.current) return;
    const targetSetId = setId;
    const routeGeneration = routeGenerationRef.current;
    const canApply = () =>
      routeGeneration === routeGenerationRef.current && routeSetIdRef.current === targetSetId;
    if (!canApply() || setRecord.id !== targetSetId) return;
    const unlinkRequest = ++unlinkRequestRef.current;

    unlinkInFlightRef.current = true;
    setUnlinkingVideo(true);
    try {
      mediaMutationRef.current += 1;
      loadVideoRequestRef.current += 1;
      await unlinkMediaForSet(targetSetId);

      if (__DEV__) {
        console.log("[SetInfo] Unlinked video from set:", { setId });
      }

      if (canApply()) await loadVideoMedia();
    } catch (error) {
      if (__DEV__) console.error("[SetInfo] Failed unlinking video:", error);
      if (canApply()) {
        Alert.alert("Error", "Failed to unlink video from this set.");
        await loadVideoMedia();
      }
    } finally {
      if (unlinkRequest === unlinkRequestRef.current) {
        unlinkInFlightRef.current = false;
        if (canApply()) setUnlinkingVideo(false);
      }
    }
  }, [isValidId, loadVideoMedia, setId, setRecord, videoMedia]);

  const handleVideoActionPress = useCallback(() => {
    if (!isValidId || !setId || !setRecord) return;

    if (!videoMedia) {
      void openVideoPicker();
      return;
    }

    Alert.alert("Video options", "Unlinking removes the link to this set but won't delete the video file.", [
      { text: "Change video", onPress: () => void openVideoPicker() },
      { text: "Unlink video", style: "destructive", onPress: () => void unlinkVideo() },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [isValidId, setId, setRecord, videoMedia, openVideoPicker, unlinkVideo]);

  const beginNoteEdit = useCallback(() => {
    if (!setRecord || savingNote) return;
    setNoteDraft(setRecord.note ?? "");
    setEditingNote(true);
  }, [savingNote, setRecord]);

  const cancelNoteEdit = useCallback(() => {
    if (!setRecord || savingNote) return;
    setNoteDraft(setRecord.note ?? "");
    setEditingNote(false);
  }, [savingNote, setRecord]);

  const saveNote = useCallback(async () => {
    if (!isValidId || !setId || !setRecord || noteSaveInFlightRef.current) return;
    const targetSetId = setId;
    const routeGeneration = routeGenerationRef.current;
    const canApply = () =>
      routeGeneration === routeGenerationRef.current && routeSetIdRef.current === targetSetId;
    if (!canApply() || setRecord.id !== targetSetId) return;
    const saveRequest = ++noteSaveRequestRef.current;
    const nextNote = noteDraft.trim() || null;
    noteSaveInFlightRef.current = true;
    setSavingNote(true);
    try {
      await updateSet(targetSetId, { note: nextNote });
      if (!canApply()) return;
      setSetRecord((current) => current?.id === targetSetId ? { ...current, note: nextNote } : current);
      setNoteDraft(nextNote ?? "");
      setEditingNote(false);
    } catch (error) {
      if (__DEV__) console.error("[SetInfo] Failed saving set note:", error);
      if (canApply()) Alert.alert("Error", "Failed to save the set note.");
    } finally {
      if (saveRequest === noteSaveRequestRef.current) {
        noteSaveInFlightRef.current = false;
        if (canApply()) setSavingNote(false);
      }
    }
  }, [isValidId, noteDraft, setId, setRecord]);

  const formatAssetDate = useCallback((timestamp?: number) => {
    return new Date(toDisplayMillis(timestamp)).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: rawColors.background }]}>
      <Stack.Screen
        options={{
          title: "Set Info",
          headerStyle: { backgroundColor: rawColors.surface },
          headerTitleStyle: { color: rawColors.foreground },
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.headerButton}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
            </Pressable>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {loadingSet ? (
          <View style={[styles.videoCard, { backgroundColor: rawColors.surface, borderColor: rawColors.border }]}>
            <View style={styles.emptyVideoState}>
              <ActivityIndicator size="small" color={rawColors.primary} />
              <Text style={[styles.emptyVideoText, { color: rawColors.foregroundSecondary }]}>Loading set...</Text>
            </View>
          </View>
        ) : !setRecord ? (
          <View style={[styles.videoCard, { backgroundColor: rawColors.surface, borderColor: rawColors.border }]}>
            <View style={styles.emptyVideoState}>
              <MaterialCommunityIcons name="alert-circle-outline" size={26} color={rawColors.foregroundMuted} />
              <Text style={[styles.emptyVideoText, { color: rawColors.foregroundSecondary }]}>This set is unavailable.</Text>
            </View>
          </View>
        ) : (
          <>
        <View
          style={[styles.videoCard, { backgroundColor: rawColors.surface, borderColor: rawColors.border, shadowColor: rawColors.shadow }]}
        >
          <View style={styles.videoHeader}>
            <View style={styles.videoHeaderTitle}>
              <MaterialCommunityIcons name="note-text-outline" size={18} color={rawColors.primary} />
              <Text style={[styles.videoTitle, { color: rawColors.foreground }]}>Set note</Text>
            </View>
            {!editingNote && (
              <Pressable onPress={beginNoteEdit} disabled={savingNote}>
                <View style={[styles.actionPill, { backgroundColor: rawColors.surfaceSecondary }]}>
                  <Text style={[styles.actionPillText, { color: rawColors.primary }]}>{setRecord.note ? "Edit Note" : "Add Note"}</Text>
                </View>
              </Pressable>
            )}
          </View>
          {editingNote ? (
            <>
              <TextInput
                testID="set-note-input"
                className="border border-border rounded-lg p-3 text-base bg-surface-secondary text-foreground min-h-[80px]"
                style={{ textAlignVertical: "top" }}
                value={noteDraft}
                onChangeText={setNoteDraft}
                placeholder="Add notes about this set"
                placeholderTextColor={rawColors.foregroundMuted}
                multiline
                editable={!savingNote}
              />
              <View className="flex-row gap-3 mt-3">
                <Pressable className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary" onPress={cancelNoteEdit} disabled={savingNote}>
                  <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
                </Pressable>
                <Pressable className="flex-1 items-center justify-center p-3.5 rounded-lg bg-primary" onPress={() => void saveNote()} disabled={savingNote}>
                  <Text className="text-base font-semibold text-primary-foreground">{savingNote ? "Saving..." : "Save Note"}</Text>
                </Pressable>
              </View>
            </>
          ) : setRecord.note ? (
            <>
              <Text style={[styles.emptyVideoText, { color: rawColors.foreground }]}>{setRecord.note}</Text>
              <Pressable className="items-center justify-center p-3.5 rounded-lg bg-surface-secondary mt-3" onPress={() => { setNoteDraft(""); setEditingNote(true); }} disabled={savingNote}>
                <Text className="text-base font-semibold text-foreground-secondary">Clear Note</Text>
              </Pressable>
            </>
          ) : (
            <Text style={[styles.emptyVideoText, { color: rawColors.foregroundSecondary }]}>No note for this set.</Text>
          )}
        </View>

        <View
          style={[
            styles.infoCard,
            { backgroundColor: rawColors.surface, borderColor: rawColors.border, shadowColor: rawColors.shadow },
          ]}
        >
          <View style={[styles.iconCircle, { backgroundColor: rawColors.surfaceSecondary }]}>
            <MaterialCommunityIcons name="information-outline" size={30} color={rawColors.primary} />
          </View>
          <View style={styles.infoText}>
            <Text style={[styles.title, { color: rawColors.foreground }]}>Set Details</Text>
            <Text style={[styles.subtitle, { color: rawColors.foregroundSecondary }]}>
              {setRecord.weightKg !== null ? formatWeightFromKg(setRecord.weightKg, unitPreference) : "—"}
              {" x "}
              {setRecord.reps !== null ? `${setRecord.reps} reps` : "—"}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.videoCard,
            { backgroundColor: rawColors.surface, borderColor: rawColors.border, shadowColor: rawColors.shadow },
          ]}
        >
          <View style={styles.videoHeader}>
            <View style={styles.videoHeaderTitle}>
              <MaterialCommunityIcons name="video-outline" size={18} color={rawColors.primary} />
              <Text style={[styles.videoTitle, { color: rawColors.foreground }]}>Video</Text>
            </View>
            {isValidId && setRecord && (
              <Pressable
                onPress={handleVideoActionPress}
                disabled={pickerLoading || savingSelection || unlinkingVideo}
                style={({ pressed }) => ({
                  opacity: pressed || pickerLoading || savingSelection || unlinkingVideo ? 0.7 : 1,
                })}
              >
                <View style={[styles.actionPill, { backgroundColor: rawColors.surfaceSecondary }]}>
                  <MaterialCommunityIcons
                    name={videoMedia ? "pencil-outline" : "plus"}
                    size={16}
                    color={rawColors.primary}
                  />
                  <Text style={[styles.actionPillText, { color: rawColors.primary }]}>
                    {videoMedia ? "Edit" : "Add"}
                  </Text>
                </View>
              </Pressable>
            )}
          </View>

          {loadingVideo ? (
            <View style={styles.emptyVideoState}>
              <ActivityIndicator size="small" color={rawColors.primary} />
              <Text style={[styles.emptyVideoText, { color: rawColors.foregroundSecondary }]}>Loading video...</Text>
            </View>
          ) : videoUri ? (
            <>
              <Pressable
                style={[styles.videoPreview, { borderColor: rawColors.border }]}
                onPress={openFullscreen}
              >
                <VideoView
                  ref={videoViewRef}
                  player={player}
                  nativeControls={false}
                  contentFit="contain"
                  onFullscreenEnter={handleFullscreenEnter}
                  onFullscreenExit={handleFullscreenExit}
                  style={styles.videoView}
                />
                <View style={[styles.previewOverlayButton, { backgroundColor: `${rawColors.background}AA` }]}>
                  <MaterialCommunityIcons name="fullscreen" size={18} color={rawColors.foreground} />
                </View>
              </Pressable>
              <Text style={[styles.videoMetaText, { color: rawColors.foregroundSecondary }]}>
                Tap video to open full screen.
              </Text>
              {videoMedia?.createdAt ? (
                <Text style={[styles.videoMetaText, { color: rawColors.foregroundMuted }]}>
                  Linked {formatAssetDate(videoMedia.createdAt)}
                </Text>
              ) : null}
            </>
          ) : (
            <View style={styles.emptyVideoState}>
              <MaterialCommunityIcons name="video-off-outline" size={26} color={rawColors.foregroundMuted} />
              <Text style={[styles.emptyVideoText, { color: rawColors.foregroundSecondary }]}>
                {videoMedia ? "The linked video is unavailable." : "No video linked to this set."}
              </Text>
              {!videoMedia && isValidId && setRecord && (
                <Pressable
                  onPress={handleVideoActionPress}
                  disabled={pickerLoading || savingSelection || unlinkingVideo}
                  style={({ pressed }) => ({
                    opacity: pressed || pickerLoading || savingSelection || unlinkingVideo ? 0.75 : 1,
                  })}
                >
                  <View style={[styles.addButton, { backgroundColor: rawColors.primary }]}>
                    <MaterialCommunityIcons name="plus" size={18} color={rawColors.primaryForeground} />
                    <Text style={[styles.addButtonText, { color: rawColors.primaryForeground }]}>
                      Add From Gallery
                    </Text>
                  </View>
                </Pressable>
              )}
            </View>
          )}
        </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerButton: {
    padding: 8,
    marginLeft: -8,
  },
  content: {
    padding: 16,
    gap: 14,
  },
  infoCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  infoText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 3,
    fontSize: 14,
  },
  videoCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  videoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  videoHeaderTitle: {
    flexDirection: "row",
    alignItems: "center",
  },
  videoTitle: {
    marginLeft: 6,
    fontSize: 16,
    fontWeight: "700",
  },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 4,
  },
  actionPillText: {
    fontSize: 13,
    fontWeight: "700",
  },
  emptyVideoState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    gap: 10,
  },
  emptyVideoText: {
    fontSize: 14,
    textAlign: "center",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 6,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  videoPreview: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  videoView: {
    flex: 1,
    backgroundColor: "#000000",
  },
  previewOverlayButton: {
    position: "absolute",
    right: 8,
    top: 8,
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  videoMetaText: {
    marginTop: 8,
    fontSize: 12,
  },
});
