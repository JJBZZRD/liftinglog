const fs = require("fs");
const path = require("path");

const SUPPORTED_EXPO_CAMERA_VERSIONS = new Set(["57.0.5"]);

const CAMERA_TRANSFORMATIONS = [
  {
    label: "orientation listener rotation update",
    before: [
      "        imageAnalysisUseCase?.targetRotation = rotation",
      "        imageCaptureUseCase?.targetRotation = rotation",
    ].join("\n"),
    after: [
      "        currentTargetRotation = rotation",
      "        imageAnalysisUseCase?.targetRotation = rotation",
      "        imageCaptureUseCase?.targetRotation = rotation",
      "        if (!isRecording) {",
      "          videoCaptureUseCase?.targetRotation = rotation",
      "        }",
    ].join("\n"),
  },
  {
    label: "video capture property",
    before: [
      "  var camera: Camera? = null",
      "  private var activeRecording: Recording? = null",
    ].join("\n"),
    after: [
      "  var camera: Camera? = null",
      "  private var activeRecording: Recording? = null",
      "  private var videoCaptureUseCase: VideoCapture<Recorder>? = null",
    ].join("\n"),
  },
  {
    label: "current target rotation property",
    before: [
      "  private var barcodeFormats: List<BarcodeType> = emptyList()",
      "  private var glSurfaceTexture: SurfaceTexture? = null",
      "  private var isRecording = false",
    ].join("\n"),
    after: [
      "  private var barcodeFormats: List<BarcodeType> = emptyList()",
      "  private var glSurfaceTexture: SurfaceTexture? = null",
      "  private var isRecording = false",
      "  private var currentTargetRotation = Surface.ROTATION_0",
    ].join("\n"),
  },
  {
    label: "record start target rotation",
    before: "    recorder?.let {\n",
    after: "    recorder?.let {\n      videoCaptureUseCase?.targetRotation = currentTargetRotation\n",
  },
  {
    label: "video capture build block",
    before: [
      "    return VideoCapture.Builder(recorder).apply {",
      "      if (mirror) {",
      "        setMirrorMode(MirrorMode.MIRROR_MODE_ON_FRONT_ONLY)",
      "      }",
      "      setVideoStabilizationEnabled(videoStabilizationMode.isEnabled())",
      "    }.build()",
    ].join("\n"),
    after: [
      "    return VideoCapture.Builder(recorder).apply {",
      "      if (mirror) {",
      "        setMirrorMode(MirrorMode.MIRROR_MODE_ON_FRONT_ONLY)",
      "      }",
      "      setVideoStabilizationEnabled(videoStabilizationMode.isEnabled())",
      "    }.build().also {",
      "      it.targetRotation = currentTargetRotation",
      "      videoCaptureUseCase = it",
      "    }",
    ].join("\n"),
  },
];

function countOccurrences(source, snippet) {
  return source.split(snippet).length - 1;
}

function getTransformationState(source, transformation) {
  const afterCount = countOccurrences(source, transformation.after);
  const beforeCount = countOccurrences(source, transformation.before);
  const nestedBeforeCount = countOccurrences(transformation.after, transformation.before);

  if (afterCount === 1 && beforeCount === nestedBeforeCount) {
    return "patched";
  }
  if (afterCount === 0 && beforeCount === 1) {
    return "unpatched";
  }

  throw new Error(
    `Expo Camera ${transformation.label} is neither exactly unpatched nor exactly patched ` +
      `(before=${beforeCount}, after=${afterCount})`
  );
}

function assertPatchedCameraSource(source) {
  for (const transformation of CAMERA_TRANSFORMATIONS) {
    if (getTransformationState(source, transformation) !== "patched") {
      throw new Error(`Expo Camera ${transformation.label} patch is missing`);
    }
  }
}

function applyExpoCameraOrientationPatchToSource(source) {
  const states = CAMERA_TRANSFORMATIONS.map((transformation) =>
    getTransformationState(source, transformation)
  );
  const patchedCount = states.filter((state) => state === "patched").length;

  if (patchedCount !== 0 && patchedCount !== CAMERA_TRANSFORMATIONS.length) {
    throw new Error("Expo Camera orientation source is only partially patched");
  }

  const nextSource =
    patchedCount === CAMERA_TRANSFORMATIONS.length
      ? source
      : CAMERA_TRANSFORMATIONS.reduce(
          (current, transformation) =>
            current.replace(transformation.before, transformation.after),
          source
        );

  assertPatchedCameraSource(nextSource);
  return nextSource;
}

function assertSupportedExpoCameraVersion(version) {
  if (!SUPPORTED_EXPO_CAMERA_VERSIONS.has(version)) {
    throw new Error(
      `Unsupported expo-camera version ${version}; review the Android orientation patch before install`
    );
  }
}

function getExpoCameraPaths(projectRoot = path.resolve(__dirname, "..")) {
  const packageRoot = path.join(projectRoot, "node_modules", "expo-camera");
  return {
    packageJsonPath: path.join(packageRoot, "package.json"),
    targetPath: path.join(
      packageRoot,
      "android",
      "src",
      "main",
      "java",
      "expo",
      "modules",
      "camera",
      "ExpoCameraView.kt"
    ),
  };
}

function patchExpoCameraOrientation(projectRoot = path.resolve(__dirname, "..")) {
  const { packageJsonPath, targetPath } = getExpoCameraPaths(projectRoot);
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Missing expo-camera package metadata: ${packageJsonPath}`);
  }
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ExpoCameraView.kt: ${targetPath}`);
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  assertSupportedExpoCameraVersion(packageJson.version);

  const source = fs.readFileSync(targetPath, "utf8");
  const nextSource = applyExpoCameraOrientationPatchToSource(source);
  if (nextSource !== source) {
    fs.writeFileSync(targetPath, nextSource, "utf8");
    console.log("[patch-expo-camera-orientation] Applied Expo camera Android orientation patch.");
  } else {
    console.log("[patch-expo-camera-orientation] Verified Expo camera Android orientation patch.");
  }
}

if (require.main === module) {
  try {
    patchExpoCameraOrientation();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = {
  CAMERA_TRANSFORMATIONS,
  SUPPORTED_EXPO_CAMERA_VERSIONS,
  applyExpoCameraOrientationPatchToSource,
  assertPatchedCameraSource,
  assertSupportedExpoCameraVersion,
  getExpoCameraPaths,
  patchExpoCameraOrientation,
};
