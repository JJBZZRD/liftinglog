const mockState: {
  inserted: Record<string, unknown> | null;
  updated: Record<string, unknown> | null;
} = {
  inserted: null,
  updated: null,
};

jest.mock("../../lib/db/connection", () => ({
  db: {
    insert: jest.fn(() => ({
      values: jest.fn((data: Record<string, unknown>) => ({
        run: jest.fn(async () => {
          mockState.inserted = data;
          return { lastInsertRowId: 7 };
        }),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn((data: Record<string, unknown>) => {
        mockState.updated = data;
        return {
          where: jest.fn(() => ({
            run: jest.fn(async () => undefined),
          })),
        };
      }),
    })),
    select: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("../../lib/db/schema", () => ({
  userCheckins: {
    id: "id",
  },
}));

jest.mock("../../lib/utils/uid", () => ({
  newUid: jest.fn(() => "test-uid"),
}));

jest.mock("drizzle-orm", () => ({
  desc: jest.fn(),
  eq: jest.fn(),
  and: jest.fn(),
  gte: jest.fn(),
  isNotNull: jest.fn(),
  lte: jest.fn(),
}));

import { createUserCheckin, updateUserCheckin } from "../../lib/db/userCheckins";

describe("lib/db/userCheckins", () => {
  beforeEach(() => {
    mockState.inserted = null;
    mockState.updated = null;
  });

  it("writes fatigue_score through createUserCheckin", async () => {
    const id = await createUserCheckin({
      recorded_at: 123,
      fatigue_score: 4,
      source: "manual",
    });

    expect(id).toBe(7);
    expect(mockState.inserted).toMatchObject({
      recordedAt: 123,
      fatigueScore: 4,
      source: "manual",
    });
    expect(mockState.inserted).not.toHaveProperty("readinessScore");
  });

  it("updates fatigue_score through updateUserCheckin", async () => {
    await updateUserCheckin(5, { fatigue_score: 2 });

    expect(mockState.updated).toEqual({
      fatigueScore: 2,
    });
  });
});

