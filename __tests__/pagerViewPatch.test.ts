import fs from "fs";
import os from "os";
import path from "path";

const {
  PAGER_FILES,
  applyPagerViewPatchToSources,
  getPagerViewPaths,
  patchReactNativePagerView,
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Exercise the CommonJS install script directly.
} = require("../scripts/patch-react-native-pager-view");

type Sources = Record<string, string>;
const fixtureRoot = path.join(__dirname, "fixtures", "react-native-pager-view-8.0.2");
// These are pristine upstream 8.0.2 files with the accompanying MIT license.
// No installed node_modules or generated Android project is used as test input.
const upstream: Sources = Object.fromEntries(
  ["ViewPagerAdapter.kt", "PagerViewViewManager.kt", "NestedScrollableHost.kt"].map((name) => [
    name,
    fs.readFileSync(path.join(fixtureRoot, name), "utf8").replace(/\r\n/g, "\n"),
  ])
);

describe("PagerView Android lifecycle patch", () => {
  test("preserves holder ownership and stops scrolling before removal and disposal", () => {
    const patched = applyPagerViewPatchToSources(upstream);
    const adapter = patched["ViewPagerAdapter.kt"];
    const manager = patched["PagerViewViewManager.kt"];

    expect(adapter).toContain("(child.parent as? ViewGroup)?.removeView(child)");
    expect(adapter).not.toContain("child.parent.parent");
    expect(adapter).toContain("childrenViews.clear()\n    notifyItemRangeRemoved(0, removedChildrenCount)");
    expect(adapter).toContain("holder.setIsRecyclable(false)");
    expect(adapter).not.toContain("onViewRecycled");
    expect(manager).toContain(
      "val recyclerView = (host.getChildAt(0) as? ViewPager2)?.getChildAt(0) as? RecyclerView\n" +
      "        recyclerView?.stopScroll()"
    );
    for (const method of ["removeView", "removeAllViews", "removeViewAt"]) {
      expect(manager).toMatch(new RegExp(
        `override fun ${method}\\([^\\n]+\\) \\{\\n` +
        `        stopScrollIfNeeded\\(parent\\)\\n` +
        `        PagerViewViewManagerImpl\\.${method}\\(`
      ));
    }
    expect(manager).toContain(
      "override fun onDropViewInstance(view: NestedScrollableHost) {\n" +
      "        stopScrollIfNeeded(view)\n" +
      "        super.onDropViewInstance(view)\n    }"
    );
    expect(manager).not.toMatch(/catch\s*\(|adapter\s*=\s*null|swapAdapter|getDeclaredField/);
    expect(applyPagerViewPatchToSources(patched)).toEqual(patched);
    expect(upstream["ViewPagerAdapter.kt"]).toContain("child.parent.parent");
  });

  test("stops the active fling before native screens can mark the pager descendants transitioning", () => {
    const patched = applyPagerViewPatchToSources(upstream);
    const host = patched["NestedScrollableHost.kt"];
    const transition = host.match(/override fun startViewTransition\(view: View\?\) \{([\s\S]*?)\n  \}/)?.[1];
    expect(transition).toBeDefined();
    expect(transition).toMatch(
      /if \(view is ViewPager2\) \{\s*\(view\.getChildAt\(0\) as\? RecyclerView\)\?\.stopScroll\(\)\s*\}\s*super\.startViewTransition\(view\)/
    );
    expect(transition).not.toMatch(/post\s*\{|postDelayed|suppressLayout|catch\s*\(/);
    expect(host).toContain("import androidx.recyclerview.widget.RecyclerView");
    expect(applyPagerViewPatchToSources(patched)).toEqual(patched);
  });

  test("preserves CRLF input and verifies it idempotently", () => {
    const crlf = Object.fromEntries(
      Object.entries(upstream).map(([name, source]) => [name, source.replace(/\n/g, "\r\n")])
    );
    const patched = applyPagerViewPatchToSources(crlf);
    for (const source of Object.values(patched) as string[]) {
      expect(source).toContain("\r\n");
      expect(source.replace(/\r\n/g, "")).not.toContain("\n");
    }
    expect(applyPagerViewPatchToSources(patched)).toEqual(patched);
  });

  test("rejects a partial patch across files or within the manager", () => {
    const patched = applyPagerViewPatchToSources(upstream);
    expect(() => applyPagerViewPatchToSources({
      ...upstream,
      "ViewPagerAdapter.kt": patched["ViewPagerAdapter.kt"],
    })).toThrow("only partially patched");
    expect(() => applyPagerViewPatchToSources({
      ...patched,
      "PagerViewViewManager.kt": patched["PagerViewViewManager.kt"].replace(
        "        stopScrollIfNeeded(view)\n        super.onDropViewInstance(view)",
        "        super.onDropViewInstance(view)"
      ),
    })).toThrow("only partially patched");
  });

  test("rejects missing and duplicate replacement anchors before producing output", () => {
    for (const [name, definition] of Object.entries(PAGER_FILES) as [string, any][]) {
      for (const transformation of definition.transformations) {
        expect(() => applyPagerViewPatchToSources({
          ...upstream,
          [name]: upstream[name].replace(transformation.before, "// changed upstream block"),
        })).toThrow("neither exactly unpatched nor exactly patched");
        expect(() => applyPagerViewPatchToSources({
          ...upstream,
          [name]: `${upstream[name]}\n${transformation.before}`,
        })).toThrow("neither exactly unpatched nor exactly patched");
      }
    }
  });

  test.each([false, true])("rejects changes outside replacement anchors (patched=%s)", (alreadyPatched) => {
    const sources = alreadyPatched ? applyPagerViewPatchToSources(upstream) : upstream;
    expect(() => applyPagerViewPatchToSources({
      ...sources,
      "PagerViewViewManager.kt": sources["PagerViewViewManager.kt"].replace(
        "vp.isSaveEnabled = false", "vp.isSaveEnabled = true"
      ),
    })).toThrow("source has drifted from 8.0.2");
  });
});

describe("PagerView patch installation", () => {
  let projectRoot: string;
  let packageJsonPath: string;
  let targetPaths: Record<string, string>;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workoutlog-pager-patch-"));
    ({ packageJsonPath, targetPaths } = getPagerViewPaths(projectRoot));
    for (const [name, targetPath] of Object.entries(targetPaths)) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, upstream[name]);
    }
    fs.writeFileSync(packageJsonPath, JSON.stringify({ version: "8.0.2" }));
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    const resolvedRoot = path.resolve(projectRoot);
    if (path.dirname(resolvedRoot) !== path.resolve(os.tmpdir()) ||
        !path.basename(resolvedRoot).startsWith("workoutlog-pager-patch-")) {
      throw new Error(`Refusing to remove unexpected fixture directory: ${resolvedRoot}`);
    }
    fs.rmSync(resolvedRoot, { recursive: true, force: true });
  });

  test("writes the verified patch once and leaves already patched files untouched", () => {
    expect(patchReactNativePagerView(projectRoot)).toEqual(Object.keys(upstream));
    const expected = applyPagerViewPatchToSources(upstream);
    for (const [name, targetPath] of Object.entries(targetPaths)) {
      expect(fs.readFileSync(targetPath, "utf8")).toBe(expected[name]);
    }
    const write = jest.spyOn(fs, "writeFileSync");
    expect(patchReactNativePagerView(projectRoot)).toEqual([]);
    expect(write).not.toHaveBeenCalled();
  });

  test.each([
    ["version", "Unsupported react-native-pager-view version"],
    ["metadata", "Missing react-native-pager-view package metadata"],
    ["missing source", "Missing PagerView source"],
    ["changed source", "source has drifted"],
    ["changed last source", "source has drifted"],
    ["partial patch", "only partially patched"],
  ])("rejects %s without writing either Kotlin file", (failure, message) => {
    if (failure === "version") {
      fs.writeFileSync(packageJsonPath, JSON.stringify({ version: "8.0.3" }));
    } else if (failure === "metadata") {
      fs.unlinkSync(packageJsonPath);
    } else if (failure === "missing source") {
      fs.unlinkSync(targetPaths["PagerViewViewManager.kt"]);
    } else if (failure === "changed source") {
      fs.appendFileSync(targetPaths["PagerViewViewManager.kt"], "\n// unexpected modification\n");
    } else if (failure === "changed last source") {
      fs.appendFileSync(targetPaths["NestedScrollableHost.kt"], "\n// unexpected modification\n");
    } else {
      fs.writeFileSync(targetPaths["PagerViewViewManager.kt"],
        applyPagerViewPatchToSources(upstream)["PagerViewViewManager.kt"]);
    }
    const before = Object.fromEntries(Object.entries(targetPaths).map(([name, targetPath]) => [
      name, fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : null,
    ]));
    const write = jest.spyOn(fs, "writeFileSync");
    expect(() => patchReactNativePagerView(projectRoot)).toThrow(message);
    expect(write).not.toHaveBeenCalled();
    for (const [name, targetPath] of Object.entries(targetPaths)) {
      expect(fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : null).toBe(before[name]);
    }
  });
});
