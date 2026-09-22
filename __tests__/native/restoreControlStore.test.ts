type NativeControlStoreModule = {
  readRestoreControlRecord: jest.Mock;
  writeRestoreControlRecord: jest.Mock;
  deleteRestoreControlRecord: jest.Mock;
};

function createNativeModule(): NativeControlStoreModule {
  return {
    readRestoreControlRecord: jest.fn(() => ({ status: "absent" })),
    writeRestoreControlRecord: jest.fn(() => true),
    deleteRestoreControlRecord: jest.fn(() => true),
  };
}

function loadControlStore(
  platformOS: "android" | "ios",
  nativeModule?: Partial<NativeControlStoreModule>,
  nativeModulesOverride?: object
) {
  jest.resetModules();
  const nativeModules =
    nativeModulesOverride ?? (nativeModule ? { RestoreControlStore: nativeModule } : {});
  jest.doMock("react-native", () => ({
    Platform: { OS: platformOS },
    NativeModules: nativeModules,
  }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("../../lib/native/restoreControlStore") as typeof import("../../lib/native/restoreControlStore");
}

describe("restoreControlStore", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("does not touch files or native APIs during import", () => {
    const getter = jest.fn(() => createNativeModule());
    const nativeModules = {};
    Object.defineProperty(nativeModules, "RestoreControlStore", { get: getter });

    loadControlStore("android", undefined, nativeModules);
    expect(getter).not.toHaveBeenCalled();
  });

  it("keeps unavailable distinct from an absent record", () => {
    const unavailable = loadControlStore("android");
    expect(unavailable.readRestoreControlRecord("pending")).toEqual({ status: "unavailable" });

    const nativeModule = createNativeModule();
    const available = loadControlStore("android", nativeModule);
    expect(available.readRestoreControlRecord("pending")).toEqual({ status: "absent" });
  });

  it("passes through present and unreadable native read results", () => {
    const nativeModule = createNativeModule();
    const adapter = loadControlStore("android", nativeModule);

    nativeModule.readRestoreControlRecord.mockReturnValueOnce({
      status: "present",
      json: '{"version":1}',
    });
    expect(adapter.readRestoreControlRecord("pending")).toEqual({
      status: "present",
      json: '{"version":1}',
    });

    nativeModule.readRestoreControlRecord.mockReturnValueOnce({
      status: "unreadable",
      code: "invalid_json",
    });
    expect(adapter.readRestoreControlRecord("outcome")).toEqual({
      status: "unreadable",
      code: "invalid_json",
    });
  });

  it("fails closed for throwing or malformed native reads", () => {
    const nativeModule = createNativeModule();
    const adapter = loadControlStore("android", nativeModule);

    nativeModule.readRestoreControlRecord.mockImplementationOnce(() => {
      throw new Error("read failed");
    });
    expect(adapter.readRestoreControlRecord("pending")).toEqual({
      status: "unreadable",
      code: "native_read_failed",
    });

    nativeModule.readRestoreControlRecord.mockReturnValueOnce({ status: "present" });
    expect(adapter.readRestoreControlRecord("pending")).toEqual({
      status: "unreadable",
      code: "invalid_native_response",
    });
  });

  it("accepts only the two fixed record names", () => {
    const nativeModule = createNativeModule();
    const adapter = loadControlStore("android", nativeModule);
    const invalidName = "../pending" as "pending";

    expect(() => adapter.readRestoreControlRecord(invalidName)).toThrow(
      expect.objectContaining({ code: "invalid_name" })
    );
    expect(() => adapter.writeRestoreControlRecord(invalidName, "{}")).toThrow(
      expect.objectContaining({ code: "invalid_name" })
    );
    expect(() => adapter.deleteRestoreControlRecord(invalidName)).toThrow(
      expect.objectContaining({ code: "invalid_name" })
    );
    expect(nativeModule.readRestoreControlRecord).not.toHaveBeenCalled();
  });

  it("requires a bounded UTF-8 JSON object string", () => {
    const nativeModule = createNativeModule();
    const adapter = loadControlStore("android", nativeModule);
    const framingBytes = '{"value":""}'.length;
    const maximum = `{"value":"${"a".repeat(
      adapter.RESTORE_CONTROL_RECORD_MAX_BYTES - framingBytes
    )}"}`;
    const tooLarge = `{"value":"${"a".repeat(
      adapter.RESTORE_CONTROL_RECORD_MAX_BYTES - framingBytes + 1
    )}"}`;

    expect(() => adapter.writeRestoreControlRecord("pending", maximum)).not.toThrow();
    expect(nativeModule.writeRestoreControlRecord).toHaveBeenLastCalledWith("pending", maximum);
    expect(() => adapter.writeRestoreControlRecord("pending", tooLarge)).toThrow(
      expect.objectContaining({ code: "record_too_large" })
    );
    for (const invalidJson of [
      "",
      "null",
      "[]",
      '"text"',
      "{broken",
      '{"value":"\ud800"}',
    ] as const) {
      expect(() => adapter.writeRestoreControlRecord("pending", invalidJson)).toThrow(
        expect.objectContaining({ code: "invalid_json" })
      );
    }
  });

  it("throws typed errors when write/delete are unavailable or fail", () => {
    const unavailable = loadControlStore("ios");
    expect(() => unavailable.writeRestoreControlRecord("pending", "{}")).toThrow(
      expect.objectContaining({ code: "unavailable" })
    );
    expect(() => unavailable.deleteRestoreControlRecord("outcome")).toThrow(
      expect.objectContaining({ code: "unavailable" })
    );

    const nativeModule = createNativeModule();
    nativeModule.writeRestoreControlRecord.mockImplementation(() => {
      throw new Error("disk");
    });
    nativeModule.deleteRestoreControlRecord.mockImplementation(() => {
      throw new Error("disk");
    });
    const adapter = loadControlStore("android", nativeModule);
    expect(() => adapter.writeRestoreControlRecord("pending", "{}")).toThrow(
      expect.objectContaining({ code: "write_failed" })
    );
    expect(() => adapter.deleteRestoreControlRecord("outcome")).toThrow(
      expect.objectContaining({ code: "delete_failed" })
    );
  });

  it("requires an explicit true acknowledgement from synchronous native mutations", () => {
    const nativeModule = createNativeModule();
    nativeModule.writeRestoreControlRecord.mockReturnValue(undefined);
    nativeModule.deleteRestoreControlRecord.mockReturnValue(false);
    const adapter = loadControlStore("android", nativeModule);

    expect(() => adapter.writeRestoreControlRecord("pending", "{}")).toThrow(
      expect.objectContaining({ code: "write_failed" })
    );
    expect(() => adapter.deleteRestoreControlRecord("outcome")).toThrow(
      expect.objectContaining({ code: "delete_failed" })
    );
  });
});
