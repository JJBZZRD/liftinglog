import { NativeModules, Platform } from "react-native";

declare const nativeProcessTokenBrand: unique symbol;

export type NativeProcessToken = string & {
  readonly [nativeProcessTokenBrand]: "NativeProcessToken";
};

type NativeAppProcessIdentityModule = {
  getNativeProcessToken(): unknown;
};

const NATIVE_PROCESS_TOKEN_PATTERN =
  /^process-v1:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isNativeProcessToken(value: unknown): value is NativeProcessToken {
  return typeof value === "string" && NATIVE_PROCESS_TOKEN_PATTERN.test(value);
}

export function getNativeProcessToken(): NativeProcessToken | null {
  if (Platform.OS !== "android") {
    return null;
  }

  try {
    const nativeModule = NativeModules.AppProcessIdentity as
      | NativeAppProcessIdentityModule
      | undefined;
    if (!nativeModule || typeof nativeModule.getNativeProcessToken !== "function") {
      return null;
    }

    const token = nativeModule.getNativeProcessToken();
    return isNativeProcessToken(token) ? token : null;
  } catch {
    return null;
  }
}
