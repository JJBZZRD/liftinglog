type NativeFileSha256Module = {
  sha256FileSync: jest.Mock;
  sha256FileAsync: jest.Mock;
  cancelSha256File: jest.Mock;
};

const SUCCESS = {
  status: "success",
  sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  bytes: 3,
};

function createNativeModule(): NativeFileSha256Module {
  return {
    sha256FileSync: jest.fn(() => SUCCESS),
    sha256FileAsync: jest.fn(async () => SUCCESS),
    cancelSha256File: jest.fn(async () => true),
  };
}

function loadAdapter(
  nativeModule?: Partial<NativeFileSha256Module>,
  nativeModulesOverride?: object
) {
  jest.resetModules();
  const nativeModules =
    nativeModulesOverride ?? (nativeModule ? { FileSha256: nativeModule } : {});
  jest.doMock("react-native", () => ({ NativeModules: nativeModules }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("../../lib/native/fileSha256") as typeof import("../../lib/native/fileSha256");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("native file SHA-256 facade", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("does not touch the native module during import", () => {
    const getter = jest.fn(() => createNativeModule());
    const nativeModules = {};
    Object.defineProperty(nativeModules, "FileSha256", { get: getter });
    loadAdapter(undefined, nativeModules);
    expect(getter).not.toHaveBeenCalled();
  });

  it("fails explicitly when the Android module is absent or incomplete", async () => {
    const absent = loadAdapter();
    expect(() => absent.sha256FileNativeSync("file:///a", 3)).toThrow(
      expect.objectContaining({ code: "unavailable" })
    );
    await expect(absent.sha256FileNative("file:///a", 3)).rejects.toMatchObject({
      code: "unavailable",
    });

    const incomplete = loadAdapter({ sha256FileSync: jest.fn() });
    expect(() => incomplete.sha256FileNativeSync("file:///a", 3)).toThrow(
      expect.objectContaining({ code: "unavailable" })
    );
  });

  it("accepts only a lowercase digest and bounded safe-integer byte count", async () => {
    const nativeModule = createNativeModule();
    const adapter = loadAdapter(nativeModule);

    expect(adapter.sha256FileNativeSync("file:///a", 3)).toEqual({
      sha256: SUCCESS.sha256,
      bytes: 3,
    });
    await expect(adapter.sha256FileNative("file:///a", 3)).resolves.toEqual({
      sha256: SUCCESS.sha256,
      bytes: 3,
    });

    for (const malformed of [
      null,
      { ...SUCCESS, status: "ok" },
      { ...SUCCESS, sha256: SUCCESS.sha256.toUpperCase() },
      { ...SUCCESS, sha256: "0".repeat(63) },
      { ...SUCCESS, bytes: -1 },
      { ...SUCCESS, bytes: 4 },
      { ...SUCCESS, bytes: 1.5 },
    ]) {
      nativeModule.sha256FileSync.mockReturnValueOnce(malformed);
      expect(() => adapter.sha256FileNativeSync("file:///a", 3)).toThrow(
        expect.objectContaining({ code: "invalid_native_response" })
      );
    }
  });

  it("surfaces a validated synchronous native error envelope", () => {
    const nativeModule = createNativeModule();
    nativeModule.sha256FileSync.mockReturnValue({
      status: "error",
      code: "file_changed",
      message: "File changed.",
    });
    const adapter = loadAdapter(nativeModule);

    expect(() => adapter.sha256FileNativeSync("file:///a", 3)).toThrow(
      expect.objectContaining({ code: "file_changed", message: "File changed." })
    );
  });

  it("aborts before calling native code", async () => {
    const nativeModule = createNativeModule();
    const adapter = loadAdapter(nativeModule);
    const controller = new AbortController();
    const reason = Object.assign(new Error("stop"), { name: "AbortError" });
    controller.abort(reason);

    await expect(
      adapter.sha256FileNative("file:///a", 3, controller.signal)
    ).rejects.toBe(reason);
    expect(nativeModule.sha256FileAsync).not.toHaveBeenCalled();
    expect(nativeModule.cancelSha256File).not.toHaveBeenCalled();
  });

  it("waits for native cleanup before settling a mid-read abort", async () => {
    const pending = deferred<typeof SUCCESS>();
    const nativeModule = createNativeModule();
    nativeModule.sha256FileAsync.mockReturnValue(pending.promise);
    const adapter = loadAdapter(nativeModule);
    const controller = new AbortController();
    const reason = Object.assign(new Error("stop during read"), { name: "AbortError" });

    let settled = false;
    const result = adapter
      .sha256FileNative("file:///a", 3, controller.signal)
      .finally(() => {
        settled = true;
      });
    const requestId = nativeModule.sha256FileAsync.mock.calls[0][2] as string;
    controller.abort(reason);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(nativeModule.cancelSha256File).toHaveBeenCalledWith(requestId);

    pending.reject(new Error("aborted after close"));
    await expect(result).rejects.toBe(reason);
  });

  it("lets an abort win a completed-result race and validates cancellation ack", async () => {
    const pending = deferred<typeof SUCCESS>();
    const nativeModule = createNativeModule();
    nativeModule.sha256FileAsync.mockReturnValue(pending.promise);
    nativeModule.cancelSha256File.mockResolvedValue(false);
    const adapter = loadAdapter(nativeModule);
    const controller = new AbortController();

    const result = adapter.sha256FileNative("file:///a", 3, controller.signal);
    controller.abort();
    pending.resolve(SUCCESS);
    await expect(result).rejects.toMatchObject({
      name: "AbortError",
      cause: expect.objectContaining({ code: "invalid_cancellation_acknowledgement" }),
    });
  });

  it("observes a rejected cancellation acknowledgement without an unhandled rejection", async () => {
    const pending = deferred<typeof SUCCESS>();
    const cancellationFailure = new Error("cancel bridge failed");
    const nativeModule = createNativeModule();
    nativeModule.sha256FileAsync.mockReturnValue(pending.promise);
    nativeModule.cancelSha256File.mockRejectedValue(cancellationFailure);
    const adapter = loadAdapter(nativeModule);
    const controller = new AbortController();

    const result = adapter.sha256FileNative("file:///a", 3, controller.signal);
    controller.abort();
    pending.resolve(SUCCESS);
    await expect(result).rejects.toMatchObject({
      name: "AbortError",
      cause: cancellationFailure,
    });
  });

  it("queues immediate cancellation behind admission and settles after resource closure", async () => {
    const nativeMethodQueue: (() => void)[] = [];
    const hashSettlement = deferred<typeof SUCCESS>();
    const cancellationAcknowledgement = deferred<boolean>();
    let admitted = false;
    let resourceClosed = false;
    const nativeModule = createNativeModule();
    nativeModule.sha256FileAsync.mockImplementation(() => {
      nativeMethodQueue.push(() => {
        admitted = true;
      });
      return hashSettlement.promise;
    });
    nativeModule.cancelSha256File.mockImplementation(() => {
      nativeMethodQueue.push(() => {
        if (!admitted) {
          cancellationAcknowledgement.reject(new Error("cancel overtook admission"));
          hashSettlement.reject(new Error("job was forgotten"));
          return;
        }
        resourceClosed = true;
        cancellationAcknowledgement.resolve(true);
        hashSettlement.reject(new Error("aborted after close"));
      });
      return cancellationAcknowledgement.promise;
    });
    const adapter = loadAdapter(nativeModule);
    const controller = new AbortController();
    const reason = Object.assign(new Error("immediate abort"), { name: "AbortError" });

    const result = adapter.sha256FileNative("file:///a", 3, controller.signal);
    const observed = result.then(
      () => null,
      (error: unknown) => error
    );
    controller.abort(reason);

    expect(admitted).toBe(false);
    expect(resourceClosed).toBe(false);
    expect(nativeMethodQueue).toHaveLength(2);
    nativeMethodQueue.shift()?.();
    nativeMethodQueue.shift()?.();

    await expect(observed).resolves.toBe(reason);
    expect(resourceClosed).toBe(true);
  });

  it("uses isolated request IDs and removes abort listeners after settlement", async () => {
    const nativeModule = createNativeModule();
    const adapter = loadAdapter(nativeModule);
    const firstController = new AbortController();
    const secondController = new AbortController();
    const firstRemove = jest.spyOn(firstController.signal, "removeEventListener");
    const secondRemove = jest.spyOn(secondController.signal, "removeEventListener");

    await Promise.all([
      adapter.sha256FileNative("file:///a", 3, firstController.signal),
      adapter.sha256FileNative("file:///b", 3, secondController.signal),
    ]);
    const firstId = nativeModule.sha256FileAsync.mock.calls[0][2];
    const secondId = nativeModule.sha256FileAsync.mock.calls[1][2];
    expect(firstId).not.toBe(secondId);
    expect(firstRemove).toHaveBeenCalledTimes(1);
    expect(secondRemove).toHaveBeenCalledTimes(1);
  });
});
