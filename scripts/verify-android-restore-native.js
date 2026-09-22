/* global __dirname */
const fs = require("fs");
const path = require("path");
const { stripKotlinComments } = require("./sync-android-rest-timer-native");
const {
  GSON_DEPENDENCY,
  JUNIT_DEPENDENCY,
  KOTLIN_TEMPLATES,
  getExpoIdentity,
  getPaths,
  patchAppBuildGradleContents,
  patchMainApplicationContents,
  renderKotlinTemplate,
} = require("./sync-android-restore-native");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function countOccurrences(source, snippet) {
  return source.split(snippet).length - 1;
}

function readRequiredFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required Android restore file: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function verifyTemplateParity(paths) {
  for (const filename of KOTLIN_TEMPLATES) {
    const template = readRequiredFile(path.join(paths.templateDir, filename));
    const expected = renderKotlinTemplate(template, paths.packageName);
    const generated = readRequiredFile(path.join(paths.restoreDir, filename));
    assert(generated === expected, `Generated Kotlin file differs from template: ${filename}`);
  }
}

function verifyMainApplication(paths) {
  const source = readRequiredFile(paths.mainApplicationPath);
  const activeSource = stripKotlinComments(source);
  assert(
    patchMainApplicationContents(source, paths.packageName) === source,
    "MainApplication.kt is not synchronized with restore native support"
  );

  const preservedRestTimerSnippets = [
    `import ${paths.packageName}.notifications.RestTimerNotificationsPackage`,
    "add(RestTimerNotificationsPackage())",
  ];
  for (const snippet of preservedRestTimerSnippets) {
    assert(
      countOccurrences(activeSource, snippet) === 1,
      `Existing rest-timer registration was not preserved exactly once: ${snippet}`
    );
  }
}

function verifyAppBuildGradle(paths) {
  const source = readRequiredFile(paths.appBuildGradlePath);
  const activeSource = stripKotlinComments(source);
  assert(
    patchAppBuildGradleContents(source) === source,
    "android/app/build.gradle is not synchronized with restore native support"
  );
  assert(
    countOccurrences(activeSource, GSON_DEPENDENCY) === 1,
    `android/app/build.gradle must contain exactly one ${GSON_DEPENDENCY}`
  );
  assert(
    countOccurrences(activeSource, JUNIT_DEPENDENCY) === 1,
    `android/app/build.gradle must contain exactly one ${JUNIT_DEPENDENCY}`
  );
}

function verifyAppConfiguration(identity) {
  const pluginNames = (identity.appJson.expo.plugins || []).map((plugin) =>
    Array.isArray(plugin) ? plugin[0] : plugin
  );
  assert(
    pluginNames.filter((plugin) => plugin === "./plugins/withAndroidRestoreNative").length === 1,
    "app.json must configure withAndroidRestoreNative exactly once"
  );
  assert(
    pluginNames.filter((plugin) => plugin === "./plugins/withAndroidRestTimerNative").length === 1,
    "app.json must preserve withAndroidRestTimerNative exactly once"
  );
}

function verifyNativeInvariants(paths) {
  const identitySource = readRequiredFile(
    path.join(paths.templateDir, "AppProcessIdentity.kt")
  );
  for (const snippet of [
    "object AppProcessIdentity",
    "@Volatile",
    "processToken = \"process-v1:${UUID.randomUUID()}\"",
    "fun initialize()",
  ]) {
    assert(identitySource.includes(snippet), `Missing process identity invariant: ${snippet}`);
  }

  const identityModuleSource = readRequiredFile(
    path.join(paths.templateDir, "AppProcessIdentityModule.kt")
  );
  assert(
    identityModuleSource.includes("@ReactMethod(isBlockingSynchronousMethod = true)"),
    "Process identity bridge must remain synchronous"
  );
  assert(
    identityModuleSource.includes('const val NAME = "AppProcessIdentity"'),
    "Process identity native module name has drifted"
  );

  const storeSource = readRequiredFile(path.join(paths.templateDir, "RestoreControlStore.kt"));
  const requiredStoreSnippets = [
    "AtomicFile(baseFile)",
    "atomicFile.startWrite()",
    "stream.fd.sync()",
    "atomicFile.finishWrite(stream)",
    "atomicFile.failWrite(it)",
    "atomicFile.openRead()",
    "atomicFile.delete()",
    "@Synchronized",
    'private const val DIRECTORY_NAME = "restore-control"',
    'private const val PENDING_FILENAME = "pending.json"',
    'private const val OUTCOME_FILENAME = "outcome.json"',
    "const val MAX_RECORD_BYTES = 256 * 1024",
    "published.contentEquals(bytes)",
    'File("${baseFile.path}.new")',
    'File("${baseFile.path}.bak")',
    "Os.lstat(file.path)",
    "error.errno == OsConstants.ENOENT",
  ];
  for (const snippet of requiredStoreSnippets) {
    assert(storeSource.includes(snippet), `Missing restore control-store invariant: ${snippet}`);
  }
  assert(
    countOccurrences(storeSource, "@Synchronized") === 3,
    "Every native restore control-store operation must be serialized"
  );
  assert(
    !storeSource.includes("JSONTokener") && !storeSource.includes("JSONObject"),
    "Restore control-store validation must not use Android's lenient JSONTokener"
  );

  const jsonEnvelopeSource = readRequiredFile(
    path.join(paths.templateDir, "RestoreJsonEnvelope.kt")
  );
  for (const snippet of [
    "JsonReader(StringReader(json))",
    "reader.strictness = Strictness.STRICT",
    "reader.peek() != JsonToken.BEGIN_OBJECT",
    "reader.skipValue()",
    "reader.peek() != JsonToken.END_DOCUMENT",
    "requireStrictStringCharacters(json)",
    "character.code <= 0x1f",
    "character == '\\uFEFF'",
    "return json",
  ]) {
    assert(
      jsonEnvelopeSource.includes(snippet),
      `Missing strict JSON-envelope invariant: ${snippet}`
    );
  }

  const jsonEnvelopeTestSource = readRequiredFile(
    path.join(
      paths.projectRoot,
      "android",
      "app",
      "src",
      "test",
      "java",
      ...paths.packageName.split("."),
      "restore",
      "RestoreJsonEnvelopeTest.kt"
    )
  );
  for (const snippet of [
    "RestoreJsonEnvelope.requireObject(json)",
    '"{foo:\'bar\'}"',
    '"{\\\"value\\\":\\\"\\\\x41\\\"}"',
    '"{\\\"value\\\":TRUE}"',
    '"{\\\"value\\\":1.}"',
    '"{}{}"',
  ]) {
    assert(
      jsonEnvelopeTestSource.includes(snippet),
      `Missing native strict-parser regression: ${snippet}`
    );
  }

  const storeModuleSource = readRequiredFile(
    path.join(paths.templateDir, "RestoreControlStoreModule.kt")
  );
  assert(
    countOccurrences(storeModuleSource, "@ReactMethod(isBlockingSynchronousMethod = true)") === 3,
    "All restore control-store bridge operations must remain synchronous"
  );
  assert(
    storeModuleSource.includes(
      "fun writeRestoreControlRecord(name: String, json: String): Boolean"
    ) &&
      storeModuleSource.includes(
        "fun deleteRestoreControlRecord(name: String): Boolean"
      ) &&
      countOccurrences(storeModuleSource, "return true") === 2,
    "Synchronous native mutations must return explicit success acknowledgements"
  );
  assert(
    storeModuleSource.includes('const val NAME = "RestoreControlStore"'),
    "Restore control-store native module name has drifted"
  );

  const fileSha256Source = readRequiredFile(
    path.join(paths.templateDir, "FileSha256.kt")
  );
  for (const snippet of [
    'MessageDigest.getInstance("SHA-256")',
    "const val BUFFER_BYTES = 64 * 1024",
    "const val DEFAULT_MAX_BYTES = 256L * 1024L * 1024L",
    "FileInputStream(file)",
    "Os.fstat(stream.fd)",
    "Os.stat(file.path)",
    "descriptorStat.st_size != expectedBytes",
    "pathStat.st_size != expectedBytes",
    "primaryFailure.addSuppressed(closeError)",
    "checkCancelled(isCancelled)",
  ]) {
    assert(fileSha256Source.includes(snippet), `Missing file SHA-256 invariant: ${snippet}`);
  }

  const fileSha256ModuleSource = readRequiredFile(
    path.join(paths.templateDir, "FileSha256Module.kt")
  );
  for (const snippet of [
    "class FileSha256Module(",
    "const val MAX_RUNNING_JOBS = 2",
    "const val MAX_QUEUED_JOBS = 2",
    "ArrayBlockingQueue(MAX_QUEUED_JOBS)",
    "fun cancelSha256File(requestId: String, promise: Promise)",
    "promise.resolve(jobs.cancel(requestId))",
    "jobs.invalidate()",
    '@ReactMethod(isBlockingSynchronousMethod = true)',
    'const val NAME = "FileSha256"',
  ]) {
    assert(
      fileSha256ModuleSource.includes(snippet),
      `Missing file SHA-256 module invariant: ${snippet}`
    );
  }
  assert(
    !fileSha256ModuleSource.includes(
      "@ReactMethod(isBlockingSynchronousMethod = true)\n  fun cancelSha256File"
    ),
    "File SHA-256 cancellation must share the queued asynchronous native-method order"
  );

  const packageSource = readRequiredFile(path.join(paths.templateDir, "RestoreNativePackage.kt"));
  for (const snippet of [
    "class RestoreNativePackage : BaseReactPackage()",
    "AppProcessIdentityModule.NAME -> AppProcessIdentityModule(reactContext)",
    "FileSha256Module.NAME -> FileSha256Module(reactContext)",
    "RestoreControlStoreModule.NAME -> RestoreControlStoreModule(reactContext)",
    "override fun getReactModuleInfoProvider(): ReactModuleInfoProvider",
  ]) {
    assert(packageSource.includes(snippet), `Missing restore package invariant: ${snippet}`);
  }

  const identityAdapter = readRequiredFile(
    path.join(paths.projectRoot, "lib", "native", "appProcessIdentity.ts")
  );
  const storeAdapter = readRequiredFile(
    path.join(paths.projectRoot, "lib", "native", "restoreControlStore.ts")
  );
  const fileSha256Adapter = readRequiredFile(
    path.join(paths.projectRoot, "lib", "native", "fileSha256.ts")
  );
  assert(
    identityAdapter.includes("NativeModules.AppProcessIdentity"),
    "Process identity TypeScript adapter module name has drifted"
  );
  assert(
    storeAdapter.includes("NativeModules.RestoreControlStore"),
    "Restore control-store TypeScript adapter module name has drifted"
  );
  assert(
    fileSha256Adapter.includes("NativeModules.FileSha256"),
    "File SHA-256 TypeScript adapter module name has drifted"
  );
}

function verifyAndroidRestoreNative(projectRoot = path.resolve(__dirname, "..")) {
  const identity = getExpoIdentity(projectRoot);
  const paths = getPaths(projectRoot);
  verifyTemplateParity(paths);
  verifyAppBuildGradle(paths);
  verifyMainApplication(paths);
  verifyAppConfiguration(identity);
  verifyNativeInvariants(paths);
  return { packageName: identity.packageName };
}

if (require.main === module) {
  try {
    const result = verifyAndroidRestoreNative();
    console.log(`Verified Android restore native integration for ${result.packageName}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = {
  verifyAndroidRestoreNative,
  verifyAppBuildGradle,
  verifyAppConfiguration,
  verifyMainApplication,
  verifyNativeInvariants,
  verifyTemplateParity,
};
