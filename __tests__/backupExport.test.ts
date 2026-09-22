import { Platform } from "react-native";
import { Paths } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { createSealedBackupSnapshot } from "../lib/db/backupSnapshot";
import { sqlite } from "../lib/db/connection";
import {
  ExportCancelledError,
  FileSystemUnavailableError,
  exportDatabaseBackup,
} from "../lib/db/backup";

jest.mock("expo-document-picker", () => ({}));

jest.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

jest.mock("expo-file-system", () => {
  const directories: { deleted: boolean; exists: boolean; uri: string }[] = [];
  class Directory {
    deleted = false;
    exists = false;
    uri: string;

    constructor(root: { uri: string } | string, name?: string) {
      const rootUri = typeof root === "string" ? root : root.uri;
      this.uri = name ? `${rootUri.replace(/\/$/, "")}/${name}` : rootUri;
      directories.push(this);
    }

    create() {
      this.exists = true;
    }

    delete() {
      this.exists = false;
      this.deleted = true;
    }
  }

  class File {
    exists = true;
    uri: string;

    constructor(root: { uri: string } | string, name?: string) {
      const rootUri = typeof root === "string" ? root : root.uri;
      this.uri = name ? `${rootUri.replace(/\/$/, "")}/${name}` : rootUri;
    }
  }

  return {
    Directory,
    File,
    Paths: {
      cache: { uri: "file:///private-cache" },
      document: { uri: "file:///private-document" },
    },
    __directories: directories,
  };
});

jest.mock("expo-file-system/legacy", () => ({
  EncodingType: { Base64: "base64", UTF8: "utf8" },
  StorageAccessFramework: {
    createFileAsync: jest.fn(),
    requestDirectoryPermissionsAsync: jest.fn(),
  },
  deleteAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
}));

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: jest.fn(),
}));

jest.mock("../lib/db/connection", () => ({
  sqlite: { live: true },
}));

jest.mock("../lib/db/backupSnapshot", () => ({
  createSealedBackupSnapshot: jest.fn(),
}));

jest.mock("../lib/db/backupMatching", () => ({
  pickMatchingMediaId: jest.fn(),
  pickMatchingSetId: jest.fn(),
  pickMatchingWorkoutExerciseId: jest.fn(),
  pickMatchingWorkoutId: jest.fn(),
}));

jest.mock("../lib/db/media", () => ({ updateMedia: jest.fn() }));
jest.mock("../lib/utils/videoStorage", () => ({
  doesFileUriExist: jest.fn(),
  ensureVideoLibraryPermission: jest.fn(),
  isFileUri: jest.fn(),
  isLikelyTransientUri: jest.fn(),
  resolveVideoLibraryReference: jest.fn(),
}));

type MockDirectory = {
  deleted: boolean;
  exists: boolean;
  uri: string;
};

const fileSystemMock = jest.requireMock("expo-file-system") as {
  __directories: MockDirectory[];
};
const snapshotMock = createSealedBackupSnapshot as jest.MockedFunction<
  typeof createSealedBackupSnapshot
>;
const requestPermissionMock = LegacyFileSystem.StorageAccessFramework
  .requestDirectoryPermissionsAsync as jest.Mock;
const createSafFileMock = LegacyFileSystem.StorageAccessFramework
  .createFileAsync as jest.Mock;
const readFileMock = LegacyFileSystem.readAsStringAsync as jest.Mock;
const writeFileMock = LegacyFileSystem.writeAsStringAsync as jest.Mock;
const deleteSafFileMock = LegacyFileSystem.deleteAsync as jest.Mock;

describe("database backup export workflow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 22, 14, 5, 6));
    (Platform as { OS: string }).OS = "android";
    (Paths as { cache: unknown }).cache = { uri: "file:///private-cache" };
    (Paths as { document: unknown }).document = { uri: "file:///private-document" };
    fileSystemMock.__directories.length = 0;
    snapshotMock.mockImplementation(async ({ destinationDirectory, destinationName }) => ({
      fileUri: `${destinationDirectory}/${destinationName}`,
      rowsByTable: {} as never,
      sha256: "a".repeat(64),
    }));
    requestPermissionMock.mockResolvedValue({
      directoryUri: "content://exports",
      granted: true,
    });
    createSafFileMock.mockResolvedValue("content://exports/sealed-backup");
    readFileMock.mockResolvedValue("base64-data");
    writeFileMock.mockResolvedValue(undefined);
    deleteSafFileMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("wires the live handle to a unique private snapshot and preserves the complete SAF filename and MIME", async () => {
    const result = await exportDatabaseBackup();

    expect(result).toEqual({
      method: "android_saf",
      uri: "content://exports/sealed-backup",
    });
    expect(snapshotMock).toHaveBeenCalledTimes(1);
    const snapshotOptions = snapshotMock.mock.calls[0][0];
    expect(snapshotOptions.sourceDatabase).toBe(sqlite);
    expect(snapshotOptions.destinationDirectory).toMatch(
      /^file:\/\/\/private-cache\/backup-export-\d+-/
    );
    expect(snapshotOptions.destinationName).toBe(
      "LiftingLog-backup-20260922-140506.db"
    );
    expect(createSafFileMock).toHaveBeenCalledWith(
      "content://exports",
      "LiftingLog-backup-20260922-140506.db",
      "application/vnd.sqlite3"
    );
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(fileSystemMock.__directories[0].deleted).toBe(true);
  });

  test("cancellation removes the private sealed snapshot and keeps the public error type", async () => {
    requestPermissionMock.mockResolvedValue({ granted: false });

    await expect(exportDatabaseBackup()).rejects.toBeInstanceOf(
      ExportCancelledError
    );
    expect(createSafFileMock).not.toHaveBeenCalled();
    expect(fileSystemMock.__directories[0].deleted).toBe(true);
  });

  test("a SAF write failure deletes the incomplete provider file and never reports fallback success", async () => {
    const failure = new Error("injected SAF write failure");
    writeFileMock.mockRejectedValue(failure);

    await expect(exportDatabaseBackup()).rejects.toBe(failure);
    expect(deleteSafFileMock).toHaveBeenCalledWith(
      "content://exports/sealed-backup",
      { idempotent: true }
    );
    expect(fileSystemMock.__directories[0].deleted).toBe(true);
  });

  test("snapshot failure removes the private destination and does not invoke SAF", async () => {
    const failure = new Error("injected snapshot failure");
    snapshotMock.mockRejectedValue(failure);

    await expect(exportDatabaseBackup()).rejects.toBe(failure);
    expect(requestPermissionMock).not.toHaveBeenCalled();
    expect(fileSystemMock.__directories[0].deleted).toBe(true);
  });

  test("fallback returns the sealed file without deleting it before the caller shares it", async () => {
    (Platform as { OS: string }).OS = "ios";

    const result = await exportDatabaseBackup();

    expect(result.method).toBe("fallback_share");
    expect(result.uri).toMatch(/\.db$/);
    expect(fileSystemMock.__directories[0].deleted).toBe(false);
    expect(requestPermissionMock).not.toHaveBeenCalled();
  });

  test("preserves FileSystemUnavailableError when no private export directory exists", async () => {
    (Paths as { cache: unknown }).cache = null;
    (Paths as { document: unknown }).document = null;

    await expect(exportDatabaseBackup()).rejects.toBeInstanceOf(
      FileSystemUnavailableError
    );
    expect(snapshotMock).not.toHaveBeenCalled();
  });
});
