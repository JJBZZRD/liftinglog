import type { E1RMFormulaId } from '@/lib/db';
import { E1RM_FORMULA_LABELS } from '@/lib/pb';

export type FormulaOption = { id: E1RMFormulaId; label: string; equation: string };

/** Each equation matches its implementation in `lib/pb.ts` (w = weight, r = reps). */
export const FORMULA_OPTIONS: FormulaOption[] = [
  { id: 'epley', label: E1RM_FORMULA_LABELS.epley, equation: 'w × (1 + r/30)' },
  { id: 'brzycki', label: E1RM_FORMULA_LABELS.brzycki, equation: 'w × 36 / (37 − r)' },
  { id: 'oconner', label: E1RM_FORMULA_LABELS.oconner, equation: 'w × (1 + r/40)' },
  { id: 'lombardi', label: E1RM_FORMULA_LABELS.lombardi, equation: 'w × r^0.10' },
  { id: 'mayhew', label: E1RM_FORMULA_LABELS.mayhew, equation: '100w / (52.2 + 41.9e^−0.055r)' },
  { id: 'wathan', label: E1RM_FORMULA_LABELS.wathan, equation: '100w / (48.8 + 53.8e^−0.075r)' },
];
