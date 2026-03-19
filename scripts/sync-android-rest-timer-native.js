const fs = require("fs");
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
    templateDir: path.join(projectRoot, "scripts", "android-rest-timer-native"),
    mainApplicationPath: path.join(javaRoot, "MainApplication.kt"),
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

function syncAndroidRestTimerNative(projectRoot = path.resolve(__dirname, "..")) {
  const paths = getPaths(projectRoot);
  ensureAndroidExists(paths);
  copyTemplate(paths, "RestTimerNotificationsModule.kt");
  copyTemplate(paths, "RestTimerNotificationsPackage.kt");
  copyLayoutTemplate(paths, "rest_timer_countdown_notification.xml");
  patchMainApplication(paths);
  console.log("Android rest timer native files are in sync.");
}

if (require.main === module) {
  try {
    syncAndroidRestTimerNative();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = { syncAndroidRestTimerNative };
