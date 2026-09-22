const {
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
} = require("expo/config-plugins");
const {
  patchAppBuildGradleContents,
  patchMainApplicationContents,
  syncAndroidRestoreNativeAssets,
} = require("../scripts/sync-android-restore-native");

function withAndroidRestoreNative(config) {
  const packageName = config.android?.package;
  if (!packageName) {
    throw new Error("withAndroidRestoreNative requires expo.android.package");
  }

  config = withMainApplication(config, (modConfig) => {
    if (modConfig.modResults.language !== "kt") {
      throw new Error("withAndroidRestoreNative requires a Kotlin MainApplication");
    }
    modConfig.modResults.contents = patchMainApplicationContents(
      modConfig.modResults.contents,
      packageName
    );
    return modConfig;
  });

  config = withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== "groovy") {
      throw new Error("withAndroidRestoreNative requires a Groovy Android app build file");
    }
    modConfig.modResults.contents = patchAppBuildGradleContents(
      modConfig.modResults.contents
    );
    return modConfig;
  });

  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      syncAndroidRestoreNativeAssets(modConfig.modRequest.projectRoot);
      return modConfig;
    },
  ]);
}

module.exports = withAndroidRestoreNative;
