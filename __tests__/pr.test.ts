/**
 * Unit tests for E1RM (Estimated 1 Rep Max) formula calculations
 * These tests verify the accuracy of all 6 supported formulas
 */
import {
  epley,
  brzycki,
  oconner,
  lombardi,
  mayhew,
  wathan,
  computeE1rm,
  formulaComputeMap,
} from '../lib/pr';

describe('E1RM Formulas', () => {
  describe('epley', () => {
    it('calculates 100kg x 10 reps correctly', () => {
      // Epley: weight * (1 + reps/30) = 100 * (1 + 10/30) = 100 * 1.333 = 133.33
      expect(epley(100, 10)).toBeCloseTo(133.33, 1);
    });

    it('calculates 1 rep (returns same weight)', () => {
      // 1 rep should give approximately the same weight (weight * 1.033)
      expect(epley(100, 1)).toBeCloseTo(103.33, 1);
    });

    it('calculates 5 reps correctly', () => {
      // 100 * (1 + 5/30) = 100 * 1.167 = 116.67
      expect(epley(100, 5)).toBeCloseTo(116.67, 1);
    });

    it('handles decimal weights', () => {
      expect(epley(102.5, 8)).toBeCloseTo(129.83, 1);
    });
  });

  describe('brzycki', () => {
    it('calculates 100kg x 10 reps correctly', () => {
      // Brzycki: weight * (36 / (37 - reps)) = 100 * (36/27) = 133.33
      expect(brzycki(100, 10)).toBeCloseTo(133.33, 1);
    });

    it('calculates 5 reps correctly', () => {
      // 100 * (36 / 32) = 112.5
      expect(brzycki(100, 5)).toBeCloseTo(112.5, 1);
    });

    it('handles high rep ranges', () => {
      // With reps approaching 37, result gets very high
      expect(brzycki(100, 30)).toBeCloseTo(514.29, 1);
    });
  });

  describe('oconner', () => {
    it('calculates 100kg x 10 reps correctly', () => {
      // O'Conner: weight * (1 + 0.025 * reps) = 100 * (1 + 0.25) = 125
      expect(oconner(100, 10)).toBe(125);
    });

    it('calculates 5 reps correctly', () => {
      // 100 * (1 + 0.125) = 112.5
      expect(oconner(100, 5)).toBe(112.5);
    });
  });

  describe('lombardi', () => {
    it('calculates 100kg x 10 reps correctly', () => {
      // Lombardi: weight * reps^0.1 = 100 * 10^0.1 = 100 * 1.2589 = 125.89
      expect(lombardi(100, 10)).toBeCloseTo(125.89, 1);
    });

    it('calculates 5 reps correctly', () => {
      // 100 * 5^0.1 = 100 * 1.1746 = 117.46
      expect(lombardi(100, 5)).toBeCloseTo(117.46, 1);
    });

    it('calculates 1 rep (returns same weight)', () => {
      // 100 * 1^0.1 = 100
      expect(lombardi(100, 1)).toBe(100);
    });
  });

  describe('mayhew', () => {
    it('calculates 100kg x 10 reps correctly', () => {
      // Mayhew: (100 * weight) / (52.2 + 41.9 * e^(-0.055 * reps))
      const expected = (100 * 100) / (52.2 + 41.9 * Math.exp(-0.055 * 10));
      expect(mayhew(100, 10)).toBeCloseTo(expected, 1);
    });

    it('calculates 5 reps correctly', () => {
      const expected = (100 * 100) / (52.2 + 41.9 * Math.exp(-0.055 * 5));
      expect(mayhew(100, 5)).toBeCloseTo(expected, 1);
    });
  });

  describe('wathan', () => {
    it('calculates 100kg x 10 reps correctly', () => {
      // Wathan: (100 * weight) / (48.8 + 53.8 * e^(-0.075 * reps))
      const expected = (100 * 100) / (48.8 + 53.8 * Math.exp(-0.075 * 10));
      expect(wathan(100, 10)).toBeCloseTo(expected, 1);
    });

    it('calculates 5 reps correctly', () => {
      const expected = (100 * 100) / (48.8 + 53.8 * Math.exp(-0.075 * 5));
      expect(wathan(100, 5)).toBeCloseTo(expected, 1);
    });
  });
});

describe('computeE1rm', () => {
  it('selects epley formula correctly', () => {
    expect(computeE1rm('epley', 100, 10)).toBeCloseTo(epley(100, 10), 5);
  });

  it('selects brzycki formula correctly', () => {
    expect(computeE1rm('brzycki', 100, 10)).toBeCloseTo(brzycki(100, 10), 5);
  });

  it('selects oconner formula correctly', () => {
    expect(computeE1rm('oconner', 100, 10)).toBeCloseTo(oconner(100, 10), 5);
  });

  it('selects lombardi formula correctly', () => {
    expect(computeE1rm('lombardi', 100, 10)).toBeCloseTo(lombardi(100, 10), 5);
  });

  it('selects mayhew formula correctly', () => {
    expect(computeE1rm('mayhew', 100, 10)).toBeCloseTo(mayhew(100, 10), 5);
  });

  it('selects wathan formula correctly', () => {
    expect(computeE1rm('wathan', 100, 10)).toBeCloseTo(wathan(100, 10), 5);
  });

  it('defaults to epley for unknown formula', () => {
    // @ts-expect-error - Testing invalid formula handling
    expect(computeE1rm('invalid', 100, 10)).toBeCloseTo(epley(100, 10), 5);
  });
});

describe('formulaComputeMap', () => {
  it('contains all 6 formulas', () => {
    expect(Object.keys(formulaComputeMap)).toHaveLength(6);
    expect(formulaComputeMap).toHaveProperty('epley');
    expect(formulaComputeMap).toHaveProperty('brzycki');
    expect(formulaComputeMap).toHaveProperty('oconner');
    expect(formulaComputeMap).toHaveProperty('lombardi');
    expect(formulaComputeMap).toHaveProperty('mayhew');
    expect(formulaComputeMap).toHaveProperty('wathan');
  });

  it('all map entries are functions', () => {
    Object.values(formulaComputeMap).forEach((fn) => {
      expect(typeof fn).toBe('function');
    });
  });
});

describe('Edge Cases', () => {
  it('handles zero reps gracefully', () => {
    // Zero reps should not crash, even if result is mathematically undefined
    expect(() => epley(100, 0)).not.toThrow();
    expect(() => brzycki(100, 0)).not.toThrow();
    expect(() => oconner(100, 0)).not.toThrow();
    expect(() => lombardi(100, 0)).not.toThrow();
    expect(() => mayhew(100, 0)).not.toThrow();
    expect(() => wathan(100, 0)).not.toThrow();
  });

  it('handles zero weight', () => {
    expect(epley(0, 10)).toBe(0);
    expect(brzycki(0, 10)).toBe(0);
    expect(oconner(0, 10)).toBe(0);
    expect(lombardi(0, 10)).toBe(0);
    expect(mayhew(0, 10)).toBe(0);
    expect(wathan(0, 10)).toBe(0);
  });

  it('handles very high weights', () => {
    expect(epley(500, 5)).toBeCloseTo(583.33, 1);
    expect(brzycki(500, 5)).toBeCloseTo(562.5, 1);
  });

  it('handles very high reps', () => {
    // High rep calculations should still work
    expect(epley(50, 30)).toBeCloseTo(100, 1);
    expect(oconner(50, 30)).toBe(87.5);
  });
});


