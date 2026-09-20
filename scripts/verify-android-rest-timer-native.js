const fs = require("fs");
const Jimp = require("jimp-compact");
const path = require("path");
const { AndroidConfig } = require("expo/config-plugins");
const {
  EXACT_ALARM_PERMISSION,
  KOTLIN_TEMPLATES,
  LAYOUT_TEMPLATES,
  RECEIVERS,
  buildNotificationSmallIcon,
  getPackageListApplyBlock,
  getExpoIdentity,
  getPaths,
} = require("./sync-android-rest-timer-native");

function countOccurrences(source, snippet) {
  return source.split(snippet).length - 1;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readRequiredFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required rest-timer file: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

function verifyTemplateParity(paths) {
  for (const filename of KOTLIN_TEMPLATES) {
    const template = readRequiredFile(path.join(paths.templateDir, filename));
    const generated = readRequiredFile(path.join(paths.notificationsDir, filename));
    assert(template.equals(generated), `Generated Kotlin file differs from template: ${filename}`);
  }
  for (const filename of LAYOUT_TEMPLATES) {
    const template = readRequiredFile(path.join(paths.templateDir, filename));
    const generated = readRequiredFile(path.join(paths.layoutDir, filename));
    assert(template.equals(generated), `Generated layout differs from template: ${filename}`);
  }
}

async function verifyNotificationIcon(paths) {
  const iconPath = path.join(paths.drawableDir, "rest_timer_notification_icon.png");
  readRequiredFile(iconPath);
  const [actual, expected] = await Promise.all([
    Jimp.read(iconPath),
    buildNotificationSmallIcon(paths),
  ]);
  assert(actual.bitmap.width === 96 && actual.bitmap.height === 96, "Notification icon must be 96x96");
  assert(
    actual.bitmap.data.equals(expected.bitmap.data),
    "Notification icon pixels do not match the splash-icon generator"
  );
}

function verifyMainApplication(paths) {
  const source = readRequiredFile(paths.mainApplicationPath).toString("utf8");
  const importLine =
    `import ${paths.packageName}.notifications.RestTimerNotificationsPackage`;
  const registrationPattern = /add\s*\(\s*RestTimerNotificationsPackage\s*\(\s*\)\s*\)/g;
  assert(countOccurrences(source, importLine) === 1, "Expected one rest-timer package import");
  assert(
    (source.match(registrationPattern) || []).length === 1,
    "Expected one rest-timer package registration"
  );
  assert(
    (getPackageListApplyBlock(source).match(registrationPattern) || []).length === 1,
    "Rest-timer package registration is outside the PackageList apply block"
  );
}

async function verifyManifest(paths) {
  const androidManifest = await AndroidConfig.Manifest.readAndroidManifestAsync(paths.manifestPath);
  const permissionCount = (androidManifest.manifest["uses-permission"] || []).filter(
    (permission) => permission?.$?.["android:name"] === EXACT_ALARM_PERMISSION
  ).length;
  assert(permissionCount === 1, `Expected one ${EXACT_ALARM_PERMISSION} permission`);

  const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  for (const receiverName of RECEIVERS) {
    const matches = (mainApplication.receiver || []).filter(
      (receiver) => receiver?.$?.["android:name"] === receiverName
    );
    assert(matches.length === 1, `Expected one ${receiverName} receiver`);
    assert(
      matches[0].$["android:exported"] === "false",
      `${receiverName} must set android:exported="false"`
    );
  }
}

function verifyAppConfiguration(identity) {
  const permissionNames = identity.appJson.expo.android.permissions || [];
  const exactAlarmCount = permissionNames.filter(
    (permission) =>
      permission === "SCHEDULE_EXACT_ALARM" || permission === EXACT_ALARM_PERMISSION
  ).length;
  assert(exactAlarmCount === 1, "app.json must configure SCHEDULE_EXACT_ALARM exactly once");

  const pluginNames = (identity.appJson.expo.plugins || []).map((plugin) =>
    Array.isArray(plugin) ? plugin[0] : plugin
  );
  assert(
    pluginNames.filter((plugin) => plugin === "./plugins/withAndroidRestTimerNative").length === 1,
    "app.json must configure withAndroidRestTimerNative exactly once"
  );
}

function verifyIdentityAndNativeInvariants(paths, identity) {
  const buildGradlePath = path.join(paths.androidRoot, "app", "build.gradle");
  const buildGradle = readRequiredFile(buildGradlePath).toString("utf8");
  assert(
    buildGradle.includes(`namespace '${identity.packageName}'`),
    "Gradle namespace does not match expo.android.package"
  );
  assert(
    buildGradle.includes(`applicationId '${identity.packageName}'`),
    "Gradle applicationId does not match expo.android.package"
  );

  const expectedPackageDeclaration = `package ${identity.packageName}.notifications`;
  for (const filename of KOTLIN_TEMPLATES) {
    const source = readRequiredFile(path.join(paths.templateDir, filename)).toString("utf8");
    assert(
      source.includes(expectedPackageDeclaration),
      `${filename} package does not match expo.android.package`
    );
  }

  const moduleSource = readRequiredFile(
    path.join(paths.templateDir, "RestTimerNotificationsModule.kt")
  ).toString("utf8");
  assert(
    moduleSource.includes('const val NAME = "RestTimerNotifications"'),
    "Native rest-timer module name has drifted"
  );
  const adapterSource = readRequiredFile(
    path.join(paths.projectRoot, "lib", "native", "restTimerNotifications.ts")
  ).toString("utf8");
  assert(
    adapterSource.includes("NativeModules.RestTimerNotifications"),
    "TypeScript adapter module name has drifted"
  );

  const managerSource = readRequiredFile(
    path.join(paths.templateDir, "RestTimerNotificationManager.kt")
  ).toString("utf8");
  const pendingIntentCount = (managerSource.match(/PendingIntent\.get(?:Activity|Broadcast)\s*\(/g) || [])
    .length;
  assert(pendingIntentCount > 0, "Rest-timer manager must create pending intents");
  assert(
    countOccurrences(managerSource, "PendingIntent.FLAG_IMMUTABLE") === pendingIntentCount,
    "Every rest-timer pending intent must include FLAG_IMMUTABLE"
  );
  assert(
    countOccurrences(managerSource, "PendingIntent.FLAG_UPDATE_CURRENT") === pendingIntentCount,
    "Every rest-timer pending intent must include FLAG_UPDATE_CURRENT"
  );
  assert(
    managerSource.includes("setExactAndAllowWhileIdle"),
    "Rest-timer manager must retain exact idle alarm scheduling"
  );

  const schemes = [...managerSource.matchAll(/\.scheme\("([^"]+)"\)/g)].map((match) => match[1]);
  assert(schemes.length > 0, "Rest-timer manager must define notification URI schemes");
  assert(
    schemes.every((scheme) => scheme === identity.scheme),
    "Rest-timer native URI scheme does not match expo.scheme"
  );

  const requiredReferences = [
    "R.layout.rest_timer_countdown_notification",
    "R.layout.rest_timer_countdown_notification_compact",
    "R.drawable.rest_timer_notification_icon",
    "R.drawable.splashscreen_logo",
    "MainActivity::class.java",
    "RestTimerCompletionReceiver::class.java",
    "RestTimerCountdownDismissedReceiver::class.java",
  ];
  for (const reference of requiredReferences) {
    assert(managerSource.includes(reference), `Missing native rest-timer reference: ${reference}`);
  }
}

async function verifyAndroidRestTimerNative(projectRoot = path.resolve(__dirname, "..")) {
  const identity = getExpoIdentity(projectRoot);
  const paths = getPaths(projectRoot);
  verifyTemplateParity(paths);
  await verifyNotificationIcon(paths);
  verifyMainApplication(paths);
  await verifyManifest(paths);
  verifyAppConfiguration(identity);
  verifyIdentityAndNativeInvariants(paths, identity);
  return { packageName: identity.packageName, scheme: identity.scheme };
}

if (require.main === module) {
  (async () => {
    try {
      const result = await verifyAndroidRestTimerNative();
      console.log(
        `Verified Android rest-timer native integration for ${result.packageName} (${result.scheme}).`
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  })();
}

module.exports = {
  verifyAndroidRestTimerNative,
  verifyAppConfiguration,
  verifyIdentityAndNativeInvariants,
  verifyMainApplication,
  verifyManifest,
  verifyNotificationIcon,
  verifyTemplateParity,
};
