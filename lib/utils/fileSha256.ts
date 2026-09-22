import { sha256 } from "@noble/hashes/sha2.js";
import { File, FileMode, Paths } from "expo-file-system";
import { Platform } from "react-native";
import {
  sha256FileNative,
  sha256FileNativeSync,
} from "../native/fileSha256";

export const DEFAULT_MAX_SHA256_FILE_BYTES = 256 * 1024 * 1024;
export const SHA256_FILE_CHUNK_BYTES = 64 * 1024;

type Sha256FileOptions = {
  maxBytes?: number;
};

type Sha256FileAsyncOptions = Sha256FileOptions & {
  signal?: AbortSignal;
};

type Sha256FileResult = {
  sha256: string;
  bytes: number;
};

const ASYNC_YIELD_CHUNKS = 16;

function resolveMaxBytes(maxBytes: number | undefined): number {
  const resolved = maxBytes ?? DEFAULT_MAX_SHA256_FILE_BYTES;
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    throw new RangeError("maxBytes must be a non-negative safe integer.");
  }
  return resolved;
}

function assertLocalFileUri(uri: string): void {
  if (typeof uri !== "string" || uri.trim().length === 0) {
    throw new TypeError("A non-empty local file URI is required.");
  }
  if (!uri.startsWith("file:///")) {
    throw new TypeError("Only local file:// URIs can be hashed.");
  }
}

function assertValidSize(size: unknown, label: string): asserts size is number {
  if (
    typeof size !== "number" ||
    !Number.isSafeInteger(size) ||
    size < 0
  ) {
    throw new Error(`${label} is unavailable or invalid.`);
  }
}

function readReportedSize(file: File, uri: string): number {
  const pathInfo = Paths.info(uri);
  if (!pathInfo.exists) {
    throw new Error("File does not exist or cannot be read.");
  }
  if (pathInfo.isDirectory !== false) {
    throw new Error("The SHA-256 source must be a file, not a directory.");
  }
  if (!file.exists) {
    throw new Error("File does not exist or cannot be read.");
  }

  const fileInfo = file.info();
  if (!fileInfo.exists) {
    throw new Error("File does not exist or cannot be read.");
  }
  assertValidSize(fileInfo.size, "File size");
  return fileInfo.size;
}

function prepareFile(
  uri: string,
  maxBytesOption: number | undefined
): { file: File; expectedBytes: number; maxBytes: number } {
  assertLocalFileUri(uri);
  const maxBytes = resolveMaxBytes(maxBytesOption);
  const pathInfo = Paths.info(uri);
  if (!pathInfo.exists) {
    throw new Error("File does not exist or cannot be read.");
  }
  if (pathInfo.isDirectory !== false) {
    throw new Error("The SHA-256 source must be a file, not a directory.");
  }

  const file = new File(uri);
  const expectedBytes = readReportedSize(file, uri);
  if (expectedBytes > maxBytes) {
    throw new RangeError(
      `File size ${expectedBytes} exceeds the ${maxBytes}-byte SHA-256 limit.`
    );
  }
  return { file, expectedBytes, maxBytes };
}

function assertHandleSize(size: number | null, expectedBytes: number): void {
  assertValidSize(size, "Open file size");
  if (size !== expectedBytes) {
    throw new Error("File size changed before hashing completed.");
  }
}

function readExactChunk(
  readBytes: (length: number) => Uint8Array,
  requestedBytes: number,
  totalBytes: number,
  maxBytes: number
): Uint8Array {
  const chunk = readBytes(requestedBytes);
  if (!(chunk instanceof Uint8Array)) {
    throw new Error("File read returned invalid byte data.");
  }
  if (chunk.byteLength !== requestedBytes) {
    const kind = chunk.byteLength < requestedBytes ? "short" : "long";
    throw new Error(`Unexpected ${kind} file read.`);
  }
  if (totalBytes + chunk.byteLength > maxBytes) {
    throw new RangeError(`File exceeds the ${maxBytes}-byte SHA-256 limit.`);
  }
  return chunk;
}

function assertEndOfFile(
  readBytes: (length: number) => Uint8Array,
  totalBytes: number,
  maxBytes: number
): void {
  const trailing = readBytes(1);
  if (!(trailing instanceof Uint8Array)) {
    throw new Error("File read returned invalid byte data.");
  }
  if (totalBytes + trailing.byteLength > maxBytes) {
    throw new RangeError(`File exceeds the ${maxBytes}-byte SHA-256 limit.`);
  }
  if (trailing.byteLength !== 0) {
    throw new Error("File is longer than its reported size.");
  }
}

function bytesToLowerHex(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, "0");
  }
  return result;
}

function assertUnchangedFile(
  file: File,
  uri: string,
  expectedBytes: number,
  handleSize: number | null
): void {
  assertHandleSize(handleSize, expectedBytes);
  if (readReportedSize(file, uri) !== expectedBytes) {
    throw new Error("File size changed before hashing completed.");
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) {
    return;
  }
  if (signal.reason instanceof Error) {
    throw signal.reason;
  }
  const error = new Error("SHA-256 hashing was aborted.");
  error.name = "AbortError";
  throw error;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function sha256FileSync(
  uri: string,
  options: Sha256FileOptions = {}
): Sha256FileResult {
  assertLocalFileUri(uri);
  const resolvedMaxBytes = resolveMaxBytes(options.maxBytes);
  if (Platform.OS === "android") {
    return sha256FileNativeSync(uri, resolvedMaxBytes);
  }

  const { file, expectedBytes, maxBytes } = prepareFile(uri, resolvedMaxBytes);
  const hash = sha256.create();
  let handle: ReturnType<File["open"]> | undefined;

  try {
    handle = file.open(FileMode.ReadOnly);
    assertHandleSize(handle.size, expectedBytes);

    let totalBytes = 0;
    while (totalBytes < expectedBytes) {
      const requestedBytes = Math.min(
        SHA256_FILE_CHUNK_BYTES,
        expectedBytes - totalBytes
      );
      const chunk = readExactChunk(
        (length) => handle!.readBytes(length),
        requestedBytes,
        totalBytes,
        maxBytes
      );
      hash.update(chunk);
      totalBytes += chunk.byteLength;
    }

    assertEndOfFile(
      (length) => handle!.readBytes(length),
      totalBytes,
      maxBytes
    );
    assertUnchangedFile(file, uri, expectedBytes, handle.size);
    return { sha256: bytesToLowerHex(hash.digest()), bytes: totalBytes };
  } finally {
    handle?.close();
  }
}

export async function sha256File(
  uri: string,
  options: Sha256FileAsyncOptions = {}
): Promise<Sha256FileResult> {
  throwIfAborted(options.signal);
  assertLocalFileUri(uri);
  const resolvedMaxBytes = resolveMaxBytes(options.maxBytes);
  if (Platform.OS === "android") {
    return sha256FileNative(uri, resolvedMaxBytes, options.signal);
  }

  const { file, expectedBytes, maxBytes } = prepareFile(uri, resolvedMaxBytes);
  throwIfAborted(options.signal);

  const hash = sha256.create();
  let handle: ReturnType<File["open"]> | undefined;

  try {
    handle = file.open(FileMode.ReadOnly);
    assertHandleSize(handle.size, expectedBytes);

    let totalBytes = 0;
    let chunksSinceYield = 0;
    while (totalBytes < expectedBytes) {
      throwIfAborted(options.signal);
      const requestedBytes = Math.min(
        SHA256_FILE_CHUNK_BYTES,
        expectedBytes - totalBytes
      );
      const chunk = readExactChunk(
        (length) => handle!.readBytes(length),
        requestedBytes,
        totalBytes,
        maxBytes
      );
      hash.update(chunk);
      totalBytes += chunk.byteLength;
      chunksSinceYield += 1;
      throwIfAborted(options.signal);

      if (chunksSinceYield === ASYNC_YIELD_CHUNKS) {
        chunksSinceYield = 0;
        await yieldToEventLoop();
        throwIfAborted(options.signal);
      }
    }

    assertEndOfFile(
      (length) => handle!.readBytes(length),
      totalBytes,
      maxBytes
    );
    assertUnchangedFile(file, uri, expectedBytes, handle.size);
    throwIfAborted(options.signal);
    const digest = bytesToLowerHex(hash.digest());
    throwIfAborted(options.signal);
    return { sha256: digest, bytes: totalBytes };
  } finally {
    handle?.close();
  }
}
