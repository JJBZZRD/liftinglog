/* global __dirname */
const fs = require("fs");
const path = require("path");
const {
  getPackageListApplyBlock,
  stripKotlinComments,
} = require("./sync-android-rest-timer-native");

const KOTLIN_TEMPLATES = [
  "AppProcessIdentity.kt",
  "AppProcessIdentityModule.kt",
  "RestoreJsonEnvelope.kt",
  "RestoreControlStore.kt",
  "RestoreControlStoreModule.kt",
  "RestoreNativePackage.kt",
];
const PACKAGE_TOKEN = "__ANDROID_PACKAGE__";
const GSON_DEPENDENCY = "implementation('com.google.code.gson:gson:2.13.2')";
const JUNIT_DEPENDENCY = "testImplementation('junit:junit:4.13.2')";

function countOccurrences(source, snippet) {
  return source.split(snippet).length - 1;
}

function getExpoIdentity(projectRoot) {
  const appJsonPath = path.join(projectRoot, "app.json");
  if (!fs.existsSync(appJsonPath)) {
    throw new Error(`Missing Expo app configuration: ${appJsonPath}`);
  }

  const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
  const packageName = appJson?.expo?.android?.package;
  if (typeof packageName !== "string" || !packageName) {
    throw new Error("app.json must define expo.android.package for restore native support");
  }
  return { appJson, appJsonPath, packageName };
}

function getPaths(projectRoot) {
  const { packageName } = getExpoIdentity(projectRoot);
  const androidRoot = path.join(projectRoot, "android");
  const javaRoot = path.join(
    androidRoot,
    "app",
    "src",
    "main",
    "java",
    ...packageName.split(".")
  );
  return {
    projectRoot,
    packageName,
    androidRoot,
    javaRoot,
    restoreDir: path.join(javaRoot, "restore"),
    templateDir: path.join(projectRoot, "scripts", "android-restore-native"),
    appBuildGradlePath: path.join(androidRoot, "app", "build.gradle"),
    mainApplicationPath: path.join(javaRoot, "MainApplication.kt"),
  };
}

function ensureAndroidExists(paths) {
  if (!fs.existsSync(paths.androidRoot)) {
    throw new Error(
      "android/ does not exist. Run `npx expo prebuild --platform android --clean` first."
    );
  }
}

function renderKotlinTemplate(source, packageName) {
  if (!source.includes(PACKAGE_TOKEN)) {
    throw new Error(`Restore Kotlin template is missing ${PACKAGE_TOKEN}`);
  }
  return source.split(PACKAGE_TOKEN).join(packageName);
}

function syncKotlinTemplates(paths) {
  fs.mkdirSync(paths.restoreDir, { recursive: true });
  for (const filename of KOTLIN_TEMPLATES) {
    const sourcePath = path.join(paths.templateDir, filename);
    const destinationPath = path.join(paths.restoreDir, filename);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing restore Kotlin template: ${sourcePath}`);
    }
    const rendered = renderKotlinTemplate(
      fs.readFileSync(sourcePath, "utf8"),
      paths.packageName
    );
    const existing = fs.existsSync(destinationPath)
      ? fs.readFileSync(destinationPath, "utf8")
      : null;
    if (existing !== rendered) {
      fs.writeFileSync(destinationPath, rendered, "utf8");
    }
    console.log(`Verified ${path.relative(paths.projectRoot, destinationPath)}`);
  }
}

function getUniqueBlockRange(activeContents, anchorPattern, description) {
  const matches = [...activeContents.matchAll(anchorPattern)];
  if (matches.length !== 1) {
    throw new Error(`Could not find the unique ${description} in MainApplication.kt`);
  }

  const start = matches[0].index;
  const openingBrace = activeContents.indexOf("{", start);
  let depth = 0;
  for (let index = openingBrace; index < activeContents.length; index += 1) {
    if (activeContents[index] === "{") {
      depth += 1;
    } else if (activeContents[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return { start, end: index + 1 };
      }
    }
  }
  throw new Error(`${description} is not balanced in MainApplication.kt`);
}

function patchMainApplicationContents(contents, packageName) {
  const importLines = [
    `import ${packageName}.restore.AppProcessIdentity`,
    `import ${packageName}.restore.RestoreNativePackage`,
  ];
  const registrationPattern =
    /^[ \t]*add\s*\(\s*RestoreNativePackage\s*\(\s*\)\s*\)[ \t]*$/gm;
  const initializationPattern =
    /^[ \t]*AppProcessIdentity\.initialize\s*\(\s*\)[ \t]*$/gm;
  const lineEnding = contents.includes("\r\n") ? "\r\n" : "\n";
  let activeContents = stripKotlinComments(contents);

  if (!activeContents.includes(`package ${packageName}`)) {
    throw new Error(`MainApplication.kt package does not match ${packageName}`);
  }

  const anyRestoreImports =
    activeContents.match(/^import .*\.restore\.(?:AppProcessIdentity|RestoreNativePackage)$/gm) || [];
  for (const importLine of importLines) {
    const count = countOccurrences(activeContents, importLine);
    if (count > 1) {
      throw new Error(`MainApplication.kt contains duplicate import: ${importLine}`);
    }
  }
  if (
    anyRestoreImports.length !==
    importLines.reduce((total, importLine) => total + countOccurrences(activeContents, importLine), 0)
  ) {
    throw new Error("MainApplication.kt contains restore imports for a different package");
  }

  const missingImports = importLines.filter(
    (importLine) => countOccurrences(activeContents, importLine) === 0
  );
  if (missingImports.length > 0) {
    const importAnchor = "import expo.modules.ApplicationLifecycleDispatcher";
    if (countOccurrences(activeContents, importAnchor) !== 1) {
      throw new Error("Could not find the unique Expo import anchor in MainApplication.kt");
    }
    const insertionIndex = activeContents.indexOf(importAnchor);
    const insertion = `${missingImports.join(lineEnding)}${lineEnding}`;
    contents = `${contents.slice(0, insertionIndex)}${insertion}${contents.slice(insertionIndex)}`;
    activeContents = stripKotlinComments(contents);
  }

  const registrationCount = (activeContents.match(registrationPattern) || []).length;
  if (registrationCount > 1) {
    throw new Error("MainApplication.kt contains duplicate restore package registrations");
  }
  if (registrationCount === 0) {
    const packageListAnchor = /PackageList\(this\)\.packages\.apply\s*\{\r?\n/g;
    const packageListMatches = [...activeContents.matchAll(packageListAnchor)];
    if (packageListMatches.length !== 1) {
      throw new Error("Could not find the unique PackageList apply block in MainApplication.kt");
    }
    const insertionIndex = packageListMatches[0].index + packageListMatches[0][0].length;
    contents =
      `${contents.slice(0, insertionIndex)}          add(RestoreNativePackage())${lineEnding}` +
      contents.slice(insertionIndex);
    activeContents = stripKotlinComments(contents);
  }

  const initializationCount = (activeContents.match(initializationPattern) || []).length;
  if (initializationCount > 1) {
    throw new Error("MainApplication.kt contains duplicate process identity initialization");
  }
  if (initializationCount === 0) {
    const onCreateRange = getUniqueBlockRange(
      activeContents,
      /override\s+fun\s+onCreate\s*\(\s*\)\s*\{/g,
      "onCreate block"
    );
    const onCreateBlock = activeContents.slice(onCreateRange.start, onCreateRange.end);
    const superMatches = [
      ...onCreateBlock.matchAll(/^([ \t]*)super\.onCreate\s*\(\s*\)[ \t]*\r?\n/gm),
    ];
    if (superMatches.length !== 1) {
      throw new Error("Could not find the unique super.onCreate() call in MainApplication.kt");
    }
    const insertionIndex = onCreateRange.start + superMatches[0].index + superMatches[0][0].length;
    const indentation = superMatches[0][1];
    contents =
      `${contents.slice(0, insertionIndex)}${indentation}AppProcessIdentity.initialize()` +
      `${lineEnding}${contents.slice(insertionIndex)}`;
    activeContents = stripKotlinComments(contents);
  }

  for (const importLine of importLines) {
    if (countOccurrences(activeContents, importLine) !== 1) {
      throw new Error(`Failed to write exactly one import: ${importLine}`);
    }
  }
  if ((activeContents.match(registrationPattern) || []).length !== 1) {
    throw new Error("Failed to write exactly one restore package registration");
  }
  if ((getPackageListApplyBlock(activeContents).match(registrationPattern) || []).length !== 1) {
    throw new Error("Restore package registration is outside the PackageList apply block");
  }
  const onCreateRange = getUniqueBlockRange(
    activeContents,
    /override\s+fun\s+onCreate\s*\(\s*\)\s*\{/g,
    "onCreate block"
  );
  const onCreateBlock = activeContents.slice(onCreateRange.start, onCreateRange.end);
  if ((onCreateBlock.match(initializationPattern) || []).length !== 1) {
    throw new Error("Process identity initialization is outside the onCreate block");
  }
  return contents;
}

function patchAppBuildGradleContents(contents) {
  const lineEnding = contents.includes("\r\n") ? "\r\n" : "\n";
  const activeContents = stripKotlinComments(contents);
  const dependencySpecifications = [
    {
      expected: GSON_DEPENDENCY,
      pattern:
        /^[ \t]*implementation\s*\(?\s*['"]com\.google\.code\.gson:gson:[^'"]+['"]\s*\)?[ \t]*$/gm,
      description: "Gson",
    },
    {
      expected: JUNIT_DEPENDENCY,
      pattern:
        /^[ \t]*testImplementation\s*\(?\s*['"]junit:junit:[^'"]+['"]\s*\)?[ \t]*$/gm,
      description: "JUnit",
    },
  ];
  const missing = [];

  for (const specification of dependencySpecifications) {
    const declarations = activeContents.match(specification.pattern) || [];
    if (declarations.length > 1) {
      throw new Error(`android/app/build.gradle contains duplicate ${specification.description} dependencies`);
    }
    if (declarations.length === 1) {
      if (declarations[0].trim() !== specification.expected) {
        throw new Error(
          `android/app/build.gradle must use exactly ${specification.expected}`
        );
      }
    } else {
      missing.push(specification.expected);
    }
  }

  if (missing.length === 0) {
    return contents;
  }

  const dependenciesAnchor = /^dependencies\s*\{[ \t]*\r?\n/gm;
  const matches = [...activeContents.matchAll(dependenciesAnchor)];
  if (matches.length !== 1) {
    throw new Error("Could not find the unique dependencies block in android/app/build.gradle");
  }
  const insertionIndex = matches[0].index + matches[0][0].length;
  const insertion = missing.map((dependency) => `    ${dependency}`).join(lineEnding);
  return `${contents.slice(0, insertionIndex)}${insertion}${lineEnding}${contents.slice(insertionIndex)}`;
}

function patchMainApplication(paths) {
  if (!fs.existsSync(paths.mainApplicationPath)) {
    throw new Error(`Missing MainApplication.kt: ${paths.mainApplicationPath}`);
  }
  const original = fs.readFileSync(paths.mainApplicationPath, "utf8");
  const next = patchMainApplicationContents(original, paths.packageName);
  if (next !== original) {
    fs.writeFileSync(paths.mainApplicationPath, next, "utf8");
  }
  console.log(`Verified ${path.relative(paths.projectRoot, paths.mainApplicationPath)}`);
}

function patchAppBuildGradle(paths) {
  if (!fs.existsSync(paths.appBuildGradlePath)) {
    throw new Error(`Missing Android app build file: ${paths.appBuildGradlePath}`);
  }
  const original = fs.readFileSync(paths.appBuildGradlePath, "utf8");
  const next = patchAppBuildGradleContents(original);
  if (next !== original) {
    fs.writeFileSync(paths.appBuildGradlePath, next, "utf8");
  }
  console.log(`Verified ${path.relative(paths.projectRoot, paths.appBuildGradlePath)}`);
}

function syncAndroidRestoreNativeAssets(projectRoot = path.resolve(__dirname, "..")) {
  const paths = getPaths(projectRoot);
  ensureAndroidExists(paths);
  syncKotlinTemplates(paths);
  return paths;
}

function syncAndroidRestoreNative(projectRoot = path.resolve(__dirname, "..")) {
  const paths = syncAndroidRestoreNativeAssets(projectRoot);
  patchAppBuildGradle(paths);
  patchMainApplication(paths);
  console.log("Android restore native files are in sync.");
  return paths;
}

if (require.main === module) {
  try {
    syncAndroidRestoreNative();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = {
  KOTLIN_TEMPLATES,
  PACKAGE_TOKEN,
  GSON_DEPENDENCY,
  JUNIT_DEPENDENCY,
  getExpoIdentity,
  getPaths,
  patchAppBuildGradleContents,
  patchMainApplicationContents,
  renderKotlinTemplate,
  syncAndroidRestoreNative,
  syncAndroidRestoreNativeAssets,
};
