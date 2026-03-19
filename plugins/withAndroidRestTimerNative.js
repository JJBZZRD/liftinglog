const { withDangerousMod } = require("@expo/config-plugins");
const { syncAndroidRestTimerNative } = require("../scripts/sync-android-rest-timer-native");

function withAndroidRestTimerNative(config) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      await syncAndroidRestTimerNative(modConfig.modRequest.projectRoot);
      return modConfig;
    },
  ]);
}

module.exports = withAndroidRestTimerNative;
