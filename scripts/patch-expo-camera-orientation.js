const fs = require("fs");
const path = require("path");

const targetPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "expo-camera",
  "android",
  "src",
  "main",
  "java",
  "expo",
  "modules",
  "camera",
  "ExpoCameraView.kt"
);

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) {
    return source;
  }
  if (!source.includes(before)) {
    throw new Error(`Could not find expected ${label} snippet in ExpoCameraView.kt`);
  }
  return source.replace(before, after);
}

function patchExpoCameraOrientation() {
  if (!fs.existsSync(targetPath)) {
    console.warn(`[patch-expo-camera-orientation] Skipped; file not found: ${targetPath}`);
    return;
  }

  let source = fs.readFileSync(targetPath, "utf8");

  source = replaceOnce(
    source,
    [
      "        imageAnalysisUseCase?.targetRotation = rotation",
      "        imageCaptureUseCase?.targetRotation = rotation",
    ].join("\n"),
    [
      "        currentTargetRotation = rotation",
      "        imageAnalysisUseCase?.targetRotation = rotation",
      "        imageCaptureUseCase?.targetRotation = rotation",
      "        if (!isRecording) {",
      "          videoCaptureUseCase?.targetRotation = rotation",
      "        }",
    ].join("\n"),
    "orientation listener rotation update"
  );

  source = replaceOnce(
    source,
    [
      "  var camera: Camera? = null",
      "  private var activeRecording: Recording? = null",
    ].join("\n"),
    [
      "  var camera: Camera? = null",
      "  private var activeRecording: Recording? = null",
      "  private var videoCaptureUseCase: VideoCapture<Recorder>? = null",
    ].join("\n"),
    "video capture property"
  );

  source = replaceOnce(
    source,
    [
      "  private var barcodeFormats: List<BarcodeType> = emptyList()",
      "  private var glSurfaceTexture: SurfaceTexture? = null",
      "  private var isRecording = false",
    ].join("\n"),
    [
      "  private var barcodeFormats: List<BarcodeType> = emptyList()",
      "  private var glSurfaceTexture: SurfaceTexture? = null",
      "  private var isRecording = false",
      "  private var currentTargetRotation = Surface.ROTATION_0",
    ].join("\n"),
    "current target rotation property"
  );

  source = replaceOnce(
    source,
    "    recorder?.let {\n",
    "    recorder?.let {\n      videoCaptureUseCase?.targetRotation = currentTargetRotation\n",
    "record start target rotation"
  );

  source = replaceOnce(
    source,
    [
      "    return VideoCapture.Builder(recorder).apply {",
      "      if (mirror) {",
      "        setMirrorMode(MirrorMode.MIRROR_MODE_ON_FRONT_ONLY)",
      "      }",
      "      setVideoStabilizationEnabled(true)",
      "    }.build()",
    ].join("\n"),
    [
      "    return VideoCapture.Builder(recorder).apply {",
      "      if (mirror) {",
      "        setMirrorMode(MirrorMode.MIRROR_MODE_ON_FRONT_ONLY)",
      "      }",
      "      setVideoStabilizationEnabled(true)",
      "    }.build().also {",
      "      it.targetRotation = currentTargetRotation",
      "      videoCaptureUseCase = it",
      "    }",
    ].join("\n"),
    "video capture build block"
  );

  fs.writeFileSync(targetPath, source, "utf8");
  console.log("[patch-expo-camera-orientation] Applied Expo camera Android orientation patch.");
}

patchExpoCameraOrientation();
