const fs = require("fs");
const path = require("path");

const distTargetPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-native-css-interop",
  "dist",
  "runtime",
  "components.js"
);

const srcTargetPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-native-css-interop",
  "src",
  "runtime",
  "components.ts"
);

function removeSnippet(source, snippet) {
  return source.includes(snippet) ? source.replace(snippet, "") : source;
}

function patchFile(targetPath, removals) {
  if (!fs.existsSync(targetPath)) {
    console.warn(`[patch-react-native-css-interop-safe-area] Skipped; file not found: ${targetPath}`);
    return false;
  }

  const original = fs.readFileSync(targetPath, "utf8");
  const next = removals.reduce((source, snippet) => removeSnippet(source, snippet), original);

  if (next === original) {
    return false;
  }

  fs.writeFileSync(targetPath, next, "utf8");
  return true;
}

function patchReactNativeCssInteropSafeArea() {
  const distPatched = patchFile(distTargetPath, [
    '(0, api_1.cssInterop)(react_native_1.SafeAreaView, { className: "style" });\n',
  ]);
  const srcPatched = patchFile(srcTargetPath, [
    "  SafeAreaView,\n",
    'cssInterop(SafeAreaView, { className: "style" });\n',
  ]);

  if (distPatched || srcPatched) {
    console.log("[patch-react-native-css-interop-safe-area] Removed deprecated core SafeAreaView registration.");
    return;
  }

  console.log("[patch-react-native-css-interop-safe-area] Already patched.");
}

patchReactNativeCssInteropSafeArea();
