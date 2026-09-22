const mockFiles = new Map<string, MockFileState>();
const mockConstructedUris: string[] = [];
const mockOpenModes: string[] = [];
const mockReadRequests: number[] = [];
let mockCloseCount = 0;

type MockFileState = {
  data: Uint8Array;
  pathExists?: boolean;
  isDirectory?: boolean | null;
  fileExists?: boolean;
  reportedSizes?: (number | undefined)[];
  handleSizes?: (number | null)[];
  onRead?: (length: number, readIndex: number) => void;
  readOverride?: (
    length: number,
    readIndex: number,
    cursor: number
  ) => Uint8Array;
  closeError?: Error;
};

jest.mock("expo-file-system", () => {
  const FileMode = {
    ReadWrite: "rw",
    ReadOnly: "r",
    WriteOnly: "w",
    Append: "wa",
    Truncate: "wt",
  };

  return {
    FileMode,
    Paths: {
      info: (uri: string) => {
        const state = mockFiles.get(uri);
        return {
          exists: state?.pathExists ?? state !== undefined,
          isDirectory: state?.isDirectory ?? false,
        };
      },
    },
    File: class MockFile {
      readonly uri: string;
      private infoIndex = 0;

      constructor(uri: string) {
        this.uri = uri;
        mockConstructedUris.push(uri);
      }

      get exists(): boolean {
        const state = mockFiles.get(this.uri);
        return state?.fileExists ?? state !== undefined;
      }

      info() {
        const state = mockFiles.get(this.uri);
        if (!state || state.fileExists === false) {
          return { exists: false, uri: this.uri };
        }
        const reportedSizes = state.reportedSizes ?? [state.data.byteLength];
        const index = Math.min(this.infoIndex, reportedSizes.length - 1);
        this.infoIndex += 1;
        return {
          exists: true,
          uri: this.uri,
          size: reportedSizes[index],
        };
      }

      open(mode: string) {
        const state = mockFiles.get(this.uri);
        if (!state) {
          throw new Error("File does not exist");
        }
        mockOpenModes.push(mode);

        let cursor = 0;
        let readIndex = 0;
        let sizeIndex = 0;
        return {
          get size(): number | null {
            const sizes = state.handleSizes ?? [state.reportedSizes?.[0] ?? state.data.byteLength];
            const index = Math.min(sizeIndex, sizes.length - 1);
            sizeIndex += 1;
            return sizes[index] ?? null;
          },
          readBytes(length: number): Uint8Array {
            mockReadRequests.push(length);
            const currentRead = readIndex;
            readIndex += 1;
            state.onRead?.(length, currentRead);
            if (state.readOverride) {
              const result = state.readOverride(length, currentRead, cursor);
              cursor += result.byteLength;
              return result;
            }
            const result = state.data.slice(cursor, cursor + length);
            cursor += result.byteLength;
            return result;
          },
          close(): void {
            mockCloseCount += 1;
            if (state.closeError) {
              throw state.closeError;
            }
          },
        };
      }
    },
  };
});

// Keep imports after the hoisted filesystem mock; Node crypto is a test-only oracle.
/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash } = require("node:crypto") as typeof import("node:crypto");
const {
  DEFAULT_MAX_SHA256_FILE_BYTES,
  SHA256_FILE_CHUNK_BYTES,
  sha256File,
  sha256FileSync,
} = require("../../lib/utils/fileSha256") as typeof import("../../lib/utils/fileSha256");
/* eslint-enable @typescript-eslint/no-require-imports */

const mockImportIoSnapshot = {
  constructedUris: [...mockConstructedUris],
  openModes: [...mockOpenModes],
  readRequests: [...mockReadRequests],
};

const FILE_URI = "file:///private/restore/candidate.db";

function registerFile(data: Uint8Array, overrides: Partial<MockFileState> = {}): void {
  mockFiles.set(FILE_URI, { data, ...overrides });
}

function nodeSha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

describe("fileSha256", () => {
  beforeEach(() => {
    mockFiles.clear();
    mockConstructedUris.length = 0;
    mockOpenModes.length = 0;
    mockReadRequests.length = 0;
    mockCloseCount = 0;
  });

  it("does not touch the file system when the module is imported", () => {
    expect(mockImportIoSnapshot).toEqual({
      constructedUris: [],
      openModes: [],
      readRequests: [],
    });
  });

  it("exports the frozen byte limits", () => {
    expect(DEFAULT_MAX_SHA256_FILE_BYTES).toBe(256 * 1024 * 1024);
    expect(SHA256_FILE_CHUNK_BYTES).toBe(64 * 1024);
  });

  it("hashes the known empty vector synchronously", () => {
    registerFile(new Uint8Array());

    expect(sha256FileSync(FILE_URI, { maxBytes: 0 })).toEqual({
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      bytes: 0,
    });
    expect(mockOpenModes).toEqual(["r"]);
    expect(mockCloseCount).toBe(1);
  });

  it("hashes the known abc vector asynchronously", async () => {
    registerFile(Uint8Array.from([0x61, 0x62, 0x63]));

    await expect(sha256File(FILE_URI)).resolves.toEqual({
      sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      bytes: 3,
    });
    expect(mockOpenModes).toEqual(["r"]);
    expect(mockCloseCount).toBe(1);
  });

  it("matches the Node test oracle for a deterministic multi-chunk vector", async () => {
    const data = Uint8Array.from(
      { length: SHA256_FILE_CHUNK_BYTES * 2 + 37 },
      (_, index) => (index * 31 + 7) & 0xff
    );
    registerFile(data);

    await expect(sha256File(FILE_URI)).resolves.toEqual({
      sha256: nodeSha256(data),
      bytes: data.byteLength,
    });
    expect(mockReadRequests).toEqual([
      SHA256_FILE_CHUNK_BYTES,
      SHA256_FILE_CHUNK_BYTES,
      37,
      1,
    ]);
    expect(Math.max(...mockReadRequests)).toBeLessThanOrEqual(
      SHA256_FILE_CHUNK_BYTES
    );
  });

  it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid maxBytes %p",
    (maxBytes) => {
      registerFile(new Uint8Array());
      expect(() => sha256FileSync(FILE_URI, { maxBytes })).toThrow(
        "non-negative safe integer"
      );
      expect(mockOpenModes).toEqual([]);
    }
  );

  it.each(["", "   ", "content://provider/candidate.db", "https://example.test/a.db"])(
    "rejects a non-local URI %p",
    (uri) => {
      expect(() => sha256FileSync(uri)).toThrow();
      expect(mockConstructedUris).toEqual([]);
    }
  );

  it("rejects missing files and directories before opening", () => {
    registerFile(new Uint8Array(), { pathExists: false });
    expect(() => sha256FileSync(FILE_URI)).toThrow("does not exist");

    registerFile(new Uint8Array(), { isDirectory: true });
    expect(() => sha256FileSync(FILE_URI)).toThrow("directory");
    expect(mockOpenModes).toEqual([]);
  });

  it("rejects unavailable metadata and open-handle sizes", () => {
    registerFile(new Uint8Array(), { reportedSizes: [undefined] });
    expect(() => sha256FileSync(FILE_URI)).toThrow("unavailable or invalid");

    registerFile(new Uint8Array(), { handleSizes: [null] });
    expect(() => sha256FileSync(FILE_URI)).toThrow("Open file size");
    expect(mockCloseCount).toBe(1);
  });

  it("rejects a reported size above the caller ceiling without opening", () => {
    registerFile(new Uint8Array(9));
    expect(() => sha256FileSync(FILE_URI, { maxBytes: 8 })).toThrow(
      "exceeds the 8-byte"
    );
    expect(mockOpenModes).toEqual([]);
  });

  it("enforces the actual byte ceiling when metadata underreports the file", () => {
    registerFile(new Uint8Array(9), {
      reportedSizes: [8, 8],
      handleSizes: [8, 8],
    });
    expect(() => sha256FileSync(FILE_URI, { maxBytes: 8 })).toThrow(
      "exceeds the 8-byte"
    );
    expect(mockCloseCount).toBe(1);
  });

  it("rejects unexpected short and long reads", () => {
    registerFile(new Uint8Array(8), {
      readOverride: (length) => new Uint8Array(Math.max(0, length - 1)),
    });
    expect(() => sha256FileSync(FILE_URI)).toThrow("short file read");

    registerFile(new Uint8Array(8), {
      readOverride: (length) => new Uint8Array(length + 1),
    });
    expect(() => sha256FileSync(FILE_URI)).toThrow("long file read");
    expect(mockCloseCount).toBe(2);
  });

  it("rejects size changes observed through metadata or the open handle", () => {
    registerFile(new Uint8Array(8), { reportedSizes: [8, 9] });
    expect(() => sha256FileSync(FILE_URI)).toThrow("size changed");

    registerFile(new Uint8Array(8), { handleSizes: [8, 9] });
    expect(() => sha256FileSync(FILE_URI)).toThrow("size changed");
    expect(mockCloseCount).toBe(2);
  });

  it("honors an abort before performing file IO", async () => {
    registerFile(new Uint8Array(8));
    const controller = new AbortController();
    const reason = Object.assign(new Error("stop before open"), {
      name: "AbortError",
    });
    controller.abort(reason);

    await expect(
      sha256File(FILE_URI, { signal: controller.signal })
    ).rejects.toBe(reason);
    expect(mockConstructedUris).toEqual([]);
    expect(mockOpenModes).toEqual([]);
  });

  it("yields after at most 16 chunks and honors an abort between chunks", async () => {
    const data = new Uint8Array(SHA256_FILE_CHUNK_BYTES * 17);
    registerFile(data);
    const controller = new AbortController();
    const reason = Object.assign(new Error("stop during hashing"), {
      name: "AbortError",
    });
    setTimeout(() => controller.abort(reason), 0);

    await expect(
      sha256File(FILE_URI, { signal: controller.signal })
    ).rejects.toBe(reason);
    expect(mockReadRequests).toHaveLength(16);
    expect(mockCloseCount).toBe(1);
  });

  it("closes the read-only handle when reading fails", () => {
    registerFile(new Uint8Array(8), {
      onRead: () => {
        throw new Error("native read failed");
      },
    });

    expect(() => sha256FileSync(FILE_URI)).toThrow("native read failed");
    expect(mockOpenModes).toEqual(["r"]);
    expect(mockCloseCount).toBe(1);
  });

  it("propagates a close failure", () => {
    const closeError = new Error("native close failed");
    registerFile(new Uint8Array(), { closeError });
    expect(() => sha256FileSync(FILE_URI)).toThrow(closeError);
  });
});
