/* eslint-disable @typescript-eslint/no-require-imports */
import fs from "fs";
import path from "path";

const {
  KOTLIN_TEMPLATES,
  getPaths,
  renderKotlinTemplate,
} = require("../../scripts/sync-android-restore-native");
const {
  verifyAndroidRestoreNative,
} = require("../../scripts/verify-android-restore-native");

const projectRoot = path.resolve(__dirname, "../..");

describe("Android native file SHA-256 integration", () => {
  it("keeps both digest templates in the generated native source set", () => {
    expect(KOTLIN_TEMPLATES).toEqual(
      expect.arrayContaining(["FileSha256.kt", "FileSha256Module.kt"])
    );

    const paths = getPaths(projectRoot);
    for (const filename of ["FileSha256.kt", "FileSha256Module.kt"]) {
      const template = fs.readFileSync(path.join(paths.templateDir, filename), "utf8");
      const generated = fs.readFileSync(path.join(paths.restoreDir, filename), "utf8");
      expect(generated).toBe(renderKotlinTemplate(template, paths.packageName));
    }
  });

  it("registers one bounded, cancellable MessageDigest module", () => {
    const paths = getPaths(projectRoot);
    const digestSource = fs.readFileSync(
      path.join(paths.templateDir, "FileSha256.kt"),
      "utf8"
    );
    const moduleSource = fs.readFileSync(
      path.join(paths.templateDir, "FileSha256Module.kt"),
      "utf8"
    );
    const packageSource = fs.readFileSync(
      path.join(paths.templateDir, "RestoreNativePackage.kt"),
      "utf8"
    );

    expect(digestSource).toContain('MessageDigest.getInstance("SHA-256")');
    expect(digestSource).toContain("const val BUFFER_BYTES = 64 * 1024");
    expect(moduleSource).toContain("ArrayBlockingQueue(MAX_QUEUED_JOBS)");
    expect(moduleSource).toContain(
      "fun cancelSha256File(requestId: String, promise: Promise)"
    );
    expect(moduleSource).not.toContain(
      "@ReactMethod(isBlockingSynchronousMethod = true)\n  fun cancelSha256File"
    );
    expect(packageSource.match(/FileSha256Module\.NAME/g)).toHaveLength(3);
    expect(verifyAndroidRestoreNative(projectRoot)).toEqual({
      packageName: "com.anonymous.LiftingLog",
    });
  });
});
