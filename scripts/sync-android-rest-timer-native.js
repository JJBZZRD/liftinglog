const fs = require("fs");
const Jimp = require("jimp-compact");
const path = require("path");

const importLine = "import com.anonymous.LiftingLog.notifications.RestTimerNotificationsPackage";
const packageLine = "              add(RestTimerNotificationsPackage())";

function getPaths(projectRoot) {
  const androidRoot = path.join(projectRoot, "android");
  const javaRoot = path.join(
    androidRoot,
    "app",
    "src",
    "main",
    "java",
    "com",
    "anonymous",
    "LiftingLog"
  );

  return {
    projectRoot,
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
  const { androidRoot } = paths;
  if (!fs.existsSync(androidRoot)) {
    throw new Error(
      "android/ does not exist. Run `npx expo prebuild --platform android --clean` first."
    );
  }
}

function copyTemplate(paths, filename) {
  const sourcePath = path.join(paths.templateDir, filename);
  const destinationPath = path.join(paths.notificationsDir, filename);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing template file: ${sourcePath}`);
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
  console.log(`Synced ${path.relative(paths.projectRoot, destinationPath)}`);
}

function copyLayoutTemplate(paths, filename) {
  const sourcePath = path.join(paths.templateDir, filename);
  const destinationPath = path.join(paths.layoutDir, filename);

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

async function generateNotificationSmallIcon(paths) {
  const sourcePath = path.join(paths.assetsImageDir, "splash-icon.png");
  const destinationPath = path.join(paths.drawableDir, "rest_timer_notification_icon.png");

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

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  await outputImage.writeAsync(destinationPath);
  console.log(`Generated ${path.relative(paths.projectRoot, destinationPath)} from splash-icon.png`);
}

function patchMainApplication(paths) {
  const { mainApplicationPath, projectRoot } = paths;
  if (!fs.existsSync(mainApplicationPath)) {
    throw new Error(`Missing MainApplication.kt: ${mainApplicationPath}`);
  }

  let contents = fs.readFileSync(mainApplicationPath, "utf8");

  if (!contents.includes(importLine)) {
    if (contents.includes("import expo.modules.ApplicationLifecycleDispatcher")) {
      contents = contents.replace(
        "import expo.modules.ApplicationLifecycleDispatcher",
        `${importLine}\nimport expo.modules.ApplicationLifecycleDispatcher`
      );
    } else {
      contents = contents.replace(
        /package\s+com\.anonymous\.LiftingLog\s*\n+/,
        (match) => `${match}${importLine}\n`
      );
    }
  }

  if (!contents.includes(packageLine)) {
    contents = contents.replace(
      /PackageList\(this\)\.packages\.apply\s*\{\n/,
      (match) => `${match}${packageLine}\n`
    );
  }

  fs.writeFileSync(mainApplicationPath, contents, "utf8");
  console.log(`Patched ${path.relative(projectRoot, mainApplicationPath)}`);
}

function patchAndroidManifest(paths) {
  const { manifestPath, projectRoot } = paths;
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing AndroidManifest.xml: ${manifestPath}`);
  }

  let contents = fs.readFileSync(manifestPath, "utf8");
  const exactAlarmPermission =
    '  <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM"/>';
  const receiverSnippet =
    '    <receiver android:name=".notifications.RestTimerCompletionReceiver" android:exported="false"/>';
  const dismissReceiverSnippet =
    '    <receiver android:name=".notifications.RestTimerCountdownDismissedReceiver" android:exported="false"/>';

  if (!contents.includes("android.permission.SCHEDULE_EXACT_ALARM")) {
    contents = contents.replace("<uses-permission android:name=\"android.permission.RECORD_AUDIO\"/>",
      `<uses-permission android:name="android.permission.RECORD_AUDIO"/>\n${exactAlarmPermission}`
    );
  }

  if (!contents.includes("RestTimerCompletionReceiver")) {
    contents = contents.replace("</application>", `${receiverSnippet}\n  </application>`);
  }

  if (!contents.includes("RestTimerCountdownDismissedReceiver")) {
    contents = contents.replace("</application>", `${dismissReceiverSnippet}\n  </application>`);
  }

  fs.writeFileSync(manifestPath, contents, "utf8");
  console.log(`Patched ${path.relative(projectRoot, manifestPath)}`);
}

async function syncAndroidRestTimerNative(projectRoot = path.resolve(__dirname, "..")) {
  const paths = getPaths(projectRoot);
  ensureAndroidExists(paths);
  copyTemplate(paths, "RestTimerNotificationsModule.kt");
  copyTemplate(paths, "RestTimerNotificationManager.kt");
  copyTemplate(paths, "RestTimerCompletionReceiver.kt");
  copyTemplate(paths, "RestTimerCountdownDismissedReceiver.kt");
  copyTemplate(paths, "RestTimerNotificationsPackage.kt");
  copyLayoutTemplate(paths, "rest_timer_countdown_notification.xml");
  copyLayoutTemplate(paths, "rest_timer_countdown_notification_compact.xml");
  await generateNotificationSmallIcon(paths);
  patchMainApplication(paths);
  patchAndroidManifest(paths);
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

module.exports = { syncAndroidRestTimerNative };
