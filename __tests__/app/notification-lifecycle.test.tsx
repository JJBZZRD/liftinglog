/* eslint-disable @typescript-eslint/no-require-imports */
import React from "react";
import renderer, { act } from "react-test-renderer";

const mockPush = jest.fn();
const mockReplace = jest.fn();
let responseListener: ((response: any) => void) | undefined;
let resolveLastResponse: ((response: any) => void) | undefined;
const mockRemove = jest.fn();
const mockGetLastNotificationResponseAsync = jest.fn(
  () =>
    new Promise((resolve) => {
      resolveLastResponse = resolve;
    })
);

jest.mock("expo-router", () => ({
  router: { push: mockPush, replace: mockReplace },
  usePathname: () => "/(tabs)/history",
}));

jest.mock("expo-notifications", () => ({
  addNotificationResponseReceivedListener: jest.fn((listener) => {
    responseListener = listener;
    return { remove: mockRemove };
  }),
  getLastNotificationResponseAsync: mockGetLastNotificationResponseAsync,
}));

const { useNotificationHandler } = require("../../lib/notificationHandler") as typeof import("../../lib/notificationHandler");

function TestNotificationHandler() {
  useNotificationHandler();
  return null;
}

const responseFor = (id: string) => ({
  notification: {
    request: {
      identifier: id,
      content: { data: { timerId: `timer-${id}`, exerciseId: 42, exerciseName: "Bench Press" } },
    },
  },
});

describe("notification navigation lifecycle", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    responseListener = undefined;
    resolveLastResponse = undefined;
  });

  afterEach(() => jest.useRealTimers());

  it("clears delayed listener navigation on unmount", async () => {
    let tree: ReturnType<typeof renderer.create>;
    await act(async () => {
      tree = renderer.create(<TestNotificationHandler />);
    });

    await act(async () => {
      responseListener?.(responseFor("foreground"));
    });

    await act(async () => {
      tree!.unmount();
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it("invalidates a pending cold-start response and its delayed navigation on unmount", async () => {
    let tree: ReturnType<typeof renderer.create>;
    await act(async () => {
      tree = renderer.create(<TestNotificationHandler />);
    });

    await act(async () => {
      (resolveLastResponse as (response: any) => void)(responseFor("cold-start"));
      await Promise.resolve();
    });

    await act(async () => {
      tree!.unmount();
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("handles a rejected cold-start response promise", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    mockGetLastNotificationResponseAsync.mockRejectedValueOnce(new Error("response unavailable"));
    let tree: ReturnType<typeof renderer.create>;

    await act(async () => {
      tree = renderer.create(<TestNotificationHandler />);
      await Promise.resolve();
    });

    expect(log).toHaveBeenCalledWith("Unable to read notification response:", expect.any(Error));
    await act(async () => {
      tree!.unmount();
    });
    log.mockRestore();
  });
});
