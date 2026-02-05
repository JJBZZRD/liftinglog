import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import type { CameraType, FlashMode } from "expo-camera";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as MediaLibrary from "expo-media-library";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, PanResponder, Pressable, Text, TextInput, View } from "react-native";
import { PinchGestureHandler, State } from "react-native-gesture-handler";
import { runOnJS, SensorType, useAnimatedReaction, useAnimatedSensor } from "react-native-reanimated";
import BaseModal from "../../components/modals/BaseModal";
import { addMedia } from "../../lib/db/media";
import { addSet, listSetsForWorkoutExercise } from "../../lib/db/workouts";
import { useTheme } from "../../lib/theme/ThemeContext";

const ALBUM_NAME = "LiftingLog";
const ZOOM_SENSITIVITY = 0.35;
const DEFAULT_SLIDER_WIDTH = 180;

const clampZoom = (value: number) => Math.min(1, Math.max(0, value));

function gravityToRotationDeg(x: number, y: number, z: number): number | null {
  "worklet";
  const absX = Math.abs(x);
  const absY = Math.abs(y);
  const absZ = Math.abs(z);
  const axisDeltaThreshold = 0.2;

  // If the phone is mostly flat, keep the previous control rotation.
  if (absZ > 0.85) {
    return null;
  }

  if (absX - absY > axisDeltaThreshold) {
    return x > 0 ? -90 : 90;
  }

  if (absY - absX > axisDeltaThreshold) {
    return 0;
  }

  return null;
}

export default function RecordVideoScreen() {
  const { rawColors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    workoutId?: string;
    workoutExerciseId?: string;
    performedAt?: string;
    setIndex?: string;
  }>();

  const parsedExerciseId = typeof params.id === "string" ? Number(params.id) : NaN;
  const exerciseId = Number.isFinite(parsedExerciseId) ? parsedExerciseId : null;
  const exerciseName = typeof params.name === "string" ? params.name : "Exercise";
  const parsedWorkoutId = typeof params.workoutId === "string" ? Number(params.workoutId) : NaN;
  const workoutId = Number.isFinite(parsedWorkoutId) ? parsedWorkoutId : null;
  const parsedWorkoutExerciseId = typeof params.workoutExerciseId === "string" ? Number(params.workoutExerciseId) : NaN;
  const workoutExerciseId = Number.isFinite(parsedWorkoutExerciseId) ? parsedWorkoutExerciseId : null;
  const parsedPerformedAt = typeof params.performedAt === "string" ? Number(params.performedAt) : NaN;
  const performedAt = Number.isFinite(parsedPerformedAt) ? parsedPerformedAt : Date.now();
  const parsedSetIndex = typeof params.setIndex === "string" ? Number(params.setIndex) : NaN;
  const initialSetIndex = Number.isFinite(parsedSetIndex) && parsedSetIndex > 0 ? parsedSetIndex : 1;

  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const ensureMediaPermission = useCallback(async () => {
    let permission = await MediaLibrary.getPermissionsAsync(false, ["video"]);
    if (!permission.granted) {
      permission = await MediaLibrary.requestPermissionsAsync(false, ["video"]);
    }
    return permission;
  }, []);

  const [facing, setFacing] = useState<CameraType>("back");
  const [flashMode, setFlashMode] = useState<FlashMode>("off");
  const [enableTorch, setEnableTorch] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [showAddSetModal, setShowAddSetModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [note, setNote] = useState("");
  const [nextSetIndex, setNextSetIndex] = useState(initialSetIndex);
  const [sliderWidth, setSliderWidth] = useState(DEFAULT_SLIDER_WIDTH);
  const [controlsRotationDeg, setControlsRotationDeg] = useState(0);
  const pinchStartZoom = useRef(0);
  const gravitySensor = useAnimatedSensor(SensorType.GRAVITY, {
    interval: 150,
    adjustToInterfaceOrientation: false,
  });

  const isReadyForSet = !!exerciseId && !!workoutId && !!workoutExerciseId;
  const canSaveVideo = !!recordedUri && !isRecording && isReadyForSet;

  const applyControlsRotation = useCallback((deg: number, source: string) => {
    setControlsRotationDeg((prev) => (prev === deg ? prev : deg));
    if (__DEV__) {
      console.log("[RecordVideo] Control rotation update:", { source, deg });
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (!workoutExerciseId) return;
    listSetsForWorkoutExercise(workoutExerciseId).then((exerciseSets) => {
      if (!isMounted) return;
      setNextSetIndex(exerciseSets.length > 0 ? exerciseSets.length + 1 : 1);
    });
    return () => {
      isMounted = false;
    };
  }, [workoutExerciseId]);

  useAnimatedReaction(
    () => {
      const { x, y, z } = gravitySensor.sensor.value;
      return gravityToRotationDeg(x, y, z);
    },
    (nextDeg, prevDeg) => {
      if (nextDeg === null || nextDeg === prevDeg) {
        return;
      }
      runOnJS(applyControlsRotation)(nextDeg, "gravity");
    },
    [applyControlsRotation]
  );

  const handleRequestPermissions = useCallback(async () => {
    if (!cameraPermission?.granted) {
      await requestCameraPermission();
    }
    if (!micPermission?.granted) {
      await requestMicPermission();
    }
  }, [cameraPermission, micPermission, requestCameraPermission, requestMicPermission]);

  const handleToggleFacing = useCallback(() => {
    setFacing((current) => (current === "back" ? "front" : "back"));
  }, []);

  const handleToggleTorch = useCallback(() => {
    setEnableTorch((current) => !current);
  }, []);

  const handleCycleFlash = useCallback(() => {
    setFlashMode((current) => {
      if (current === "off") return "auto";
      if (current === "auto") return "on";
      return "off";
    });
  }, []);

  const handlePinchStateChange = useCallback(
    (event: { nativeEvent: { state: number } }) => {
      const { state } = event.nativeEvent;
      if (state === State.BEGAN) {
        pinchStartZoom.current = zoom;
      }
      if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
        pinchStartZoom.current = zoom;
      }
    },
    [zoom]
  );

  const handlePinchGesture = useCallback((event: { nativeEvent: { scale?: number } }) => {
    const scale = event.nativeEvent.scale ?? 1;
    const nextZoom = clampZoom(pinchStartZoom.current + (scale - 1) * ZOOM_SENSITIVITY);
    setZoom(Number(nextZoom.toFixed(3)));
  }, []);

  const updateZoomFromX = useCallback(
    (x: number) => {
      if (!sliderWidth) return;
      const ratio = clampZoom(x / sliderWidth);
      setZoom(Number(ratio.toFixed(3)));
    },
    [sliderWidth]
  );

  const sliderPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (_event, gestureState) => gestureState.numberActiveTouches === 1,
        onMoveShouldSetPanResponder: (_event, gestureState) => gestureState.numberActiveTouches === 1,
        onPanResponderGrant: (event) => updateZoomFromX(event.nativeEvent.locationX),
        onPanResponderMove: (event) => updateZoomFromX(event.nativeEvent.locationX),
      }),
    [updateZoomFromX]
  );

  const handleRecordPress = useCallback(async () => {
    if (!cameraRef.current || isRecording) return;
    setRecordedUri(null);
    setIsRecording(true);
    try {
      const video = await cameraRef.current.recordAsync();
      setRecordedUri(video?.uri ?? null);
    } catch (error) {
      console.warn("Failed to record video:", error);
    } finally {
      setIsRecording(false);
    }
  }, [isRecording]);

  const handleStopPress = useCallback(() => {
    if (!cameraRef.current || !isRecording) return;
    cameraRef.current.stopRecording();
  }, [isRecording]);

  const handleDiscardPress = useCallback(() => {
    setRecordedUri(null);
  }, []);

  const handleSavePress = useCallback(() => {
    if (!canSaveVideo) return;
    setShowAddSetModal(true);
  }, [canSaveVideo]);

  const handleSaveSet = useCallback(async () => {
    if (!recordedUri || !exerciseId || !workoutId || !workoutExerciseId) return;

    const weightValue = weight.trim() ? parseFloat(weight) : null;
    const repsValue = reps.trim() ? parseInt(reps, 10) : null;
    const noteValue = note.trim() || null;

    if (!weightValue || weightValue <= 0 || !repsValue || repsValue <= 0) {
      return;
    }

    setIsSaving(true);
    try {
      const mediaStatus = await ensureMediaPermission();
      if (!mediaStatus?.granted || mediaStatus.accessPrivileges === "none") {
        return;
      }

      const existingAlbum = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
      const asset = existingAlbum
        ? await MediaLibrary.createAssetAsync(recordedUri, existingAlbum)
        : await MediaLibrary.createAssetAsync(recordedUri);

      if (!existingAlbum && asset) {
        await MediaLibrary.createAlbumAsync(ALBUM_NAME, asset, false);
      }

      const setId = await addSet({
        workout_id: workoutId,
        exercise_id: exerciseId,
        workout_exercise_id: workoutExerciseId,
        weight_kg: weightValue,
        reps: repsValue,
        note: noteValue,
        set_index: nextSetIndex,
        performed_at: performedAt,
      });

      await addMedia({
        local_uri: asset?.uri ?? recordedUri,
        asset_id: asset?.id ?? null,
        mime: "video/mp4",
        set_id: setId,
        workout_id: workoutId,
        note: noteValue,
      });

      setShowAddSetModal(false);
      router.back();
    } catch (error) {
      console.warn("Failed to save video set:", error);
    } finally {
      setIsSaving(false);
    }
  }, [
    recordedUri,
    exerciseId,
    workoutId,
    workoutExerciseId,
    weight,
    reps,
    note,
    nextSetIndex,
    performedAt,
    ensureMediaPermission,
    router,
  ]);

  const flashLabel = useMemo(() => {
    if (flashMode === "off") return "Flash Off";
    if (flashMode === "auto") return "Flash Auto";
    return "Flash On";
  }, [flashMode]);

  const flashIcon = useMemo(() => {
    if (flashMode === "off") return "flash-off";
    if (flashMode === "auto") return "flash-auto";
    return "flash";
  }, [flashMode]);

  const zoomLabel = useMemo(() => `Zoom ${Math.round(zoom * 100)}%`, [zoom]);
  const thumbSize = 14;
  const thumbLeft = useMemo(() => {
    if (!sliderWidth) return 0;
    const rawLeft = zoom * sliderWidth - thumbSize / 2;
    return Math.max(-thumbSize / 2, Math.min(sliderWidth - thumbSize / 2, rawLeft));
  }, [sliderWidth, thumbSize, zoom]);

  const permissionReady = cameraPermission?.granted && micPermission?.granted;
  const iconRotationStyle = useMemo(
    () => ({ transform: [{ rotate: `${controlsRotationDeg}deg` }] }),
    [controlsRotationDeg]
  );

  if (!isReadyForSet) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Text className="text-base text-destructive">Missing workout context for recording.</Text>
        <Pressable className="mt-4 px-4 py-2 rounded-lg bg-primary" onPress={() => router.back()}>
          <Text className="text-base font-semibold text-primary-foreground">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!cameraPermission || !micPermission) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={rawColors.primary} />
      </View>
    );
  }

  if (!permissionReady) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-lg font-semibold text-foreground mb-2">Camera access needed</Text>
        <Text className="text-sm text-center text-foreground-secondary mb-4">
          Enable camera and microphone permissions to record your set video.
        </Text>
        <Pressable
          className="px-4 py-2 rounded-lg bg-primary"
          onPress={handleRequestPermissions}
        >
          <Text className="text-base font-semibold text-primary-foreground">Grant Permissions</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: `Record ${exerciseName}`,
          headerStyle: { backgroundColor: rawColors.surface },
          headerTitleStyle: { color: rawColors.foreground },
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ padding: 8, marginLeft: -4 }}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={rawColors.foreground} />
            </Pressable>
          ),
        }}
      />

      <View className="flex-1 px-4 pt-4">
        <View className="flex-1 rounded-2xl overflow-hidden border border-border bg-black">
          <PinchGestureHandler onGestureEvent={handlePinchGesture} onHandlerStateChange={handlePinchStateChange}>
            <View className="flex-1">
              <CameraView
                ref={cameraRef}
                style={{ flex: 1 }}
                facing={facing}
                flash={flashMode}
                enableTorch={enableTorch}
                zoom={zoom}
                mode="video"
              />

              <View className="absolute top-3 left-3 right-3 flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={flashLabel}
                    className="px-3 py-2 rounded-full bg-surface-secondary border border-border"
                    style={({ pressed }) => [iconRotationStyle, { opacity: pressed ? 0.7 : 1 }]}
                    onPress={handleCycleFlash}
                  >
                    <MaterialCommunityIcons name={flashIcon} size={18} color={rawColors.foreground} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={enableTorch ? "Torch on" : "Torch off"}
                    className="px-3 py-2 rounded-full bg-surface-secondary border border-border"
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    onPress={handleToggleTorch}
                  >
                    <MaterialCommunityIcons
                      name={enableTorch ? "flashlight" : "flashlight-off"}
                      size={18}
                      color={rawColors.foreground}
                    />
                  </Pressable>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Flip camera"
                  className="px-3 py-2 rounded-full bg-surface-secondary border border-border"
                  style={({ pressed }) => [iconRotationStyle, { opacity: pressed ? 0.7 : 1 }]}
                  onPress={handleToggleFacing}
                >
                  <MaterialCommunityIcons name="camera-switch-outline" size={18} color={rawColors.foreground} />
                </Pressable>
              </View>

              {isRecording && (
                <View className="absolute left-3 top-16 flex-row items-center px-3 py-1 rounded-full bg-destructive">
                  <View className="w-2 h-2 rounded-full bg-white mr-2" />
                  <Text className="text-xs font-semibold text-primary-foreground">REC</Text>
                </View>
              )}

              <View className="absolute bottom-4 left-0 right-0 items-center">
                <View
                  className="px-4 py-2 rounded-full border border-border"
                  style={{ backgroundColor: rawColors.surfaceSecondary }}
                >
                  <View className="flex-row items-center gap-3">
                    <Text className="text-xs font-semibold text-foreground-secondary">{zoomLabel}</Text>
                    <View
                      className="h-2 rounded-full"
                      style={{ width: DEFAULT_SLIDER_WIDTH, backgroundColor: rawColors.border }}
                      onLayout={(event) => setSliderWidth(event.nativeEvent.layout.width)}
                      {...sliderPanResponder.panHandlers}
                    >
                      <View
                        className="h-full rounded-full"
                        style={{ width: `${zoom * 100}%`, backgroundColor: rawColors.primary }}
                      />
                      <View
                        className="absolute rounded-full border border-border"
                        style={{
                          width: thumbSize,
                          height: thumbSize,
                          left: thumbLeft,
                          top: -(thumbSize / 2 - 1),
                          backgroundColor: rawColors.surface,
                        }}
                      />
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </PinchGestureHandler>
        </View>
      </View>

      <View className="px-4 pb-5 pt-4 border-t border-border bg-background">
        <View className="flex-row items-center justify-between">
          <Pressable
            className="flex-row items-center px-3 py-2 rounded-full bg-surface-secondary"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : recordedUri ? 1 : 0.5 })}
            onPress={handleDiscardPress}
            disabled={!recordedUri}
          >
            <MaterialCommunityIcons name="refresh" size={18} color={rawColors.foreground} />
            <Text className="text-sm font-semibold ml-1.5 text-foreground">Retake</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isRecording ? "Stop recording" : "Start recording"}
            className="w-16 h-16 rounded-full items-center justify-center border-4 border-primary bg-background"
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
            onPress={isRecording ? handleStopPress : handleRecordPress}
          >
            <View
              className={`w-8 h-8 rounded-full ${isRecording ? "bg-destructive" : "bg-primary"}`}
            />
          </Pressable>

          <Pressable
            className={`flex-row items-center px-3 py-2 rounded-full ${
              canSaveVideo ? "bg-primary" : "bg-surface-secondary"
            }`}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : canSaveVideo ? 1 : 0.5 })}
            onPress={handleSavePress}
            disabled={!canSaveVideo}
          >
            <MaterialCommunityIcons
              name="content-save"
              size={18}
              color={canSaveVideo ? rawColors.primaryForeground : rawColors.foregroundMuted}
            />
            <Text
              className={`text-sm font-semibold ml-1.5 ${
                canSaveVideo ? "text-primary-foreground" : "text-foreground-muted"
              }`}
            >
              Save Video
            </Text>
          </Pressable>
        </View>

      </View>

      <BaseModal
        visible={showAddSetModal}
        onClose={() => setShowAddSetModal(false)}
        maxWidth={420}
      >
        <Text className="text-xl font-bold mb-2 text-foreground">Add Set</Text>
        <Text className="text-sm mb-4 text-foreground-secondary">
          Save this video to the LiftingLog album and log Set #{nextSetIndex}.
        </Text>

        <View className="flex-row gap-3 mb-4">
          <View className="flex-1">
            <Text className="text-sm font-medium mb-2 text-foreground-secondary">Weight (kg)</Text>
            <TextInput
              className="border border-border rounded-xl p-3.5 text-base bg-surface-secondary text-foreground"
              value={weight}
              onChangeText={setWeight}
              placeholder="0"
              placeholderTextColor={rawColors.foregroundMuted}
              keyboardType="decimal-pad"
            />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-medium mb-2 text-foreground-secondary">Reps</Text>
            <TextInput
              className="border border-border rounded-xl p-3.5 text-base bg-surface-secondary text-foreground"
              value={reps}
              onChangeText={setReps}
              placeholder="0"
              placeholderTextColor={rawColors.foregroundMuted}
              keyboardType="number-pad"
            />
          </View>
        </View>

        <View className="mb-4">
          <Text className="text-sm font-medium mb-2 text-foreground-secondary">Note (optional)</Text>
          <TextInput
            className="border border-border rounded-xl p-3.5 text-base min-h-[70px] bg-surface-secondary text-foreground"
            style={{ textAlignVertical: "top" }}
            value={note}
            onChangeText={setNote}
            placeholder="Add a note..."
            placeholderTextColor={rawColors.foregroundMuted}
            multiline
          />
        </View>

        <View className="flex-row gap-3">
          <Pressable
            className="flex-1 items-center justify-center p-3.5 rounded-lg bg-surface-secondary"
            onPress={() => setShowAddSetModal(false)}
            disabled={isSaving}
          >
            <Text className="text-base font-semibold text-foreground-secondary">Cancel</Text>
          </Pressable>
          <Pressable
            className={`flex-1 flex-row items-center justify-center p-3.5 rounded-lg gap-1.5 ${
              isSaving ? "bg-surface-secondary" : "bg-primary"
            }`}
            onPress={handleSaveSet}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={rawColors.foregroundMuted} />
            ) : (
              <MaterialCommunityIcons
                name="content-save"
                size={20}
                color={rawColors.primaryForeground}
              />
            )}
            <Text
              className={`text-base font-semibold ${
                isSaving ? "text-foreground-muted" : "text-primary-foreground"
              }`}
            >
              Add Set
            </Text>
          </Pressable>
        </View>
      </BaseModal>
    </View>
  );
}
