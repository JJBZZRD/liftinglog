import React from "react";
import { BackHandler } from "react-native";
import renderer, { act } from "react-test-renderer";

import ReplacementRestoreGate from "../../components/ReplacementRestoreGate";

type RenderedTree = ReturnType<typeof renderer.create>;
type TestNode = { type: unknown; props: Record<string, any> };

jest.mock("react-native", () => ({
  BackHandler: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  View: "View",
}));

const mockBackHandler = BackHandler as unknown as { addEventListener: jest.Mock };

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
};

const textContent = (children: unknown): string => Array.isArray(children)
  ? children.map(textContent).join("")
  : React.isValidElement(children)
    ? textContent((children as React.ReactElement<{ children?: unknown }>).props.children)
    : String(children ?? "");
const hasText = (tree: RenderedTree, value: string) => tree.root.findAll((node: TestNode) => node.type === "Text" && textContent(node.props.children).includes(value)).length > 0;
const button = (tree: RenderedTree, label: string) => tree.root.findAll((node: TestNode) => node.type === "Pressable" && node.props.accessibilityLabel === label)[0];
const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

const starting = { phase: "starting" as const, connectionInitialized: false as const, canMountApp: false as const };
const ready = { phase: "ready" as const, connectionInitialized: true as const, canMountApp: true as const };
const postcommit = (restoreId = "restore-1") => ({
  phase: "postcommit" as const,
  connectionInitialized: true as const,
  canMountApp: false as const,
  restoreId,
  requiresExplicitMediaScan: true as const,
});
const restored = (restoreId = "restore-1") => ({
  phase: "restored" as const,
  connectionInitialized: true as const,
  canMountApp: false as const,
  result: {
    status: "restored" as const,
    restoreId,
    liveDatabaseChanged: true as const,
    rowsByTable: {} as any,
    pbEventsRebuilt: 2,
    media: { total: 3, resolved: 1, unresolved: 2, skippedPermission: 0, errors: [] },
    cleanup: { deletedManagedFiles: 0, skippedUntrustedPaths: 0, errors: 0 },
    warnings: [{ stage: "media_reconciliation" as const, code: "missing" }],
  },
});
const blockedRestart = (allowedActions: readonly string[] = ["cancel_and_reload"]) => ({
  phase: "blocked" as const,
  connectionInitialized: true as const,
  canMountApp: false as const,
  allowedActions: allowedActions as any,
  blocker: { status: "restart_required" as const, restoreId: "restore-1", liveDatabaseChanged: false as const, restartRequired: true as const },
});
const blockedFailure = (liveDatabaseChanged: boolean | "unknown", recovery = "manual_recovery", token?: string, transactionState = "unknown"): any => ({
  phase: "blocked" as const,
  connectionInitialized: true as const,
  canMountApp: false as const,
  allowedActions: ["discard_and_reload"] as any,
  blocker: {
    status: "failed" as const,
    restoreId: "restore-1",
    error: { code: "rollback_failed", stage: "verifying_commit", liveDatabaseChanged, transactionState, recovery, recoveryToken: token, retryable: false },
  },
});
const blockedCommitted = {
  phase: "blocked" as const,
  connectionInitialized: true as const,
  canMountApp: false as const,
  allowedActions: ["retry_control_finalization"] as any,
  blocker: { status: "committed_pending_cleanup" as const, restoreId: "restore-1", liveDatabaseChanged: true as const, normalUseBlocked: true as const, retryable: true as const, warning: { stage: "pending_manifest_cleanup" as const, code: "cleanup" } },
};

describe("ReplacementRestoreGate", () => {
  let performAction: jest.Mock;
  let mounts: number;

  const Child = () => {
    mounts += 1;
    return <>App children</>;
  };
  const render = (snapshot: any) => renderer.create(
    <ReplacementRestoreGate snapshot={snapshot} performAction={performAction}><Child /></ReplacementRestoreGate>
  );

  beforeEach(() => {
    performAction = jest.fn().mockResolvedValue(undefined);
    mounts = 0;
    mockBackHandler.addEventListener.mockClear();
  });

  it("excludes children until externally ready and cleans up the hardware-back guard", async () => {
    let tree!: RenderedTree;
    await act(async () => { tree = render(starting); });
    expect(mounts).toBe(0);
    expect(mockBackHandler.addEventListener).toHaveBeenCalledWith("hardwareBackPress", expect.any(Function));
    expect((mockBackHandler.addEventListener.mock.calls[0][1] as () => boolean)()).toBe(true);

    await act(async () => { tree.update(<ReplacementRestoreGate snapshot={ready} performAction={performAction}><Child /></ReplacementRestoreGate>); });
    expect(mounts).toBe(1);
    expect(mockBackHandler.addEventListener.mock.results[0].value.remove).toHaveBeenCalledTimes(1);

    await act(async () => { tree.update(<ReplacementRestoreGate snapshot={restored()} performAction={performAction}><Child /></ReplacementRestoreGate>); });
    expect(mounts).toBe(1);
    await act(async () => { tree.unmount(); });
    expect(mockBackHandler.addEventListener.mock.results[1].value.remove).toHaveBeenCalledTimes(1);
  });

  it("shows truthful unchanged, committed, and unknown outcomes", async () => {
    let tree!: RenderedTree;
    await act(async () => { tree = render(blockedFailure(false)); });
    expect(hasText(tree, "current app data was not changed")).toBe(true);

    const committedRestart = { ...blockedRestart(), blocker: { ...blockedRestart().blocker, liveDatabaseChanged: true as const } };
    await act(async () => { tree.update(<ReplacementRestoreGate snapshot={committedRestart} performAction={performAction}><Child /></ReplacementRestoreGate>); });
    expect(hasText(tree, "Restore changes were committed")).toBe(true);

    const unknownRestart = { ...blockedRestart(), blocker: { ...blockedRestart().blocker, liveDatabaseChanged: "unknown" as const } };
    await act(async () => { tree.update(<ReplacementRestoreGate snapshot={unknownRestart} performAction={performAction}><Child /></ReplacementRestoreGate>); });
    expect(hasText(tree, "could not be confirmed")).toBe(true);

    await act(async () => { tree.update(<ReplacementRestoreGate snapshot={blockedCommitted} performAction={performAction}><Child /></ReplacementRestoreGate>); });
    expect(hasText(tree, "Restore data was committed")).toBe(true);

    await act(async () => { tree.update(<ReplacementRestoreGate snapshot={blockedFailure("unknown")} performAction={performAction}><Child /></ReplacementRestoreGate>); });
    expect(hasText(tree, "could not be confirmed")).toBe(true);
    expect(hasText(tree, "Manual recovery is required")).toBe(true);
    await act(async () => { tree.unmount(); });
  });

  it("only exposes compatible allowed blocked actions with trusted payloads", async () => {
    let tree!: RenderedTree;
    await act(async () => { tree = render(blockedRestart(["discard_and_reload"])); });
    expect(button(tree, "Cancel scheduled restore")).toBeUndefined();
    expect(button(tree, "Discard failed restore safely")).toBeUndefined();

    await act(async () => { tree.update(<ReplacementRestoreGate snapshot={blockedRestart()} performAction={performAction}><Child /></ReplacementRestoreGate>); });
    await act(async () => { button(tree, "Cancel scheduled restore").props.onPress(); });
    expect(performAction).toHaveBeenCalledWith({ kind: "cancel_and_reload", restoreId: "restore-1" });

    await act(async () => { tree.update(<ReplacementRestoreGate snapshot={blockedFailure(false, "discard_and_reprepare")} performAction={performAction}><Child /></ReplacementRestoreGate>); });
    expect(button(tree, "Discard failed restore safely")).toBeUndefined();

    await act(async () => { tree.update(<ReplacementRestoreGate snapshot={blockedFailure(false, "discard_and_reprepare", "trusted-token")} performAction={performAction}><Child /></ReplacementRestoreGate>); });
    expect(button(tree, "Discard failed restore safely")).toBeUndefined();

    await act(async () => { tree.update(<ReplacementRestoreGate snapshot={blockedFailure(false, "discard_and_reprepare", "trusted-token", "rolled_back")} performAction={performAction}><Child /></ReplacementRestoreGate>); });
    await act(async () => { button(tree, "Discard failed restore safely").props.onPress(); });
    expect(performAction).toHaveBeenLastCalledWith({ kind: "discard_and_reload", restoreId: "restore-1", recoveryToken: "trusted-token" });
    await act(async () => { tree.unmount(); });
  });

  it("rejects unsafe inconsistent controls and stale same-restore recovery errors", async () => {
    const pending = deferred<void>();
    performAction.mockReturnValue(pending.promise);
    let tree!: RenderedTree;
    const uncertainRestart = { ...blockedRestart(), blocker: { ...blockedRestart().blocker, liveDatabaseChanged: "unknown" as const } };
    await act(async () => { tree = render(uncertainRestart); });
    expect(button(tree, "Cancel scheduled restore")).toBeUndefined();

    await act(async () => { tree.update(<ReplacementRestoreGate snapshot={blockedRestart()} performAction={performAction}><Child /></ReplacementRestoreGate>); });
    await act(async () => { button(tree, "Cancel scheduled restore").props.onPress(); });
    await act(async () => { tree.update(<ReplacementRestoreGate snapshot={blockedFailure("unknown")} performAction={performAction}><Child /></ReplacementRestoreGate>); });
    await act(async () => { pending.reject(new Error("stale restart failure")); });
    await flush();
    expect(hasText(tree, "requested recovery action could not be completed")).toBe(false);
    await act(async () => { tree.unmount(); });
  });

  it("does not construct actions from whitespace-only IDs or recovery tokens", async () => {
    let tree!: RenderedTree;
    const blankRestart = { ...blockedRestart(), blocker: { ...blockedRestart().blocker, restoreId: " " } };
    await act(async () => { tree = render(blankRestart); });
    expect(button(tree, "Cancel scheduled restore")).toBeUndefined();

    await act(async () => { tree.update(<ReplacementRestoreGate snapshot={blockedFailure(false, "discard_and_reprepare", " ", "rolled_back")} performAction={performAction}><Child /></ReplacementRestoreGate>); });
    expect(button(tree, "Discard failed restore safely")).toBeUndefined();

    const blankCommitted = { ...blockedCommitted, blocker: { ...blockedCommitted.blocker, restoreId: " " } };
    await act(async () => { tree.update(<ReplacementRestoreGate snapshot={blankCommitted} performAction={performAction}><Child /></ReplacementRestoreGate>); });
    expect(button(tree, "Retry restore completion")).toBeUndefined();

    await act(async () => { tree.update(<ReplacementRestoreGate snapshot={postcommit(" ")} performAction={performAction}><Child /></ReplacementRestoreGate>); });
    expect(button(tree, "Skip video scan")).toBeUndefined();
    expect(button(tree, "Scan gallery videos")).toBeUndefined();

    await act(async () => { tree.update(<ReplacementRestoreGate snapshot={restored(" ")} performAction={performAction}><Child /></ReplacementRestoreGate>); });
    expect(button(tree, "Continue")).toBeUndefined();
    expect(performAction).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it("releases the action lock when performAction throws synchronously", async () => {
    performAction.mockImplementation(() => { throw new Error("sync failure"); });
    let tree!: RenderedTree;
    await act(async () => { tree = render(postcommit()); });
    await act(async () => { button(tree, "Skip video scan").props.onPress(); });
    await flush();
    expect(hasText(tree, "requested recovery action could not be completed")).toBe(true);
    await act(async () => { button(tree, "Skip video scan").props.onPress(); });
    await flush();
    expect(performAction).toHaveBeenCalledTimes(2);
    await act(async () => { tree.unmount(); });
  });

  it("locks duplicate gallery actions across progress snapshots and ignores stale failures", async () => {
    const pending = deferred<void>();
    performAction.mockReturnValue(pending.promise);
    let tree!: RenderedTree;
    await act(async () => { tree = render(postcommit()); });
    await act(async () => {
      button(tree, "Scan gallery videos").props.onPress();
      button(tree, "Scan gallery videos").props.onPress();
    });
    expect(performAction).toHaveBeenCalledTimes(1);
    const action = performAction.mock.calls[0][0];
    expect(action).toEqual(expect.objectContaining({ kind: "complete_media", restoreId: "restore-1", signal: expect.any(Object) }));

    await act(async () => { tree.update(<ReplacementRestoreGate snapshot={{ ...postcommit(), progress: { phase: "reconciling_media", cancellable: true, completed: 1, total: 3 } }} performAction={performAction}><Child /></ReplacementRestoreGate>); });
    expect(button(tree, "Stop video scan")).toBeDefined();
    await act(async () => { tree.update(<ReplacementRestoreGate snapshot={restored()} performAction={performAction}><Child /></ReplacementRestoreGate>); });
    await act(async () => { pending.reject(new Error("stale")); });
    await flush();
    expect(hasText(tree, "requested recovery action could not be completed")).toBe(false);
    expect(mounts).toBe(0);
    await act(async () => { tree.unmount(); });
  });

  it("aborts only video matching and keeps the restored training data committed", async () => {
    const pending = deferred<void>();
    performAction.mockReturnValue(pending.promise);
    let tree!: RenderedTree;
    await act(async () => { tree = render(postcommit()); });
    await act(async () => { button(tree, "Scan gallery videos").props.onPress(); });
    const action = performAction.mock.calls[0][0];
    await act(async () => { button(tree, "Stop video scan").props.onPress(); });
    expect(action.signal.aborted).toBe(true);
    expect(hasText(tree, "Restored training data remains committed")).toBe(true);
    await act(async () => { pending.reject(Object.assign(new Error("aborted"), { name: "AbortError" })); });
    await flush();
    expect(button(tree, "Skip video scan")).toBeDefined();
    await act(async () => { tree.unmount(); });
  });

  it("acknowledges completion without locally opening the gate", async () => {
    let tree!: RenderedTree;
    await act(async () => { tree = render(restored()); });
    await act(async () => { button(tree, "Continue").props.onPress(); });
    expect(performAction).toHaveBeenCalledWith({ kind: "acknowledge_completion", restoreId: "restore-1" });
    expect(mounts).toBe(0);
    expect(hasText(tree, "Restore complete")).toBe(true);
    await act(async () => { tree.unmount(); });
  });
});
