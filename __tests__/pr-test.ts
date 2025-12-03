import { brzycki, computeE1rm, epley, lombardi, mayhew, oconner, wathan } from "../lib/pr";

describe("PR formulas", () => {
  test("epley computes expected value", () => {
    expect(Math.round(epley(100, 5))).toBe(Math.round(100 * (1 + 5 / 30)));
  });

  test("brzycki computes expected value", () => {
    expect(Math.round(brzycki(100, 5))).toBe(Math.round(100 * (36 / (37 - 5))));
  });

  test("oconner computes expected value", () => {
    expect(Math.round(oconner(100, 5))).toBe(Math.round(100 * (1 + 0.025 * 5)));
  });

  test("lombardi returns monotonically increasing values by reps", () => {
    const a = lombardi(100, 3);
    const b = lombardi(100, 5);
    expect(b).toBeGreaterThan(a);
  });

  test("mayhew and wathan return positive values", () => {
    expect(mayhew(100, 8)).toBeGreaterThan(0);
    expect(wathan(100, 8)).toBeGreaterThan(0);
  });

  test("computeE1rm dispatcher works", () => {
    const v = computeE1rm("epley", 120, 3);
    expect(v).toBeCloseTo(epley(120, 3));
  });
});


