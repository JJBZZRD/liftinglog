import React from "react";
import renderer, { act } from "react-test-renderer";

import ReplacementRestoreDialog from "../../components/settings/ReplacementRestoreDialog";

type RenderedTree = ReturnType<typeof renderer.create>;
type TestNode = { type: unknown; props: Record<string, any> };

jest.mock("react-native", () => ({ Pressable: "Pressable", Text: "Text", View: "View" }));
jest.mock("../../components/modals/BaseModal", () => ({ BaseModal: "BaseModal" }));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
};

const ready = (token = "prepared-token") => ({
  status: "ready" as const,
  token,
  sourceDisplayName: "my-backup.db",
  candidateSha256: "hash",
  rowsByTable: { exercises: 3, workouts: 2, workout_exercises: 4, sets: 9 } as any,
  pbEventsInSource: 0,
  mediaRows: 1,
});

const cancelled = { status: "cancelled" as const, liveDatabaseChanged: false as const };
const scheduled = { status: "restart_required" as const, restoreId: "restore-id", liveDatabaseChanged: false as const, restartRequired: true as const };

const flush = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

const button = (tree: RenderedTree, label: string) => tree.root.findAll((node: TestNode) => node.type === "Pressable" && node.props.accessibilityLabel === label)[0];
const textContent = (children: unknown): string => Array.isArray(children)
  ? children.map(textContent).join("")
  : React.isValidElement(children)
    ? textContent((children as React.ReactElement<{ children?: unknown }>).props.children)
    : String(children ?? "");
const hasText = (tree: RenderedTree, value: string) => tree.root.findAll((node: TestNode) => node.type === "Text" && textContent(node.props.children).includes(value)).length > 0;

describe("ReplacementRestoreDialog", () => {
  let prepare: jest.Mock;
  let discard: jest.Mock;
  let schedule: jest.Mock;
  let availability: jest.Mock;
  let dismiss: jest.Mock;

  const render = (visible = true) => renderer.create(
    <ReplacementRestoreDialog
      visible={visible}
      onDismiss={dismiss}
      service={{ prepareReplacementRestore: prepare, discardPreparedRestore: discard }}
      lifecycle={{ scheduleReplacementRestoreAndBlock: schedule, getReplacementRestoreAvailability: availability }}
    />
  );

  beforeEach(() => {
    prepare = jest.fn().mockResolvedValue(cancelled);
    discard = jest.fn().mockResolvedValue(undefined);
    schedule = jest.fn().mockResolvedValue(cancelled);
    availability = jest.fn().mockReturnValue({ available: true });
    dismiss = jest.fn();
  });

  it("visibly disables choosing a backup when restore is unavailable", async () => {
    availability.mockReturnValue({ available: false, reason: "unsupported_platform" });
    let tree!: RenderedTree;
    await act(async () => { tree = render(); });
    expect(button(tree, "Choose backup for replacement restore").props.disabled).toBe(true);
    expect(hasText(tree, "not available on this platform")).toBe(true);
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    expect(prepare).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it("prepares a picker-selected backup, shows the useful summary, and synchronously prevents double scheduling", async () => {
    const pendingPrepare = deferred<ReturnType<typeof ready> | typeof cancelled>();
    const pendingSchedule = deferred<typeof scheduled | typeof cancelled>();
    prepare.mockReturnValue(pendingPrepare.promise);
    schedule.mockReturnValue(pendingSchedule.promise);
    let tree!: RenderedTree;
    await act(async () => { tree = render(); });
    await act(async () => {
      button(tree, "Choose backup for replacement restore").props.onPress();
      button(tree, "Choose backup for replacement restore").props.onPress();
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ signal: expect.any(Object), onProgress: expect.any(Function) }));
    await act(async () => { pendingPrepare.resolve(ready()); });
    await flush();
    expect(hasText(tree, "Exercises: 3")).toBe(true);
    expect(hasText(tree, "Workouts: 2")).toBe(true);
    expect(hasText(tree, "Sets: 9")).toBe(true);
    expect(hasText(tree, "Video attachments: 1")).toBe(true);
    expect(hasText(tree, "Timers and app notifications will be cleared")).toBe(true);
    await act(async () => {
      button(tree, "Schedule replacement restore").props.onPress();
      button(tree, "Schedule replacement restore").props.onPress();
    });
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(expect.objectContaining({ token: "prepared-token", signal: expect.any(Object), onProgress: expect.any(Function) }));
    await act(async () => { pendingSchedule.resolve(scheduled); });
    await flush();
    expect(hasText(tree, "Restore is scheduled")).toBe(true);
    expect(discard).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it("treats picker cancellation and preparation abort as quiet cancellation", async () => {
    let pickerSignal!: AbortSignal;
    const pending = deferred<typeof cancelled>();
    prepare.mockImplementation(({ signal }) => { pickerSignal = signal; return pending.promise; });
    let tree!: RenderedTree;
    await act(async () => { tree = render(); });
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    await act(async () => { button(tree, "Cancel backup preparation").props.onPress(); });
    expect(pickerSignal.aborted).toBe(true);
    await act(async () => { pending.resolve(cancelled); });
    await flush();
    expect(hasText(tree, "could not be prepared")).toBe(false);
    expect(button(tree, "Choose backup for replacement restore")).toBeDefined();
    await act(async () => { tree.unmount(); });
  });

  it("discards a ready token on external close and ignores late preparation callbacks", async () => {
    const pending = deferred<ReturnType<typeof ready>>();
    let callback!: (progress: any) => void;
    prepare.mockImplementation(({ onProgress }) => { callback = onProgress; return pending.promise; });
    let tree!: RenderedTree;
    await act(async () => { tree = render(); });
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    await act(async () => { tree.update(
      <ReplacementRestoreDialog visible={false} onDismiss={dismiss} service={{ prepareReplacementRestore: prepare, discardPreparedRestore: discard }} lifecycle={{ scheduleReplacementRestoreAndBlock: schedule, getReplacementRestoreAvailability: availability }} />
    ); });
    callback({ phase: "validating_candidate", cancellable: true, completed: 1, total: 2 });
    await act(async () => { pending.resolve(ready()); });
    await flush();
    expect(discard).toHaveBeenCalledWith("prepared-token");
    expect(hasText(tree, "Validating backup")).toBe(false);
    await act(async () => { tree.unmount(); });

    prepare.mockResolvedValueOnce(ready("external-close-token"));
    await act(async () => { tree = render(); });
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    await flush();
    await act(async () => { tree.update(
      <ReplacementRestoreDialog visible={false} onDismiss={dismiss} service={{ prepareReplacementRestore: prepare, discardPreparedRestore: discard }} lifecycle={{ scheduleReplacementRestoreAndBlock: schedule, getReplacementRestoreAvailability: availability }} />
    ); });
    expect(discard).toHaveBeenCalledWith("external-close-token");
    await act(async () => { tree.unmount(); });

    prepare.mockResolvedValueOnce(ready("unmount-token"));
    await act(async () => { tree = render(); });
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    await flush();
    await act(async () => { tree.unmount(); });
    expect(discard).toHaveBeenCalledWith("unmount-token");
  });

  it("keeps prepared-token ownership visible and retryable when discard fails", async () => {
    prepare.mockResolvedValue(ready());
    const cleanup = deferred<void>();
    discard.mockReturnValueOnce(cleanup.promise).mockResolvedValueOnce(undefined);
    let tree!: RenderedTree;
    await act(async () => { tree = render(); });
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    await flush();
    await act(async () => { tree.root.findByType("BaseModal").props.onClose(); });
    await act(async () => { cleanup.reject(new Error("cleanup failed")); });
    await flush();
    expect(discard).toHaveBeenCalledWith("prepared-token");
    expect(dismiss).not.toHaveBeenCalled();
    expect(button(tree, "Retry prepared backup cleanup")).toBeDefined();
    expect(button(tree, "Choose backup for replacement restore")).toBeUndefined();
    expect(button(tree, "Schedule replacement restore")).toBeUndefined();
    await act(async () => { button(tree, "Retry prepared backup cleanup").props.onPress(); });
    await flush();
    expect(dismiss).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });
  });

  it("reports a schedule abort before publication as cancellation and does not discard the consumed token", async () => {
    prepare.mockResolvedValue(ready());
    let scheduleSignal!: AbortSignal;
    const pending = deferred<typeof cancelled>();
    schedule.mockImplementation(({ signal }) => { scheduleSignal = signal; return pending.promise; });
    let tree!: RenderedTree;
    await act(async () => { tree = render(); });
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    await flush();
    await act(async () => { button(tree, "Schedule replacement restore").props.onPress(); });
    await act(async () => { button(tree, "Cancel restore scheduling").props.onPress(); });
    expect(scheduleSignal.aborted).toBe(true);
    await act(async () => { pending.resolve(cancelled); });
    await flush();
    expect(button(tree, "Choose backup for replacement restore")).toBeDefined();
    expect(discard).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it("keeps restart-required state after an abort observed after publication", async () => {
    prepare.mockResolvedValue(ready());
    const pending = deferred<typeof scheduled>();
    schedule.mockReturnValue(pending.promise);
    let tree!: RenderedTree;
    await act(async () => { tree = render(); });
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    await flush();
    await act(async () => { button(tree, "Schedule replacement restore").props.onPress(); });
    await act(async () => { button(tree, "Cancel restore scheduling").props.onPress(); });
    await act(async () => { pending.resolve(scheduled); });
    await flush();
    expect(hasText(tree, "Restore is scheduled")).toBe(true);
    expect(discard).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it("returns an explicitly safe typed scheduling failure to choosing another backup", async () => {
    prepare.mockResolvedValue(ready());
    schedule.mockRejectedValue({ code: "candidate_changed", stage: "scheduling", liveDatabaseChanged: false, transactionState: "not_started", recovery: "discard_and_reprepare" });
    let tree!: RenderedTree;
    await act(async () => { tree = render(); });
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    await flush();
    await act(async () => { button(tree, "Schedule replacement restore").props.onPress(); });
    await flush();
    expect(button(tree, "Choose backup for replacement restore")).toBeDefined();
    expect(hasText(tree, "Timers and app notifications remain stopped")).toBe(true);
    expect(hasText(tree, "Restore is scheduled")).toBe(false);
    await act(async () => { tree.unmount(); });
  });

  it("treats an unknown typed scheduling failure as a blocked restart state without an unchanged claim", async () => {
    prepare.mockResolvedValue(ready());
    schedule.mockRejectedValue({ code: "rollback_failed", stage: "scheduling", liveDatabaseChanged: "unknown", transactionState: "unknown", recovery: "manual_recovery" });
    let tree!: RenderedTree;
    await act(async () => { tree = render(); });
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    await flush();
    await act(async () => { button(tree, "Schedule replacement restore").props.onPress(); });
    await flush();
    expect(hasText(tree, "could not be confirmed")).toBe(true);
    expect(hasText(tree, "Restore is scheduled")).toBe(false);
    expect(hasText(tree, "Do not use the app")).toBe(true);
    expect(hasText(tree, "current app data was not changed")).toBe(false);
    expect(discard).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it("recovers to choosing after hide/show while a held preparation later cancels", async () => {
    const pending = deferred<typeof cancelled>();
    prepare.mockReturnValue(pending.promise);
    let tree!: RenderedTree;
    await act(async () => { tree = render(); });
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    await act(async () => { tree.update(
      <ReplacementRestoreDialog visible={false} onDismiss={dismiss} service={{ prepareReplacementRestore: prepare, discardPreparedRestore: discard }} lifecycle={{ scheduleReplacementRestoreAndBlock: schedule, getReplacementRestoreAvailability: availability }} />
    ); });
    await act(async () => { tree.update(
      <ReplacementRestoreDialog visible onDismiss={dismiss} service={{ prepareReplacementRestore: prepare, discardPreparedRestore: discard }} lifecycle={{ scheduleReplacementRestoreAndBlock: schedule, getReplacementRestoreAvailability: availability }} />
    ); });
    await act(async () => { pending.resolve(cancelled); });
    await flush();
    expect(button(tree, "Choose backup for replacement restore").props.disabled).toBe(false);
    await act(async () => { tree.unmount(); });
  });

  it("retains a late hidden ready token for cleanup retry when discard fails", async () => {
    const pendingPreparation = deferred<ReturnType<typeof ready>>();
    const pendingCleanup = deferred<void>();
    prepare.mockReturnValue(pendingPreparation.promise);
    discard.mockReturnValue(pendingCleanup.promise);
    let tree!: RenderedTree;
    await act(async () => { tree = render(); });
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    await act(async () => { tree.update(
      <ReplacementRestoreDialog visible={false} onDismiss={dismiss} service={{ prepareReplacementRestore: prepare, discardPreparedRestore: discard }} lifecycle={{ scheduleReplacementRestoreAndBlock: schedule, getReplacementRestoreAvailability: availability }} />
    ); });
    await act(async () => { pendingPreparation.resolve(ready("late-token")); });
    await flush();
    await act(async () => { pendingCleanup.reject(new Error("cleanup failed")); });
    await flush();
    await act(async () => { tree.update(
      <ReplacementRestoreDialog visible onDismiss={dismiss} service={{ prepareReplacementRestore: prepare, discardPreparedRestore: discard }} lifecycle={{ scheduleReplacementRestoreAndBlock: schedule, getReplacementRestoreAvailability: availability }} />
    ); });
    expect(discard).toHaveBeenCalledWith("late-token");
    expect(button(tree, "Retry prepared backup cleanup")).toBeDefined();
    expect(button(tree, "Choose backup for replacement restore")).toBeUndefined();
    await act(async () => { tree.unmount(); });
  });

  it("keeps a hidden scheduling rejection blocked when the dialog is shown again", async () => {
    prepare.mockResolvedValue(ready());
    const pendingSchedule = deferred<never>();
    schedule.mockReturnValue(pendingSchedule.promise);
    let tree!: RenderedTree;
    await act(async () => { tree = render(); });
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    await flush();
    await act(async () => { button(tree, "Schedule replacement restore").props.onPress(); });
    await act(async () => { tree.update(
      <ReplacementRestoreDialog visible={false} onDismiss={dismiss} service={{ prepareReplacementRestore: prepare, discardPreparedRestore: discard }} lifecycle={{ scheduleReplacementRestoreAndBlock: schedule, getReplacementRestoreAvailability: availability }} />
    ); });
    await act(async () => { pendingSchedule.reject({ code: "rollback_failed", stage: "scheduling", liveDatabaseChanged: "unknown", transactionState: "unknown", recovery: "manual_recovery" }); });
    await flush();
    await act(async () => { tree.update(
      <ReplacementRestoreDialog visible onDismiss={dismiss} service={{ prepareReplacementRestore: prepare, discardPreparedRestore: discard }} lifecycle={{ scheduleReplacementRestoreAndBlock: schedule, getReplacementRestoreAvailability: availability }} />
    ); });
    expect(hasText(tree, "Do not use the app")).toBe(true);
    expect(discard).not.toHaveBeenCalled();
    await act(async () => { tree.unmount(); });
  });

  it("does not abort preparation when equivalent service and dismissal props receive new object identities", async () => {
    const pending = deferred<ReturnType<typeof ready>>();
    let signal!: AbortSignal;
    prepare.mockImplementation(({ signal: nextSignal }) => {
      signal = nextSignal;
      return pending.promise;
    });
    let tree!: RenderedTree;
    await act(async () => { tree = render(); });
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    await act(async () => { tree.update(
      <ReplacementRestoreDialog visible onDismiss={() => dismiss()} service={{ prepareReplacementRestore: prepare, discardPreparedRestore: discard }} lifecycle={{ scheduleReplacementRestoreAndBlock: schedule, getReplacementRestoreAvailability: availability }} />
    ); });
    expect(signal.aborted).toBe(false);
    await act(async () => { pending.resolve(ready()); });
    await flush();
    expect(hasText(tree, "Ready to replace app data")).toBe(true);
    await act(async () => { tree.unmount(); });
  });

  it("retains failed cleanup ownership across real unmount and remount until a deliberate retry succeeds", async () => {
    const firstCleanup = deferred<void>();
    prepare.mockResolvedValue(ready("remount-token"));
    discard.mockReturnValueOnce(firstCleanup.promise).mockResolvedValueOnce(undefined);
    let tree!: RenderedTree;
    await act(async () => { tree = render(); });
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    await flush();
    await act(async () => { tree.unmount(); });
    expect(discard).toHaveBeenCalledWith("remount-token");
    await act(async () => { firstCleanup.reject(new Error("cleanup failed")); });
    await flush();

    await act(async () => { tree = render(); });
    await flush();
    expect(button(tree, "Retry prepared backup cleanup")).toBeDefined();
    expect(button(tree, "Choose backup for replacement restore")).toBeUndefined();
    await act(async () => { button(tree, "Retry prepared backup cleanup").props.onPress(); });
    await flush();
    expect(button(tree, "Choose backup for replacement restore")).toBeDefined();
    await act(async () => { tree.unmount(); });
  });

  it("blocks an uncertain preparation failure and ignores a stale aborted preparation rejection", async () => {
    prepare.mockRejectedValueOnce({ code: "rollback_failed", stage: "validating_candidate", liveDatabaseChanged: "unknown", transactionState: "unknown", recovery: "manual_recovery" });
    let tree!: RenderedTree;
    await act(async () => { tree = render(); });
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    await flush();
    expect(hasText(tree, "Do not use the app")).toBe(true);
    expect(button(tree, "Choose backup for replacement restore")).toBeUndefined();
    await act(async () => { tree.unmount(); });

    const staleFailure = deferred<never>();
    prepare.mockReturnValueOnce(staleFailure.promise);
    await act(async () => { tree = render(); });
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    await act(async () => { tree.update(
      <ReplacementRestoreDialog visible={false} onDismiss={dismiss} service={{ prepareReplacementRestore: prepare, discardPreparedRestore: discard }} lifecycle={{ scheduleReplacementRestoreAndBlock: schedule, getReplacementRestoreAvailability: availability }} />
    ); });
    await act(async () => { staleFailure.reject(new Error("aborted picker")); });
    await flush();
    await act(async () => { tree.update(
      <ReplacementRestoreDialog visible onDismiss={dismiss} service={{ prepareReplacementRestore: prepare, discardPreparedRestore: discard }} lifecycle={{ scheduleReplacementRestoreAndBlock: schedule, getReplacementRestoreAvailability: availability }} />
    ); });
    expect(hasText(tree, "could not be prepared")).toBe(false);
    expect(button(tree, "Choose backup for replacement restore").props.disabled).toBe(false);
    await act(async () => { tree.unmount(); });
  });

  it("returns to choosing when the active preparation rejects with AbortError after cancellation", async () => {
    const pending = deferred<never>();
    let signal!: AbortSignal;
    prepare.mockImplementation(({ signal: nextSignal }) => {
      signal = nextSignal;
      return pending.promise;
    });
    let tree!: RenderedTree;
    await act(async () => { tree = render(); });
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    await act(async () => { button(tree, "Cancel backup preparation").props.onPress(); });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      pending.reject(Object.assign(new Error("picker aborted"), { name: "AbortError" }));
    });
    await flush();
    expect(button(tree, "Choose backup for replacement restore").props.disabled).toBe(false);
    expect(hasText(tree, "could not be prepared")).toBe(false);
    await act(async () => { tree.unmount(); });
  });

  it("keeps remounted choosing blocked until an unmounted preparation and its failed cleanup are resolved", async () => {
    const pendingPreparation = deferred<ReturnType<typeof ready>>();
    const pendingCleanup = deferred<void>();
    prepare.mockReturnValue(pendingPreparation.promise);
    discard.mockReturnValueOnce(pendingCleanup.promise).mockResolvedValueOnce(undefined);
    let tree!: RenderedTree;
    await act(async () => { tree = render(); });
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    expect(prepare).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });

    await act(async () => { tree = render(); });
    expect(button(tree, "Choose backup for replacement restore").props.disabled).toBe(true);
    await act(async () => { button(tree, "Choose backup for replacement restore").props.onPress(); });
    expect(prepare).toHaveBeenCalledTimes(1);
    await act(async () => { tree.unmount(); });

    await act(async () => { tree = render(); });
    await act(async () => { pendingPreparation.resolve(ready("old-preparation-token")); });
    await flush();
    expect(discard).toHaveBeenCalledWith("old-preparation-token");
    expect(button(tree, "Choose backup for replacement restore")).toBeUndefined();
    await act(async () => { pendingCleanup.reject(new Error("cleanup failed")); });
    await flush();
    expect(button(tree, "Retry prepared backup cleanup")).toBeDefined();
    await act(async () => { button(tree, "Retry prepared backup cleanup").props.onPress(); });
    await flush();
    expect(button(tree, "Choose backup for replacement restore").props.disabled).toBe(false);
    await act(async () => { tree.unmount(); });
  });
});
