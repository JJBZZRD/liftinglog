jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///app/documents/",
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn(),
}));

jest.mock("expo-media-library/legacy", () => ({}));

import { deleteManagedVideoUri } from "../../lib/utils/videoStorage";

const fileSystem = jest.requireMock("expo-file-system/legacy") as Record<string, jest.Mock>;

describe("deleteManagedVideoUri", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fileSystem.getInfoAsync.mockReset().mockResolvedValue({ exists: true });
    fileSystem.deleteAsync.mockReset().mockResolvedValue(undefined);
  });

  it("deletes an existing app-managed copy", async () => {
    const uri = "file:///app/documents/set-videos/managed.mp4";

    await deleteManagedVideoUri(uri);

    expect(fileSystem.getInfoAsync).toHaveBeenCalledWith(uri);
    expect(fileSystem.deleteAsync).toHaveBeenCalledWith(uri, { idempotent: true });
  });

  it.each([
    "file:///gallery/original.mp4",
    "content://gallery/original.mp4",
    "file:///app/documents/set-videos-sibling/managed.mp4",
    null,
  ])("never reaches native deletion for an unmanaged URI: %s", async (uri) => {
    await deleteManagedVideoUri(uri);

    expect(fileSystem.getInfoAsync).not.toHaveBeenCalled();
    expect(fileSystem.deleteAsync).not.toHaveBeenCalled();
  });
});
