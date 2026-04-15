import { Platform, UIManager } from "react-native";

type FabricGlobal = typeof globalThis & {
  nativeFabricUIManager?: unknown;
};

let hasEnabledLegacyAndroidLayoutAnimations = false;

export function enableLegacyAndroidLayoutAnimationsIfNeeded(): void {
  if (hasEnabledLegacyAndroidLayoutAnimations || Platform.OS !== "android") {
    return;
  }

  // New Architecture ignores the experimental Android toggle and logs a warning.
  if ((globalThis as FabricGlobal).nativeFabricUIManager != null) {
    return;
  }

  if (!UIManager.setLayoutAnimationEnabledExperimental) {
    return;
  }

  UIManager.setLayoutAnimationEnabledExperimental(true);
  hasEnabledLegacyAndroidLayoutAnimations = true;
}
