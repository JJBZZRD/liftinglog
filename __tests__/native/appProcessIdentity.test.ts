type NativeIdentityModule = {
  getNativeProcessToken: jest.Mock;
};

function loadIdentityAdapter(
  platformOS: "android" | "ios",
  nativeModule?: NativeIdentityModule,
  nativeModulesOverride?: object
) {
  jest.resetModules();
  const nativeModules =
    nativeModulesOverride ?? (nativeModule ? { AppProcessIdentity: nativeModule } : {});
  jest.doMock("react-native", () => ({
    Platform: { OS: platformOS },
    NativeModules: nativeModules,
  }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("../../lib/native/appProcessIdentity") as typeof import("../../lib/native/appProcessIdentity");
}

describe("appProcessIdentity", () => {
  const canonicalToken = "process-v1:123e4567-e89b-42d3-a456-426614174000";

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("accepts only canonical lowercase process-v1 UUID-v4 tokens", () => {
    const { isNativeProcessToken } = loadIdentityAdapter("android");

    expect(isNativeProcessToken(canonicalToken)).toBe(true);
    expect(isNativeProcessToken("process-v2:123e4567-e89b-42d3-a456-426614174000")).toBe(false);
    expect(isNativeProcessToken("process-v1:123e4567-e89b-12d3-a456-426614174000")).toBe(false);
    expect(isNativeProcessToken("process-v1:123e4567-e89b-42d3-c456-426614174000")).toBe(false);
    expect(isNativeProcessToken(canonicalToken.toUpperCase())).toBe(false);
    expect(isNativeProcessToken("process-v1:not-a-uuid")).toBe(false);
    expect(isNativeProcessToken(null)).toBe(false);
  });

  it("returns the same native singleton token across JS module resets", () => {
    const nativeModule = {
      getNativeProcessToken: jest.fn(() => canonicalToken),
    };

    const firstAdapter = loadIdentityAdapter("android", nativeModule);
    expect(firstAdapter.getNativeProcessToken()).toBe(canonicalToken);

    const reloadedAdapter = loadIdentityAdapter("android", nativeModule);
    expect(reloadedAdapter.getNativeProcessToken()).toBe(canonicalToken);
    expect(nativeModule.getNativeProcessToken).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["missing module", undefined],
    ["missing method", {} as NativeIdentityModule],
    ["wrong version", { getNativeProcessToken: jest.fn(() => canonicalToken.replace("v1", "v2")) }],
    ["malformed token", { getNativeProcessToken: jest.fn(() => "not-a-token") }],
    ["uppercase token", { getNativeProcessToken: jest.fn(() => canonicalToken.toUpperCase()) }],
    ["throwing module", { getNativeProcessToken: jest.fn(() => { throw new Error("native"); }) }],
  ])("returns null for a %s", (_label, nativeModule) => {
    const adapter = loadIdentityAdapter("android", nativeModule as NativeIdentityModule | undefined);
    expect(adapter.getNativeProcessToken()).toBeNull();
  });

  it("does not touch the native module on import or on iOS", () => {
    const getter = jest.fn(() => ({ getNativeProcessToken: jest.fn(() => canonicalToken) }));
    const nativeModules = {};
    Object.defineProperty(nativeModules, "AppProcessIdentity", { get: getter });

    const adapter = loadIdentityAdapter("ios", undefined, nativeModules);
    expect(getter).not.toHaveBeenCalled();
    expect(adapter.getNativeProcessToken()).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });
});
