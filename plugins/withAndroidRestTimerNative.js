const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require("expo/config-plugins");
const {
  ensureRestTimerManifestEntries,
  patchMainApplicationContents,
  syncAndroidRestTimerNativeAssets,
} = require("../scripts/sync-android-rest-timer-native");

function withAndroidRestTimerNative(config) {
  const packageName = config.android?.package;
  if (!packageName) {
    throw new Error("withAndroidRestTimerNative requires expo.android.package");
  }

  config = withMainApplication(config, (modConfig) => {
    if (modConfig.modResults.language !== "kt") {
      throw new Error("withAndroidRestTimerNative requires a Kotlin MainApplication");
    }
    modConfig.modResults.contents = patchMainApplicationContents(
      modConfig.modResults.contents,
      packageName
    );
    return modConfig;
  });

  config = withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = ensureRestTimerManifestEntries(modConfig.modResults, packageName);
    return modConfig;
  });

  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      await syncAndroidRestTimerNativeAssets(modConfig.modRequest.projectRoot);
      return modConfig;
    },
  ]);
}

module.exports = withAndroidRestTimerNative;
