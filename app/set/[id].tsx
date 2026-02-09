import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Stack, router, useLocalSearchParams } from "expo-router";
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

function toMillis(value?: number): number {
  if (!value || Number.isNaN(value)) return Date.now();
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function getUriScheme(uri: string | null | undefined): string {
  if (!uri) return "unknown";
  const match = uri.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  return match?.[1]?.toLowerCase() ?? "unknown";
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
    player.loop = false;
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
    if (!isValidId || !setId) {
      setVideoMedia(null);
      setResolvedVideoUri(null);
      return;
    }

    setLoadingVideo(true);
    try {
      const media = await getLatestMediaForSet(setId);
      if (!media) {
        setVideoMedia(null);
        setResolvedVideoUri(null);
        return;
      }

      setVideoMedia(media);

      let nextUri = media.localUri ?? null;
      if (media.assetId) {
        const assetId = String(media.assetId);
        try {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
          nextUri = assetInfo?.uri ?? assetInfo?.localUri ?? nextUri;
          if (__DEV__) {
            console.log("[SetInfo] Resolved media URI from assetId:", {
              setId,
              mediaId: media.id,
              assetId,
              storedLocalUri: media.localUri,
              assetUri: assetInfo?.uri ?? null,
              assetLocalUri: assetInfo?.localUri ?? null,
              chosenUri: nextUri,
              chosenScheme: getUriScheme(nextUri),
            });
          }
        } catch (assetError) {
          if (__DEV__) {
            console.warn("[SetInfo] Failed resolving assetId to URI:", {
              setId,
              mediaId: media.id,
              assetId,
              error: String(assetError),
            });
          }
        }
      } else if (__DEV__) {
        console.log("[SetInfo] Using stored media URI without assetId:", {
          setId,
          mediaId: media.id,
          uri: nextUri,
          scheme: getUriScheme(nextUri),
        });
      }

      setResolvedVideoUri(nextUri);
    } catch (error) {
      if (__DEV__) console.error("[SetInfo] Failed loading media:", error);
      setVideoMedia(null);
      setResolvedVideoUri(null);
    } finally {
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
      const localUri = selectedAsset.uri;
      const assetId = selectedAsset.assetId ?? null;

      setSavingSelection(true);
      try {
        if (videoMedia) {
          await updateMedia(videoMedia.id, {
            local_uri: localUri,
            asset_id: assetId,
            mime: selectedAsset.mimeType ?? "video/mp4",
            set_id: setId,
            created_at: Date.now(),
          });
        } else {
          await addMedia({
            local_uri: localUri,
            asset_id: assetId,
            mime: selectedAsset.mimeType ?? "video/mp4",
            set_id: setId,
            created_at: Date.now(),
          });
        }

        if (__DEV__) {
          console.log("[SetInfo] Linked picked video to set:", {
            setId,
            mediaId: videoMedia?.id ?? null,
            assetId,
            assetUri: selectedAsset.uri,
            fileName: selectedAsset.fileName ?? null,
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

    Alert.alert("Video options", "Unlinking removes the link to this set but won’t delete the video file.", [
      { text: "Change video", onPress: () => void openVideoPicker() },
      { text: "Unlink video", style: "destructive", onPress: () => void unlinkVideo() },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [isValidId, setId, videoUri, openVideoPicker, unlinkVideo]);

  const formatAssetDate = useCallback((timestamp?: number) => {
    return new Date(toMillis(timestamp)).toLocaleString("en-US", {
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
