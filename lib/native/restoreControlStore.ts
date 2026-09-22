import { NativeModules, Platform } from "react-native";

export type RestoreControlRecordName = "pending" | "outcome";

export type RestoreControlRecordReadResult =
  | { status: "absent" }
  | { status: "present"; json: string }
  | { status: "unreadable"; code: string }
  | { status: "unavailable" };

export type RestoreControlStoreErrorCode =
  | "invalid_name"
  | "invalid_json"
  | "record_too_large"
  | "unavailable"
  | "write_failed"
  | "delete_failed";

export const RESTORE_CONTROL_RECORD_MAX_BYTES = 256 * 1024;

export class RestoreControlStoreError extends Error {
  readonly code: RestoreControlStoreErrorCode;
  readonly nativeCause: unknown;

  constructor(code: RestoreControlStoreErrorCode, message: string, nativeCause?: unknown) {
    super(message);
    this.name = "RestoreControlStoreError";
    this.code = code;
    this.nativeCause = nativeCause;
  }
}

type NativeReadResult =
  | { status: "absent" }
  | { status: "present"; json: string }
  | { status: "unreadable"; code: string };

type NativeRestoreControlStoreModule = {
  readRestoreControlRecord(name: string): unknown;
  writeRestoreControlRecord(name: string, json: string): unknown;
  deleteRestoreControlRecord(name: string): unknown;
};

function assertRecordName(name: unknown): asserts name is RestoreControlRecordName {
  if (name !== "pending" && name !== "outcome") {
    throw new RestoreControlStoreError(
      "invalid_name",
      'Restore control record name must be exactly "pending" or "outcome".'
    );
  }
}

function getNativeModule(): NativeRestoreControlStoreModule | null {
  if (Platform.OS !== "android") {
    return null;
  }

  try {
    const nativeModule = NativeModules.RestoreControlStore as
      | NativeRestoreControlStoreModule
      | undefined;
    return nativeModule ?? null;
  } catch {
    return null;
  }
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) {
        return true;
      }
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff) {
        return true;
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function getUtf8ByteLength(value: string): number {
  let byteLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      byteLength += 1;
    } else if (codeUnit <= 0x7ff) {
      byteLength += 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      byteLength += 4;
      index += 1;
    } else {
      byteLength += 3;
    }
  }
  return byteLength;
}

function assertBoundedJsonObject(json: unknown): asserts json is string {
  if (typeof json !== "string" || hasUnpairedSurrogate(json)) {
    throw new RestoreControlStoreError(
      "invalid_json",
      "Restore control records must be valid UTF-8 JSON object strings."
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new RestoreControlStoreError(
      "invalid_json",
      "Restore control records must be valid JSON object strings."
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RestoreControlStoreError(
      "invalid_json",
      "Restore control records must contain a JSON object."
    );
  }

  if (getUtf8ByteLength(json) > RESTORE_CONTROL_RECORD_MAX_BYTES) {
    throw new RestoreControlStoreError(
      "record_too_large",
      `Restore control records are limited to ${RESTORE_CONTROL_RECORD_MAX_BYTES} UTF-8 bytes.`
    );
  }
}

function isNativeReadResult(value: unknown): value is NativeReadResult {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as { status?: unknown; json?: unknown; code?: unknown };
  if (candidate.status === "absent") {
    return true;
  }
  if (candidate.status === "present") {
    return typeof candidate.json === "string";
  }
  if (candidate.status === "unreadable") {
    return typeof candidate.code === "string" && candidate.code.length > 0;
  }
  return false;
}

export function readRestoreControlRecord(
  name: RestoreControlRecordName
): RestoreControlRecordReadResult {
  assertRecordName(name);
  const nativeModule = getNativeModule();
  if (!nativeModule || typeof nativeModule.readRestoreControlRecord !== "function") {
    return { status: "unavailable" };
  }

  try {
    const result = nativeModule.readRestoreControlRecord(name);
    return isNativeReadResult(result)
      ? result
      : { status: "unreadable", code: "invalid_native_response" };
  } catch {
    return { status: "unreadable", code: "native_read_failed" };
  }
}

export function writeRestoreControlRecord(name: RestoreControlRecordName, json: string): void {
  assertRecordName(name);
  assertBoundedJsonObject(json);
  const nativeModule = getNativeModule();
  if (!nativeModule || typeof nativeModule.writeRestoreControlRecord !== "function") {
    throw new RestoreControlStoreError(
      "unavailable",
      "The native restore control store is unavailable."
    );
  }

  try {
    if (nativeModule.writeRestoreControlRecord(name, json) !== true) {
      throw new Error("Native restore control write did not acknowledge publication.");
    }
  } catch (error) {
    throw new RestoreControlStoreError(
      "write_failed",
      `Failed to publish the ${name} restore control record.`,
      error
    );
  }
}

export function deleteRestoreControlRecord(name: RestoreControlRecordName): void {
  assertRecordName(name);
  const nativeModule = getNativeModule();
  if (!nativeModule || typeof nativeModule.deleteRestoreControlRecord !== "function") {
    throw new RestoreControlStoreError(
      "unavailable",
      "The native restore control store is unavailable."
    );
  }

  try {
    if (nativeModule.deleteRestoreControlRecord(name) !== true) {
      throw new Error("Native restore control delete did not acknowledge completion.");
    }
  } catch (error) {
    throw new RestoreControlStoreError(
      "delete_failed",
      `Failed to delete the ${name} restore control record.`,
      error
    );
  }
}
