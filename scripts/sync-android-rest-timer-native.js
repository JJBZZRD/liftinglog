const fs = require("fs");
const Jimp = require("jimp-compact");
const path = require("path");
const { AndroidConfig } = require("expo/config-plugins");

const KOTLIN_TEMPLATES = [
  "RestTimerNotificationsModule.kt",
  "RestTimerNotificationManager.kt",
  "RestTimerCompletionReceiver.kt",
  "RestTimerCountdownDismissedReceiver.kt",
  "RestTimerNotificationsPackage.kt",
];
const LAYOUT_TEMPLATES = [
  "rest_timer_countdown_notification.xml",
  "rest_timer_countdown_notification_compact.xml",
];
const EXACT_ALARM_PERMISSION = "android.permission.SCHEDULE_EXACT_ALARM";
const RECEIVERS = [
  ".notifications.RestTimerCompletionReceiver",
  ".notifications.RestTimerCountdownDismissedReceiver",
];

function countOccurrences(source, snippet) {
  return source.split(snippet).length - 1;
}

function getPackageListApplyBlock(contents) {
  const anchorPattern = /PackageList\(this\)\.packages\.apply\s*\{/g;
  const matches = [...contents.matchAll(anchorPattern)];
  if (matches.length !== 1) {
    throw new Error("Could not find the unique PackageList apply block in MainApplication.kt");
  }

  const blockStart = matches[0].index;
  const openingBrace = contents.indexOf("{", blockStart);
  let depth = 0;
  for (let index = openingBrace; index < contents.length; index += 1) {
    if (contents[index] === "{") {
      depth += 1;
    } else if (contents[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return contents.slice(blockStart, index + 1);
      }
    }
  }

  throw new Error("PackageList apply block is not balanced in MainApplication.kt");
}

function getExpoIdentity(projectRoot) {
  const appJsonPath = path.join(projectRoot, "app.json");
  if (!fs.existsSync(appJsonPath)) {
    throw new Error(`Missing Expo app configuration: ${appJsonPath}`);
  }

  const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
  const packageName = appJson?.expo?.android?.package;
  const scheme = appJson?.expo?.scheme;
  if (typeof packageName !== "string" || !packageName) {
    throw new Error("app.json must define expo.android.package for the rest-timer native module");
  }
  if (typeof scheme !== "string" || !scheme) {
    throw new Error("app.json must define one Expo scheme for the rest-timer native module");
  }

  return { appJson, appJsonPath, packageName, scheme };
}

function getPaths(projectRoot) {
  const { packageName } = getExpoIdentity(projectRoot);
  const androidRoot = path.join(projectRoot, "android");
  const javaRoot = path.join(
    androidRoot,
    "app",
    "src",
    "main",
    "java",
    ...packageName.split(".")
  );

  return {
    projectRoot,
    packageName,
    androidRoot,
    javaRoot,
    notificationsDir: path.join(javaRoot, "notifications"),
    layoutDir: path.join(androidRoot, "app", "src", "main", "res", "layout"),
    drawableDir: path.join(androidRoot, "app", "src", "main", "res", "drawable"),
    templateDir: path.join(projectRoot, "scripts", "android-rest-timer-native"),
    assetsImageDir: path.join(projectRoot, "assets", "images"),
    mainApplicationPath: path.join(javaRoot, "MainApplication.kt"),
    manifestPath: path.join(androidRoot, "app", "src", "main", "AndroidManifest.xml"),
  };
}

function ensureAndroidExists(paths) {
  if (!fs.existsSync(paths.androidRoot)) {
    throw new Error(
      "android/ does not exist. Run `npx expo prebuild --platform android --clean` first."
    );
  }
}

function copyTemplate(paths, filename, destinationDir) {
  const sourcePath = path.join(paths.templateDir, filename);
  const destinationPath = path.join(destinationDir, filename);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing template file: ${sourcePath}`);
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
  console.log(`Synced ${path.relative(paths.projectRoot, destinationPath)}`);
}

function getImagePixel(image, x, y) {
  const index = (image.bitmap.width * y + x) * 4;
  return {
    red: image.bitmap.data[index],
    green: image.bitmap.data[index + 1],
    blue: image.bitmap.data[index + 2],
    alpha: image.bitmap.data[index + 3],
  };
}

function getSplashIconContentBounds(image) {
  const backgroundPixel = getImagePixel(image, 0, 0);
  let minX = image.bitmap.width;
  let minY = image.bitmap.height;
  let maxX = -1;
  let maxY = -1;

  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function scan(x, y, idx) {
    const alpha = this.bitmap.data[idx + 3];
    const distanceFromBackground = Math.max(
      Math.abs(this.bitmap.data[idx] - backgroundPixel.red),
      Math.abs(this.bitmap.data[idx + 1] - backgroundPixel.green),
      Math.abs(this.bitmap.data[idx + 2] - backgroundPixel.blue)
    );

    if (alpha < 16 || distanceFromBackground <= 12) {
      return;
    }

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });

  if (maxX < minX || maxY < minY) {
    throw new Error("Unable to detect logo bounds in splash-icon.png");
  }

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

async function buildNotificationSmallIcon(paths) {
  const sourcePath = path.join(paths.assetsImageDir, "splash-icon.png");
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing asset image: ${sourcePath}`);
  }

  const outputSize = 96;
  const fillSize = Math.round(outputSize * 0.9);
  const sourceImage = await Jimp.read(sourcePath);
  const bounds = getSplashIconContentBounds(sourceImage);
  const backgroundPixel = getImagePixel(sourceImage, 0, 0);
  const iconMask = sourceImage
    .clone()
    .crop(bounds.left, bounds.top, bounds.width, bounds.height)
    .scan(0, 0, bounds.width, bounds.height, function scan(x, y, idx) {
      const distanceFromBackground = Math.max(
        Math.abs(this.bitmap.data[idx] - backgroundPixel.red),
        Math.abs(this.bitmap.data[idx + 1] - backgroundPixel.green),
        Math.abs(this.bitmap.data[idx + 2] - backgroundPixel.blue)
      );
      const alpha = Math.round((this.bitmap.data[idx + 3] / 255) * distanceFromBackground);

      this.bitmap.data[idx] = 255;
      this.bitmap.data[idx + 1] = 255;
      this.bitmap.data[idx + 2] = 255;
      this.bitmap.data[idx + 3] = alpha;
    })
    .scaleToFit(fillSize, fillSize, Jimp.RESIZE_BICUBIC);

  const outputImage = await new Jimp(outputSize, outputSize, 0x00000000);
  outputImage.composite(
    iconMask,
    Math.round((outputSize - iconMask.bitmap.width) / 2),
    Math.round((outputSize - iconMask.bitmap.height) / 2)
  );
  return outputImage;
}

async function generateNotificationSmallIcon(paths) {
  const destinationPath = path.join(paths.drawableDir, "rest_timer_notification_icon.png");
  const outputImage = await buildNotificationSmallIcon(paths);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  await outputImage.writeAsync(destinationPath);
  console.log(`Generated ${path.relative(paths.projectRoot, destinationPath)} from splash-icon.png`);
}

function patchMainApplicationContents(contents, packageName) {
  const importLine = `import ${packageName}.notifications.RestTimerNotificationsPackage`;
  const packageRegistration = "add(RestTimerNotificationsPackage())";

  if (!contents.includes(`package ${packageName}`)) {
    throw new Error(`MainApplication.kt package does not match ${packageName}`);
  }

  const importCount = countOccurrences(contents, importLine);
  const anyRestTimerImportCount = (
    contents.match(/^import .*\.notifications\.RestTimerNotificationsPackage$/gm) || []
  ).length;
  if (anyRestTimerImportCount !== importCount) {
    throw new Error("MainApplication.kt contains a rest-timer import for a different package");
  }
  if (importCount > 1) {
    throw new Error("MainApplication.kt contains duplicate rest-timer package imports");
  }
  if (importCount === 0) {
    const importAnchor = "import expo.modules.ApplicationLifecycleDispatcher";
    if (countOccurrences(contents, importAnchor) !== 1) {
      throw new Error("Could not find the unique Expo import anchor in MainApplication.kt");
    }
    contents = contents.replace(importAnchor, `${importLine}\n${importAnchor}`);
  }

  const registrationPattern = /add\s*\(\s*RestTimerNotificationsPackage\s*\(\s*\)\s*\)/g;
  const registrationCount = (contents.match(registrationPattern) || []).length;
  if (registrationCount > 1) {
    throw new Error("MainApplication.kt contains duplicate rest-timer package registrations");
  }
  if (registrationCount === 0) {
    const packageListAnchor = /PackageList\(this\)\.packages\.apply\s*\{\r?\n/g;
    if ((contents.match(packageListAnchor) || []).length !== 1) {
      throw new Error("Could not find the unique PackageList apply block in MainApplication.kt");
    }
    contents = contents.replace(
      packageListAnchor,
      (match) => `${match}          ${packageRegistration}\n`
    );
  }

  if (countOccurrences(contents, importLine) !== 1) {
    throw new Error("Failed to write exactly one rest-timer package import");
  }
  if ((contents.match(registrationPattern) || []).length !== 1) {
    throw new Error("Failed to write exactly one rest-timer package registration");
  }
  if ((getPackageListApplyBlock(contents).match(registrationPattern) || []).length !== 1) {
    throw new Error("Rest-timer package registration is outside the PackageList apply block");
  }
  return contents;
}

function ensureRestTimerManifestEntries(androidManifest) {
  const manifest = androidManifest.manifest;
  let foundExactAlarmPermission = false;
  manifest["uses-permission"] = (manifest["uses-permission"] || []).filter((permission) => {
    if (permission?.$?.["android:name"] !== EXACT_ALARM_PERMISSION) {
      return true;
    }
    if (foundExactAlarmPermission) {
      return false;
    }
    foundExactAlarmPermission = true;
    permission.$ = { "android:name": EXACT_ALARM_PERMISSION };
    return true;
  });
  if (!foundExactAlarmPermission) {
    manifest["uses-permission"].push({
      $: { "android:name": EXACT_ALARM_PERMISSION },
    });
  }

  const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  const foundReceivers = new Set();
  mainApplication.receiver = (mainApplication.receiver || []).filter((receiver) => {
    const receiverName = receiver?.$?.["android:name"];
    if (!RECEIVERS.includes(receiverName)) {
      return true;
    }
    if (foundReceivers.has(receiverName)) {
      return false;
    }
    foundReceivers.add(receiverName);
    receiver.$ = {
      "android:name": receiverName,
      "android:exported": "false",
    };
    return true;
  });
  for (const receiverName of RECEIVERS) {
    if (!foundReceivers.has(receiverName)) {
      mainApplication.receiver.push({
        $: {
          "android:name": receiverName,
          "android:exported": "false",
        },
      });
    }
  }
  return androidManifest;
}

function patchMainApplication(paths) {
  if (!fs.existsSync(paths.mainApplicationPath)) {
    throw new Error(`Missing MainApplication.kt: ${paths.mainApplicationPath}`);
  }
  const original = fs.readFileSync(paths.mainApplicationPath, "utf8");
  const next = patchMainApplicationContents(original, paths.packageName);
  if (next !== original) {
    fs.writeFileSync(paths.mainApplicationPath, next, "utf8");
  }
  console.log(`Verified ${path.relative(paths.projectRoot, paths.mainApplicationPath)}`);
}

async function patchAndroidManifest(paths) {
  if (!fs.existsSync(paths.manifestPath)) {
    throw new Error(`Missing AndroidManifest.xml: ${paths.manifestPath}`);
  }
  const androidManifest = await AndroidConfig.Manifest.readAndroidManifestAsync(paths.manifestPath);
  ensureRestTimerManifestEntries(androidManifest);
  await AndroidConfig.Manifest.writeAndroidManifestAsync(paths.manifestPath, androidManifest);
  console.log(`Verified ${path.relative(paths.projectRoot, paths.manifestPath)}`);
}

async function syncAndroidRestTimerNativeAssets(projectRoot = path.resolve(__dirname, "..")) {
  const paths = getPaths(projectRoot);
  ensureAndroidExists(paths);
  for (const filename of KOTLIN_TEMPLATES) {
    copyTemplate(paths, filename, paths.notificationsDir);
  }
  for (const filename of LAYOUT_TEMPLATES) {
    copyTemplate(paths, filename, paths.layoutDir);
  }
  await generateNotificationSmallIcon(paths);
  return paths;
}

async function syncAndroidRestTimerNative(projectRoot = path.resolve(__dirname, "..")) {
  const paths = await syncAndroidRestTimerNativeAssets(projectRoot);
  patchMainApplication(paths);
  await patchAndroidManifest(paths);
  console.log("Android rest timer native files are in sync.");
}

if (require.main === module) {
  (async () => {
    try {
      await syncAndroidRestTimerNative();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  })();
}

module.exports = {
  EXACT_ALARM_PERMISSION,
  KOTLIN_TEMPLATES,
  LAYOUT_TEMPLATES,
  RECEIVERS,
  buildNotificationSmallIcon,
  ensureRestTimerManifestEntries,
  getExpoIdentity,
  getPackageListApplyBlock,
  getPaths,
  patchMainApplicationContents,
  syncAndroidRestTimerNative,
  syncAndroidRestTimerNativeAssets,
};
