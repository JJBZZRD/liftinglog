/* global __dirname */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SUPPORTED_PAGER_VIEW_VERSION = "8.0.2";

// Narrow mitigation for https://github.com/callstack/react-native-pager-view/issues/1005.
// Follow the ownership and stopScroll fixes in upstream commit 2c4ea72, without
// changing holder recycling or swallowing errors during teardown.
const PAGER_FILES = {
  "ViewPagerAdapter.kt": {
    upstreamSha256: "542a1f70ccb2e1e8477092566c303fb7c26714cc08e3b63e5b679182a035a0f9",
    transformations: [
      {
        label: "removeAll child ownership",
        before: [
          "  fun removeAll() {",
          "    for (index in 1..childrenViews.size) {",
          "      val child = childrenViews[index-1]",
          "      if (child.parent?.parent != null) {",
          "        (child.parent.parent as ViewGroup).removeView(child.parent as View)",
          "      }",
          "    }",
        ].join("\n"),
        after: [
          "  fun removeAll() {",
          "    // RecyclerView owns the holder containers; detach only React children.",
          "    for (child in childrenViews) {",
          "      (child.parent as? ViewGroup)?.removeView(child)",
          "    }",
        ].join("\n"),
      },
    ],
  },
  "PagerViewViewManager.kt": {
    upstreamSha256: "f19ebe0f32a0a624ca18f50aeb320536566f6551ebcb82a3878faab7e413760e",
    transformations: [
      {
        label: "RecyclerView import",
        before: "import android.view.ViewGroup\nimport androidx.viewpager2.widget.ViewPager2",
        after: "import android.view.ViewGroup\nimport androidx.recyclerview.widget.RecyclerView\nimport androidx.viewpager2.widget.ViewPager2",
      },
      {
        label: "stopScroll and drop lifecycle",
        before: "    override fun addView(host: NestedScrollableHost, child: View, index: Int) {",
        after: [
          "    private fun stopScrollIfNeeded(host: NestedScrollableHost) {",
          "        val recyclerView = (host.getChildAt(0) as? ViewPager2)?.getChildAt(0) as? RecyclerView",
          "        recyclerView?.stopScroll()",
          "    }",
          "",
          "    override fun onDropViewInstance(view: NestedScrollableHost) {",
          "        stopScrollIfNeeded(view)",
          "        super.onDropViewInstance(view)",
          "    }",
          "",
          "    override fun addView(host: NestedScrollableHost, child: View, index: Int) {",
        ].join("\n"),
      },
      ...[
        ["removeView", "parent: NestedScrollableHost, view: View", "parent, view"],
        ["removeAllViews", "parent: NestedScrollableHost", "parent"],
        ["removeViewAt", "parent: NestedScrollableHost, index: Int", "parent, index"],
      ].map(([method, parameters, args]) => ({
        label: `${method} stopScroll`,
        before: [
          `    override fun ${method}(${parameters}) {`,
          `        PagerViewViewManagerImpl.${method}(${args})`,
          "    }",
        ].join("\n"),
        after: [
          `    override fun ${method}(${parameters}) {`,
          "        stopScrollIfNeeded(parent)",
          `        PagerViewViewManagerImpl.${method}(${args})`,
          "    }",
        ].join("\n"),
      })),
    ],
  },
  "NestedScrollableHost.kt": {
    upstreamSha256: "3cb52443551b73479458949d8c47eb4c203810d2c2e843a1ae0494faae2255b6",
    transformations: [
      {
        label: "RecyclerView import",
        before: "import android.widget.FrameLayout\nimport androidx.viewpager2.widget.ViewPager2",
        after: "import android.widget.FrameLayout\nimport androidx.recyclerview.widget.RecyclerView\nimport androidx.viewpager2.widget.ViewPager2",
      },
      {
        label: "stopScroll before screen removal transition",
        before: "  override fun onInterceptTouchEvent(e: MotionEvent): Boolean {",
        after: [
          "  override fun startViewTransition(view: View?) {",
          "    // Native screens recursively marks descendants as transitioning. Stop",
          "    // the fling before RecyclerView holders are kept attached for animation.",
          "    if (view is ViewPager2) {",
          "      (view.getChildAt(0) as? RecyclerView)?.stopScroll()",
          "    }",
          "    super.startViewTransition(view)",
          "  }",
          "",
          "  override fun onInterceptTouchEvent(e: MotionEvent): Boolean {",
        ].join("\n"),
      },
    ],
  },
};

function countOccurrences(source, snippet) {
  return source.split(snippet).length - 1;
}

function getTransformationState(source, transformation, fileName) {
  const afterCount = countOccurrences(source, transformation.after);
  const beforeCount = countOccurrences(source, transformation.before);
  const nestedBeforeCount = countOccurrences(transformation.after, transformation.before);
  if (afterCount === 1 && beforeCount === nestedBeforeCount) {
    return "patched";
  }
  if (afterCount === 0 && beforeCount === 1) {
    return "unpatched";
  }
  throw new Error(
    `PagerView ${fileName} ${transformation.label} is neither exactly unpatched nor exactly patched ` +
      `(before=${beforeCount}, after=${afterCount}); review the native patch`
  );
}

function assertSupportedPagerViewVersion(version) {
  if (version !== SUPPORTED_PAGER_VIEW_VERSION) {
    throw new Error(
      `Unsupported react-native-pager-view version ${version}; expected ${SUPPORTED_PAGER_VIEW_VERSION}. ` +
        "Review the Android lifecycle patch before install"
    );
  }
}

function applyPagerViewPatchToSources(sources) {
  const entries = Object.entries(PAGER_FILES).map(([fileName, definition]) => {
    const source = sources[fileName];
    if (typeof source !== "string") {
      throw new Error(`Missing PagerView source ${fileName}`);
    }
    const normalized = source.replace(/\r\n/g, "\n");
    const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
    if (normalized.includes("\r") || normalized.replace(/\n/g, lineEnding) !== source) {
      throw new Error(`PagerView ${fileName} has mixed or unsupported line endings`);
    }
    const states = definition.transformations.map((transformation) =>
      getTransformationState(normalized, transformation, fileName)
    );
    return { fileName, definition, normalized, lineEnding, states };
  });

  const states = entries.flatMap((entry) => entry.states);
  const patchedCount = states.filter((state) => state === "patched").length;
  if (patchedCount !== 0 && patchedCount !== states.length) {
    throw new Error("PagerView Android lifecycle source is only partially patched; reinstall the dependency");
  }
  const alreadyPatched = patchedCount === states.length;

  // Validate every file, including code outside the replacement anchors, before
  // returning any output for the filesystem wrapper to write.
  const nextSources = {};
  for (const { fileName, definition, normalized, lineEnding } of entries) {
    const upstream = alreadyPatched
      ? [...definition.transformations].reverse().reduce(
          (current, transformation) => current.replace(transformation.after, transformation.before),
          normalized
        )
      : normalized;
    const hash = crypto.createHash("sha256").update(upstream).digest("hex");
    if (hash !== definition.upstreamSha256) {
      throw new Error(
        `PagerView ${fileName} source has drifted from ${SUPPORTED_PAGER_VIEW_VERSION}; review the native patch`
      );
    }
    const nextSource = alreadyPatched
      ? normalized
      : definition.transformations.reduce(
          (current, transformation) => current.replace(transformation.before, transformation.after),
          normalized
        );
    for (const transformation of definition.transformations) {
      if (getTransformationState(nextSource, transformation, fileName) !== "patched") {
        throw new Error(`PagerView ${fileName} ${transformation.label} patch is missing`);
      }
    }
    nextSources[fileName] = nextSource.replace(/\n/g, lineEnding);
  }
  return nextSources;
}

function getPagerViewPaths(projectRoot = path.resolve(__dirname, "..")) {
  const packageRoot = path.join(projectRoot, "node_modules", "react-native-pager-view");
  const sourceRoot = path.join(packageRoot, "android", "src", "main", "java", "com", "reactnativepagerview");
  return {
    packageJsonPath: path.join(packageRoot, "package.json"),
    targetPaths: Object.fromEntries(
      Object.keys(PAGER_FILES).map((fileName) => [fileName, path.join(sourceRoot, fileName)])
    ),
  };
}

function patchReactNativePagerView(projectRoot = path.resolve(__dirname, "..")) {
  const { packageJsonPath, targetPaths } = getPagerViewPaths(projectRoot);
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Missing react-native-pager-view package metadata: ${packageJsonPath}`);
  }
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  assertSupportedPagerViewVersion(packageJson.version);

  const sources = {};
  for (const [fileName, targetPath] of Object.entries(targetPaths)) {
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Missing PagerView source ${fileName}: ${targetPath}`);
    }
    sources[fileName] = fs.readFileSync(targetPath, "utf8");
  }
  const nextSources = applyPagerViewPatchToSources(sources);
  const changedFiles = Object.keys(targetPaths).filter((fileName) => sources[fileName] !== nextSources[fileName]);
  for (const fileName of changedFiles) {
    fs.writeFileSync(targetPaths[fileName], nextSources[fileName], "utf8");
  }
  console.log(
    `[patch-react-native-pager-view] ${changedFiles.length ? "Applied" : "Verified"} PagerView Android lifecycle patch.`
  );
  return changedFiles;
}

if (require.main === module) {
  try {
    patchReactNativePagerView();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = {
  PAGER_FILES,
  SUPPORTED_PAGER_VIEW_VERSION,
  applyPagerViewPatchToSources,
  assertSupportedPagerViewVersion,
  getPagerViewPaths,
  patchReactNativePagerView,
};
