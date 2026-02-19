import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { VideoView, useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { addMedia, getLatestMediaForSet, unlinkMediaForSet, updateMedia, type Media } from "../../lib/db/media";
import { useTheme } from "../../lib/theme/ThemeContext";

const DEFAULT_MEDIA_ALBUM_NAME = "LiftingLog";
const APP_VIDEO_STORAGE_DIR = "set-videos";
const REDISCOVERY_PAGE_SIZE = 200;
const REDISCOVERY_MAX_SCAN_COUNT = 1500;
const REDISCOVERY_TIME_WINDOW_MS = 60_000;
const REDISCOVERY_MATCH_WINDOW_MS = 2000;

function toMillis(value?: number | null): number | null {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function toDisplayMillis(value?: number): number {
  return toMillis(value) ?? Date.now();
}

function getUriScheme(uri: string | null | undefined): string {
  if (!uri) return "unknown";
  const match = uri.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  return match?.[1]?.toLowerCase() ?? "unknown";
}

function isFileUri(uri: string | null | undefined): uri is string {
  return typeof uri === "string" && uri.length > 0 && getUriScheme(uri) === "file";
}

function isLikelyTransientUri(uri: string | null | undefined): boolean {
  if (!uri) return false;
  const normalized = uri.toLowerCase();
  return (
    normalized.includes("/cache/") ||
    normalized.includes("\\cache\\") ||
    normalized.includes("/tmp/") ||
    normalized.includes("\\tmp\\") ||
    normalized.includes("imagepicker")
  );
}

function extractExtension(value: string | null | undefined): string | null {
  if (!value) return null;
  const withoutQuery = value.split("?")[0] ?? value;
  const filename = withoutQuery.split("/").pop() ?? withoutQuery;
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === filename.length - 1) return null;
  return filename.slice(dotIndex + 1);
}

function sanitizeExtension(extension: string | null | undefined): string {
  const sanitized = (extension ?? "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (sanitized.length === 0) return "mp4";
  return sanitized.slice(0, 10);
}

async function doesFileUriExist(uri: string | null | undefined): Promise<boolean> {
  if (!isFileUri(uri)) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return !!info.exists;
  } catch {
    return false;
  }
}

async function persistVideoUriToAppStorage(sourceUri: string, filenameHint?: string | null): Promise<string | null> {
  const documentDirectory = FileSystem.documentDirectory;
  if (!documentDirectory) return null;

  const directoryUri = `${documentDirectory}${APP_VIDEO_STORAGE_DIR}/`;

  try {
    const directoryInfo = await FileSystem.getInfoAsync(directoryUri);
    if (!directoryInfo.exists) {
      await FileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
    }

    const extension = sanitizeExtension(extractExtension(filenameHint) ?? extractExtension(sourceUri));
    const targetUri = `${directoryUri}${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
    return targetUri;
  } catch (error) {
    if (__DEV__) {
      console.warn("[SetInfo] Failed to persist URI to app storage:", {
        sourceUri,
        error: String(error),
      });
    }
    return null;
  }
}

/**
 * Attempt to re-discover a video in the MediaLibrary by matching metadata.
 * This is used when the stored asset_id is no longer valid (e.g., after app reinstall).
 * Returns the re-discovered asset info, or null if not found.
 */
async function attemptVideoRediscovery(media: Media): Promise<{
  assetId: string;
  localUri: string | null;
  uri: string | null;
} | null> {
  // Need at least some metadata to search
  const hasFilename = !!media.originalFilename;
  const mediaCreatedAtMs = toMillis(media.mediaCreatedAt);
  const hasCreationTime = mediaCreatedAtMs !== null;
  const hasAlbum = !!media.albumName;

  if (!hasFilename && !hasCreationTime) {
    if (__DEV__) {
      console.log("[SetInfo] Cannot re-discover video: no filename or creation time metadata");
    }
    return null;
  }

  try {
    // First, try to search within the specific album if we know it
    let album: MediaLibrary.Album | null = null;
    if (hasAlbum) {
      album = await MediaLibrary.getAlbumAsync(media.albumName!);
    }

    // Build search options
    const searchOptions: MediaLibrary.AssetsOptions = {
      mediaType: MediaLibrary.MediaType.video,
      first: REDISCOVERY_PAGE_SIZE,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]], // Newest first
    };

    if (album) {
      searchOptions.album = album;
    }

    // If we have a creation time, narrow the search window
    if (mediaCreatedAtMs !== null) {
      // Search within a narrow window around the creation time first.
      searchOptions.createdAfter = mediaCreatedAtMs - REDISCOVERY_TIME_WINDOW_MS;
      searchOptions.createdBefore = mediaCreatedAtMs + REDISCOVERY_TIME_WINDOW_MS;
    }

    let after: string | undefined;
    let scannedCount = 0;

    while (scannedCount < REDISCOVERY_MAX_SCAN_COUNT) {
      const page = await MediaLibrary.getAssetsAsync({
        ...searchOptions,
        ...(after ? { after } : {}),
      });
      scannedCount += page.assets.length;

      if (__DEV__) {
        console.log("[SetInfo] Re-discovery scan page:", {
          pageCount: page.assets.length,
          scannedCount,
          hasNextPage: page.hasNextPage,
        });
      }

      // Try to find a matching asset
      for (const candidate of page.assets) {
        // Match by filename if available
        if (hasFilename && candidate.filename === media.originalFilename) {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(candidate.id);
          if (__DEV__) {
            console.log("[SetInfo] Re-discovered video by filename:", {
              filename: media.originalFilename,
              newAssetId: candidate.id,
            });
          }
          return {
            assetId: candidate.id,
            localUri: assetInfo?.localUri ?? null,
            uri: assetInfo?.uri ?? null,
          };
        }

        // Match by creation time if filename metadata is absent
        if (hasCreationTime && !hasFilename) {
          const candidateCreationTimeMs = toMillis(candidate.creationTime);
          if (candidateCreationTimeMs === null || mediaCreatedAtMs === null) continue;
          const timeDiff = Math.abs(candidateCreationTimeMs - mediaCreatedAtMs);
          if (timeDiff <= REDISCOVERY_MATCH_WINDOW_MS) {
            const assetInfo = await MediaLibrary.getAssetInfoAsync(candidate.id);
            if (__DEV__) {
              console.log("[SetInfo] Re-discovered video by creation time:", {
                creationTime: mediaCreatedAtMs,
                candidateTime: candidateCreationTimeMs,
                timeDiff,
                newAssetId: candidate.id,
              });
            }
            return {
              assetId: candidate.id,
              localUri: assetInfo?.localUri ?? null,
              uri: assetInfo?.uri ?? null,
            };
          }
        }
      }

      if (!page.hasNextPage || !page.endCursor || page.assets.length === 0) {
        break;
      }
      after = page.endCursor;
    }

    if (__DEV__) {
      console.log("[SetInfo] Re-discovery failed: no matching video found", { scannedCount });
    }
    return null;
  } catch (error) {
    if (__DEV__) {
      console.warn("[SetInfo] Re-discovery error:", error);
    }
    return null;
  }
}

export default function SetInfoScreen() {
  const { rawColors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const setId = typeof params.id === "string" ? Number(params.id) : null;
  const isValidId = typeof setId === "number" && Number.isFinite(setId) && setId > 0;

  const [videoMedia, setVideoMedia] = useState<Media | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);
  const [unlinkingVideo, setUnlinkingVideo] = useState(false);
  const [resolvedVideoUri, setResolvedVideoUri] = useState<string | null>(null);

  const videoViewRef = useRef<VideoView | null>(null);
  const loadVideoRequestRef = useRef(0);
  const videoUri = resolvedVideoUri;
  const player = useVideoPlayer(null, (player) => {
    player.loop = true;
    player.muted = true;
  });

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
    const requestId = ++loadVideoRequestRef.current;

    if (!isValidId || !setId) {
      setVideoMedia(null);
      setResolvedVideoUri(null);
      return;
    }

    setLoadingVideo(true);
    try {
      const media = await getLatestMediaForSet(setId);
      if (requestId !== loadVideoRequestRef.current) return;

      if (!media) {
        setVideoMedia(null);
        setResolvedVideoUri(null);
        return;
      }

      setVideoMedia(media);

      const storedUri = media.localUri ?? null;
      let nextUri = storedUri;
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

      let canReadMediaLibrary = false;
      try {
        const permission = await MediaLibrary.getPermissionsAsync(false, ["video"]);
        canReadMediaLibrary = permission.granted && permission.accessPrivileges !== "none";
      } catch {
        canReadMediaLibrary = false;
      }

      if (canReadMediaLibrary && media.assetId) {
        const assetId = String(media.assetId);
        try {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
          const resolvedLocalUri = assetInfo?.localUri ?? null;
          const resolvedAssetUri = assetInfo?.uri ?? null;
          const assetUriCandidate = resolvedLocalUri ?? resolvedAssetUri;

          if (assetUriCandidate) {
            nextUri = assetUriCandidate;
            if (!isFileUri(assetUriCandidate) || isLikelyTransientUri(assetUriCandidate)) {
              const persistedUri = await persistVideoUriToAppStorage(
                assetUriCandidate,
                assetInfo?.filename ?? media.originalFilename ?? null
              );
              if (persistedUri) {
                nextUri = persistedUri;
              }
            }
            assetResolved = true;
          }

          if (!nextOriginalFilename && assetInfo?.filename) {
            nextOriginalFilename = assetInfo.filename;
          }
          if (nextMediaCreatedAt == null && assetInfo?.creationTime != null) {
            nextMediaCreatedAt = assetInfo.creationTime;
          }
          if (nextDurationMs == null && assetInfo?.duration != null) {
            nextDurationMs = Math.round(assetInfo.duration * 1000);
          }
          if (!nextAlbumName) {
            nextAlbumName = media.albumName ?? DEFAULT_MEDIA_ALBUM_NAME;
          }

          if (__DEV__) {
            console.log("[SetInfo] Resolved media URI from assetId:", {
              setId,
              mediaId: media.id,
              assetId,
              storedLocalUri: media.localUri,
              assetUri: resolvedAssetUri,
              assetLocalUri: resolvedLocalUri,
              chosenUri: nextUri,
              chosenScheme: getUriScheme(nextUri),
              assetResolved,
            });
          }
        } catch (assetError) {
          if (__DEV__) {
            console.warn("[SetInfo] Failed resolving assetId to URI, will attempt re-discovery:", {
              setId,
              mediaId: media.id,
              assetId,
              error: String(assetError),
            });
          }
        }
      }

      // If asset resolution failed, attempt re-discovery from metadata.
      if (!assetResolved && canReadMediaLibrary && (media.originalFilename || media.mediaCreatedAt != null)) {
        if (__DEV__) {
          console.log("[SetInfo] Attempting video re-discovery...", {
            originalFilename: media.originalFilename,
            mediaCreatedAt: media.mediaCreatedAt,
            albumName: media.albumName,
          });
        }

        const rediscovered = await attemptVideoRediscovery(media);
        if (rediscovered) {
          nextAssetId = rediscovered.assetId;
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

          if (!nextAlbumName) {
            nextAlbumName = media.albumName ?? DEFAULT_MEDIA_ALBUM_NAME;
          }

          if (__DEV__) {
            console.log("[SetInfo] Video re-discovered successfully:", {
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

      const fallbackUri = storedFileMissing ? null : storedUri;
      const finalUri = nextUri ?? fallbackUri;

      const shouldPersistMediaChanges =
        typeof finalUri === "string" &&
        (finalUri !== media.localUri ||
          nextAssetId !== media.assetId ||
          nextOriginalFilename !== media.originalFilename ||
          nextMediaCreatedAt !== media.mediaCreatedAt ||
          nextDurationMs !== media.durationMs ||
          nextAlbumName !== media.albumName);

      if (shouldPersistMediaChanges) {
        try {
          await updateMedia(media.id, {
            local_uri: finalUri,
            asset_id: nextAssetId,
            original_filename: nextOriginalFilename,
            media_created_at: nextMediaCreatedAt,
            duration_ms: nextDurationMs,
            album_name: nextAlbumName,
          });
        } catch (updateError) {
          if (__DEV__) {
            console.warn("[SetInfo] Failed to persist repaired media linkage:", updateError);
          }
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

      if (requestId !== loadVideoRequestRef.current) return;
      setResolvedVideoUri(finalUri);
    } catch (error) {
      if (__DEV__) console.error("[SetInfo] Failed loading media:", error);
      if (requestId !== loadVideoRequestRef.current) return;
      setVideoMedia(null);
      setResolvedVideoUri(null);
    } finally {
      if (requestId !== loadVideoRequestRef.current) return;
      setLoadingVideo(false);
    }
  }, [isValidId, setId]);

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
    if (!isValidId || !setId) return;

    const hasPermission = await ensureVideoLibraryPermission();
    if (!hasPermission) {
      Alert.alert("Permission required", "Allow video library access to link a video to this set.");
      return;
    }

    setPickerLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsMultipleSelection: false,
        quality: 1,
      });

      if (result.canceled || result.assets.length === 0) return;

      const selectedAsset = result.assets[0];
      let localUri: string | null = selectedAsset.uri ?? null;
      let assetId: string | null = selectedAsset.assetId ?? null;
      let albumName: string | null = null;

      // Capture metadata for re-discovery after reinstall
      let originalFilename: string | null = selectedAsset.fileName ?? null;
      let mediaCreatedAt: number | null = null;
      let durationMs: number | null = selectedAsset.duration != null
        ? Math.round(selectedAsset.duration * 1000)
        : null;

      // Some pickers return transient URIs without an assetId.
      // Create a MediaLibrary asset so the link survives app restarts.
      if (!assetId && localUri) {
        try {
          const createdAsset = await MediaLibrary.createAssetAsync(localUri);
          assetId = createdAsset?.id != null ? String(createdAsset.id) : null;

          if (assetId) {
            albumName = DEFAULT_MEDIA_ALBUM_NAME;
            try {
              const album = await MediaLibrary.getAlbumAsync(DEFAULT_MEDIA_ALBUM_NAME);
              if (album) {
                await MediaLibrary.addAssetsToAlbumAsync([createdAsset], album, false);
              } else {
                await MediaLibrary.createAlbumAsync(DEFAULT_MEDIA_ALBUM_NAME, createdAsset, false);
              }
            } catch (albumError) {
              if (__DEV__) {
                console.warn("[SetInfo] Failed to attach created asset to album:", albumError);
              }
            }
          }
        } catch (createAssetError) {
          if (__DEV__) {
            console.warn("[SetInfo] Failed creating MediaLibrary asset from picker URI:", createAssetError);
          }
        }
      }

      // If we have an assetId, use MediaLibrary metadata and prefer resolved URI.
      if (assetId) {
        try {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
          if (assetInfo?.localUri) {
            localUri = assetInfo.localUri;
          } else if (assetInfo?.uri) {
            localUri = assetInfo.uri;
          }
          if (!originalFilename && assetInfo?.filename) {
            originalFilename = assetInfo.filename;
          }
          if (assetInfo?.creationTime != null) {
            mediaCreatedAt = assetInfo.creationTime;
          }
          if (durationMs == null && assetInfo?.duration != null) {
            durationMs = Math.round(assetInfo.duration * 1000);
          }
          if (!albumName) {
            albumName = DEFAULT_MEDIA_ALBUM_NAME;
          }
        } catch (metadataError) {
          if (__DEV__) {
            console.warn("[SetInfo] Failed to get asset metadata:", metadataError);
          }
        }
      }

      // Stabilize transient/non-file URIs into app-owned storage.
      if (localUri && (!isFileUri(localUri) || isLikelyTransientUri(localUri))) {
        const persistedUri = await persistVideoUriToAppStorage(localUri, originalFilename);
        if (persistedUri) {
          localUri = persistedUri;
        }
      }

      if (!localUri) {
        Alert.alert("Error", "Failed to resolve selected video.");
        return;
      }

      setSavingSelection(true);
      try {
        if (videoMedia) {
          await updateMedia(videoMedia.id, {
            local_uri: localUri,
            asset_id: assetId,
            mime: selectedAsset.mimeType ?? "video/mp4",
            set_id: setId,
            created_at: Date.now(),
            original_filename: originalFilename,
            media_created_at: mediaCreatedAt,
            duration_ms: durationMs,
            album_name: albumName,
          });
        } else {
          await addMedia({
            local_uri: localUri,
            asset_id: assetId,
            mime: selectedAsset.mimeType ?? "video/mp4",
            set_id: setId,
            created_at: Date.now(),
            original_filename: originalFilename,
            media_created_at: mediaCreatedAt,
            duration_ms: durationMs,
            album_name: albumName,
          });
        }

        if (__DEV__) {
          console.log("[SetInfo] Linked picked video to set:", {
            setId,
            mediaId: videoMedia?.id ?? null,
            assetId,
            assetUri: selectedAsset.uri,
            fileName: originalFilename,
            mediaCreatedAt,
            durationMs,
            albumName,
            resolvedUri: localUri,
            uriScheme: getUriScheme(localUri),
          });
        }

        await loadVideoMedia();
      } catch (error) {
        if (__DEV__) console.error("[SetInfo] Failed linking selected video:", error);
        Alert.alert("Error", "Failed to link video to this set.");
      } finally {
        setSavingSelection(false);
      }
    } catch (error) {
      if (__DEV__) console.error("[SetInfo] Failed opening system gallery picker:", error);
      Alert.alert("Error", "Failed to open gallery.");
    } finally {
      setPickerLoading(false);
    }
  }, [ensureVideoLibraryPermission, isValidId, setId, videoMedia, loadVideoMedia]);

  const unlinkVideo = useCallback(async () => {
    if (!isValidId || !setId) return;
    if (!videoUri) return;

    setUnlinkingVideo(true);
    try {
      await unlinkMediaForSet(setId);

      if (__DEV__) {
        console.log("[SetInfo] Unlinked video from set:", { setId });
      }

      await loadVideoMedia();
    } catch (error) {
      if (__DEV__) console.error("[SetInfo] Failed unlinking video:", error);
      Alert.alert("Error", "Failed to unlink video from this set.");
    } finally {
      setUnlinkingVideo(false);
    }
  }, [isValidId, setId, videoUri, loadVideoMedia]);

  const handleVideoActionPress = useCallback(() => {
    if (!isValidId || !setId) return;

    if (!videoUri) {
      void openVideoPicker();
      return;
    }

    Alert.alert("Video options", "Unlinking removes the link to this set but won't delete the video file.", [
      { text: "Change video", onPress: () => void openVideoPicker() },
      { text: "Unlink video", style: "destructive", onPress: () => void unlinkVideo() },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [isValidId, setId, videoUri, openVideoPicker, unlinkVideo]);

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
              Set ID {isValidId ? setId : "Unknown"}
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
            {isValidId && (
              <Pressable
                onPress={handleVideoActionPress}
                disabled={pickerLoading || savingSelection || unlinkingVideo}
                style={({ pressed }) => ({
                  opacity: pressed || pickerLoading || savingSelection || unlinkingVideo ? 0.7 : 1,
                })}
              >
                <View style={[styles.actionPill, { backgroundColor: rawColors.surfaceSecondary }]}>
                  <MaterialCommunityIcons
                    name={videoUri ? "pencil-outline" : "plus"}
                    size={16}
                    color={rawColors.primary}
                  />
                  <Text style={[styles.actionPillText, { color: rawColors.primary }]}>
                    {videoUri ? "Edit" : "Add"}
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
                No video linked to this set.
              </Text>
              {isValidId && (
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
