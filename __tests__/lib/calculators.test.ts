import { convertWeightInputValue } from "../../lib/calculators/input";
import { calculatePlateLoadout } from "../../lib/calculators/plate-loading";
import {
  calculateDots,
  calculateGoodlift,
  calculatePowerliftingTotal,
  calculateWilks,
} from "../../lib/calculators/powerlifting";
import { calculateE1rmToolkit } from "../../lib/calculators/strength";
import { calculateSinclair } from "../../lib/calculators/weightlifting";

describe("calculator math", () => {
  it("computes e1rm projections and percentage tables", () => {
    const result = calculateE1rmToolkit(100, 5, "epley");

    expect(result?.estimated1RMKg).toBeCloseTo(116.6667, 4);
    expect(result?.repMaxes.find((entry) => entry.targetReps === 10)?.projectedWeightKg).toBeCloseTo(
      87.5,
      4
    );
    expect(result?.percentages.find((entry) => entry.percentage === 85)?.weightKg).toBeCloseTo(
      99.1667,
      4
    );
  });

  it("computes full-power total and bodyweight-adjusted scores", () => {
    expect(calculatePowerliftingTotal(230, 150, 260)).toBe(640);
    expect(calculateDots("male", 93, 640)).toBeCloseTo(407.20075, 5);
    expect(calculateGoodlift("male", 93, 640)).toBeCloseTo(83.72553, 5);
    expect(calculateWilks("male", 93, 640)).toBeCloseTo(402.04166, 4);
  });

  it("computes sinclair totals and scores", () => {
    const result = calculateSinclair("male", 89, 145, 180);

    expect(result?.totalKg).toBe(325);
    expect(result?.coefficient).toBeCloseTo(1.2243105, 6);
    expect(result?.score).toBeCloseTo(397.90092, 4);
  });

  it("builds exact and remainder plate loadouts", () => {
    const exact = calculatePlateLoadout(180, 20, "kg");
    const withRemainder = calculatePlateLoadout(201, 45, "lb");

    expect(exact).toMatchObject({
      achievableTotal: 180,
      remainderTotal: 0,
      perSide: [
        { plateWeight: 25, count: 3 },
        { plateWeight: 5, count: 1 },
      ],
    });

    expect(withRemainder).toMatchObject({
      achievableTotal: 200,
      remainderPerSide: 0.5,
      remainderTotal: 1,
      perSide: [
        { plateWeight: 45, count: 1 },
        { plateWeight: 25, count: 1 },
        { plateWeight: 5, count: 1 },
        { plateWeight: 2.5, count: 1 },
      ],
    });
  });

  it("converts editable weight inputs cleanly across units", () => {
    expect(convertWeightInputValue("100", "kg", "lb")).toBe("220.46");
    expect(convertWeightInputValue("220.46", "lb", "kg")).toBe("100");
  });
});
