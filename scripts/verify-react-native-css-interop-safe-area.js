const fs = require("fs");
const path = require("path");

function verifyReactNativeCssInteropSafeArea(projectRoot = path.resolve(__dirname, "..")) {
  const targetPath = path.join(
    projectRoot,
    "node_modules",
    "react-native-css-interop",
    "dist",
    "runtime",
    "components.js"
  );
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing react-native-css-interop runtime artifact: ${targetPath}`);
  }

  const source = fs.readFileSync(targetPath, "utf8");
  const requiredSnippets = [
    'const SafeAreaView = require("react-native-safe-area-context").SafeAreaView;',
    "(0, api_1.cssInterop)(SafeAreaView, {",
  ];

  for (const snippet of requiredSnippets) {
    if (!source.includes(snippet)) {
      throw new Error(`CSS Interop SafeAreaView integration is missing: ${snippet}`);
    }
  }
  if (source.includes("react_native_1.SafeAreaView")) {
    throw new Error("CSS Interop still registers React Native's deprecated core SafeAreaView");
  }

  return targetPath;
}

if (require.main === module) {
  try {
    verifyReactNativeCssInteropSafeArea();
    console.log(
      "[verify-react-native-css-interop-safe-area] Verified safe-area-context registration."
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = { verifyReactNativeCssInteropSafeArea };
