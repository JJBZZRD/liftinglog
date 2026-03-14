jest.mock("../../lib/db/connection", () => ({
  db: {},
}));

jest.mock("../../lib/db/schema", () => ({
  programCalendar: {},
  programCalendarExercises: {},
  programCalendarSets: {},
  pslPrograms: {},
  sets: {},
}));

import {
  parseSessionCompletionOverrideExerciseIds,
  resolveSessionCompletionOverrideExerciseStatus,
} from "../../lib/db/programCalendar";

describe("program calendar session completion helpers", () => {
  it("parses and de-duplicates overridden exercise ids", () => {
    expect(
      parseSessionCompletionOverrideExerciseIds("[3, 3, 7, -1, 0, 2.5, 9]")
    ).toEqual([3, 7, 9]);
  });

  it("returns an empty list for invalid override payloads", () => {
    expect(parseSessionCompletionOverrideExerciseIds(null)).toEqual([]);
    expect(parseSessionCompletionOverrideExerciseIds("")).toEqual([]);
    expect(parseSessionCompletionOverrideExerciseIds("{ bad json")).toEqual([]);
    expect(parseSessionCompletionOverrideExerciseIds("{\"foo\":1}")).toEqual([]);
  });

  it("keeps an overridden exercise complete while the session override is active", () => {
    expect(
      resolveSessionCompletionOverrideExerciseStatus({
        calendarExerciseId: 12,
        computedStatus: "partial",
        sessionStatus: "complete",
        completionOverrideExerciseIdsJson: "[12, 13]",
      })
    ).toBe("complete");
  });

  it("falls back to the computed status when the exercise was not session-overridden", () => {
    expect(
      resolveSessionCompletionOverrideExerciseStatus({
        calendarExerciseId: 99,
        computedStatus: "partial",
        sessionStatus: "complete",
        completionOverrideExerciseIdsJson: "[12, 13]",
      })
    ).toBe("partial");
  });

  it("falls back to the computed status when the session is not force-complete", () => {
    expect(
      resolveSessionCompletionOverrideExerciseStatus({
        calendarExerciseId: 12,
        computedStatus: "partial",
        sessionStatus: "partial",
        completionOverrideExerciseIdsJson: "[12, 13]",
      })
    ).toBe("partial");
  });
});
