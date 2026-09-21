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
import { CALCULATORS } from "../../lib/calculators/catalog";

describe("calculator math", () => {
  it("keeps all five offline calculators catalogued with reachable routes", () => {
    expect(CALCULATORS).toHaveLength(5);
    expect(CALCULATORS.map((calculator) => calculator.id)).toEqual([
      "1rm-toolkit",
      "powerlifting-total",
      "power-score",
      "sinclair",
      "plate-loader",
    ]);
    expect(CALCULATORS.map((calculator) => calculator.href)).toEqual([
      "/calculators/1rm-toolkit",
      "/calculators/powerlifting-total",
      "/calculators/power-score",
      "/calculators/sinclair",
      "/calculators/plate-loader",
    ]);
  });

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

  it("rejects zero and non-finite inputs across calculator formulas", () => {
    expect(calculateE1rmToolkit(0, 5, "epley")).toBeNull();
    expect(calculateE1rmToolkit(Number.NaN, 5, "epley")).toBeNull();
    expect(calculatePowerliftingTotal(230, 0, 260)).toBeNull();
    expect(calculateDots("male", 0, 640)).toBeNull();
    expect(calculateGoodlift("male", 93, Number.POSITIVE_INFINITY)).toBeNull();
    expect(calculateWilks("male", 93, 0)).toBeNull();
    expect(calculateSinclair("male", 0, 145, 180)).toBeNull();
    expect(calculateSinclair("male", 89, Number.NaN, 180)).toBeNull();
    expect(calculatePlateLoadout(0, 20, "kg")).toBeNull();
    expect(calculatePlateLoadout(180, Number.POSITIVE_INFINITY, "kg")).toBeNull();
  });
});
