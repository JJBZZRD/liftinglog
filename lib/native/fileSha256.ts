import { NativeModules } from "react-native";

export type NativeFileSha256Result = {
  sha256: string;
  bytes: number;
};

type NativeFileSha256Module = {
  sha256FileSync(uri: string, maxBytes: number): unknown;
  sha256FileAsync(
    uri: string,
    maxBytes: number,
    requestId: string
  ): Promise<unknown>;
  cancelSha256File(requestId: string): Promise<unknown>;
};

type NativeErrorEnvelope = {
  status: "error";
  code: string;
  message: string;
};

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
let nextRequestSequence = 0;

export class FileSha256NativeError extends Error {
  readonly code: string;
  readonly nativeCause: unknown;

  constructor(code: string, message: string, nativeCause?: unknown) {
    super(message);
    this.name = "FileSha256NativeError";
    this.code = code;
    this.nativeCause = nativeCause;
  }
}

function getNativeModule(): NativeFileSha256Module {
  let nativeModule: Partial<NativeFileSha256Module> | undefined;
  try {
    nativeModule = NativeModules.FileSha256 as
      | Partial<NativeFileSha256Module>
      | undefined;
  } catch (error) {
    throw new FileSha256NativeError(
      "unavailable",
      "The Android native SHA-256 module is unavailable.",
      error
    );
  }

  if (
    !nativeModule ||
    typeof nativeModule.sha256FileSync !== "function" ||
    typeof nativeModule.sha256FileAsync !== "function" ||
    typeof nativeModule.cancelSha256File !== "function"
  ) {
    throw new FileSha256NativeError(
      "unavailable",
      "The Android native SHA-256 module is unavailable or incompatible."
    );
  }
  return nativeModule as NativeFileSha256Module;
}

function isErrorEnvelope(value: unknown): value is NativeErrorEnvelope {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<NativeErrorEnvelope>;
  return (
    candidate.status === "error" &&
    typeof candidate.code === "string" &&
    candidate.code.length > 0 &&
    typeof candidate.message === "string" &&
    candidate.message.length > 0
  );
}

function validateSuccess(value: unknown, maxBytes: number): NativeFileSha256Result {
  if (isErrorEnvelope(value)) {
    throw new FileSha256NativeError(value.code, value.message);
  }
  if (value === null || typeof value !== "object") {
    throw new FileSha256NativeError(
      "invalid_native_response",
      "The Android native SHA-256 module returned an invalid response."
    );
  }

  const candidate = value as {
    status?: unknown;
    sha256?: unknown;
    bytes?: unknown;
  };
  if (
    candidate.status !== "success" ||
    typeof candidate.sha256 !== "string" ||
    !SHA256_PATTERN.test(candidate.sha256) ||
    typeof candidate.bytes !== "number" ||
    !Number.isSafeInteger(candidate.bytes) ||
    candidate.bytes < 0 ||
    candidate.bytes > maxBytes
  ) {
    throw new FileSha256NativeError(
      "invalid_native_response",
      "The Android native SHA-256 module returned an invalid response."
    );
  }
  return { sha256: candidate.sha256, bytes: candidate.bytes };
}

function abortReason(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }
  const error = new Error("SHA-256 hashing was aborted.");
  error.name = "AbortError";
  return error;
}

function nextRequestId(): string {
  nextRequestSequence += 1;
  return `file-sha256-${Date.now().toString(36)}-${nextRequestSequence.toString(36)}`;
}

export function sha256FileNativeSync(
  uri: string,
  maxBytes: number
): NativeFileSha256Result {
  const nativeModule = getNativeModule();
  let response: unknown;
  try {
    response = nativeModule.sha256FileSync(uri, maxBytes);
  } catch (error) {
    throw new FileSha256NativeError(
      "native_call_failed",
      "The Android native SHA-256 call failed.",
      error
    );
  }
  return validateSuccess(response, maxBytes);
}

export async function sha256FileNative(
  uri: string,
  maxBytes: number,
  signal?: AbortSignal
): Promise<NativeFileSha256Result> {
  if (signal?.aborted) {
    throw abortReason(signal);
  }

  const nativeModule = getNativeModule();
  const requestId = nextRequestId();
  let cancellationFailure: unknown;
  let cancellationAcknowledgement: Promise<void> | undefined;
  let cancellationRequested = false;
  const cancel = () => {
    if (cancellationRequested) {
      return;
    }
    cancellationRequested = true;
    try {
      const acknowledgement = nativeModule.cancelSha256File(requestId);
      if (!acknowledgement || typeof acknowledgement.then !== "function") {
        cancellationFailure = new FileSha256NativeError(
          "invalid_cancellation_acknowledgement",
          "The Android native SHA-256 module did not return a cancellation promise."
        );
        return;
      }
      cancellationAcknowledgement = Promise.resolve(acknowledgement)
        .then((value) => {
          if (value !== true) {
            throw new FileSha256NativeError(
              "invalid_cancellation_acknowledgement",
              "The Android native SHA-256 module did not acknowledge cancellation."
            );
          }
        })
        .catch((error: unknown) => {
          cancellationFailure = error;
        });
    } catch (error) {
      cancellationFailure = error;
    }
  };

  signal?.addEventListener("abort", cancel, { once: true });
  try {
    let nativePromise: Promise<unknown>;
    try {
      nativePromise = nativeModule.sha256FileAsync(uri, maxBytes, requestId);
    } catch (error) {
      throw new FileSha256NativeError(
        "native_call_failed",
        "The Android native SHA-256 call failed.",
        error
      );
    }
    if (!nativePromise || typeof nativePromise.then !== "function") {
      throw new FileSha256NativeError(
        "invalid_native_response",
        "The Android native SHA-256 module did not return a promise."
      );
    }
    if (signal?.aborted) {
      cancel();
    }

    let response: unknown;
    let nativeFailure: unknown;
    try {
      response = await nativePromise;
    } catch (error) {
      nativeFailure = error;
    }

    if (signal?.aborted) {
      await cancellationAcknowledgement;
      const error = abortReason(signal);
      if (cancellationFailure !== undefined && error.cause === undefined) {
        error.cause = cancellationFailure;
      }
      throw error;
    }
    if (nativeFailure !== undefined) {
      throw new FileSha256NativeError(
        "native_call_failed",
        "The Android native SHA-256 call failed.",
        nativeFailure
      );
    }
    return validateSuccess(response, maxBytes);
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}
