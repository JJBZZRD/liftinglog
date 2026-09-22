import {
  getDatabaseStartupSnapshot,
  subscribeDatabaseStartup,
} from "../lib/db/replacementRestoreLifecycle";
import {
  guardRestTimerNavigationPath,
  isTimerLikeNavigationPath,
  SAFE_REST_TIMER_ROUTE,
} from "../lib/restTimerNavigationGuard";

function waitForStartupDecision(): Promise<ReturnType<typeof getDatabaseStartupSnapshot>> {
  const current = getDatabaseStartupSnapshot();
  if (current.phase !== "starting") return Promise.resolve(current);

  return new Promise((resolve) => {
    let unsubscribe: () => void = () => undefined;
    const settle = () => {
      const next = getDatabaseStartupSnapshot();
      if (next.phase === "starting") return;
      unsubscribe();
      resolve(next);
    };
    unsubscribe = subscribeDatabaseStartup(settle);
    settle();
  });
}

export async function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): Promise<string> {
  try {
    if (!isTimerLikeNavigationPath(path)) return path;

    let startup = getDatabaseStartupSnapshot();
    if (startup.phase === "starting" && initial) {
      startup = await waitForStartupDecision();
    }
    if (startup.phase !== "ready") return SAFE_REST_TIMER_ROUTE;
    return guardRestTimerNavigationPath(path);
  } catch {
    return isTimerLikeNavigationPath(path) ? SAFE_REST_TIMER_ROUTE : path;
  }
}
