/**
 * Prescription model for program_exercises.prescription_json
 *
 * Defines the ProgramPrescriptionV1 type and a lenient parser.
 */

export type WarmupBlock = {
  kind: "warmup";
  style: "ramp" | "fixed";
  sets: number;
  reps?: number;
  fromPercent?: number;
  toPercent?: number;
};

export type RepSpec =
  | { type: "fixed"; value: number }
  | { type: "range"; min: number; max: number };

export type TargetSpec =
  | { type: "fixed_weight_kg"; value: number }
  | { type: "percent_e1rm"; value: number }
  | { type: "rpe"; value: number }
  | { type: "rir"; value: number };

export type WorkBlock = {
  kind: "work";
  sets: number;
  reps: RepSpec;
  target?: TargetSpec;
};

export type PrescriptionBlock = WarmupBlock | WorkBlock;

export type ProgramPrescriptionV1 = {
  version: 1;
  restSeconds?: number;
  notes?: string;
  blocks: PrescriptionBlock[];
};

/**
 * Parse a prescription_json string into a ProgramPrescriptionV1.
 * Returns null if the string is empty/null/invalid.
 * Lenient: defaults missing fields where possible.
 */
export function parseProgramPrescription(
  json: string | null | undefined
): ProgramPrescriptionV1 | null {
  if (!json) return null;

  try {
    const raw = JSON.parse(json);
    if (!raw || typeof raw !== "object") return null;

    // Reject unknown version
    if (raw.version !== undefined && raw.version !== 1) return null;

    const result: ProgramPrescriptionV1 = {
      version: 1,
      restSeconds: typeof raw.restSeconds === "number" ? raw.restSeconds : undefined,
      notes: typeof raw.notes === "string" ? raw.notes : undefined,
      blocks: [],
    };

    if (Array.isArray(raw.blocks)) {
      for (const block of raw.blocks) {
        if (!block || typeof block !== "object") continue;

        if (block.kind === "warmup") {
          result.blocks.push({
            kind: "warmup",
            style: block.style === "fixed" ? "fixed" : "ramp",
            sets: typeof block.sets === "number" ? block.sets : 1,
            reps: typeof block.reps === "number" ? block.reps : undefined,
            fromPercent: typeof block.fromPercent === "number" ? block.fromPercent : undefined,
            toPercent: typeof block.toPercent === "number" ? block.toPercent : undefined,
          });
        } else if (block.kind === "work") {
          let reps: RepSpec = { type: "fixed", value: 5 };
          if (block.reps && typeof block.reps === "object") {
            if (block.reps.type === "range") {
              reps = {
                type: "range",
                min: block.reps.min ?? 5,
                max: block.reps.max ?? 10,
              };
            } else if (block.reps.type === "fixed") {
              reps = { type: "fixed", value: block.reps.value ?? 5 };
            }
          }

          let target: TargetSpec | undefined;
          if (block.target && typeof block.target === "object") {
            const t = block.target;
            if (t.type === "fixed_weight_kg" && typeof t.value === "number") {
              target = { type: "fixed_weight_kg", value: t.value };
            } else if (t.type === "percent_e1rm" && typeof t.value === "number") {
              target = { type: "percent_e1rm", value: t.value };
            } else if (t.type === "rpe" && typeof t.value === "number") {
              target = { type: "rpe", value: t.value };
            } else if (t.type === "rir" && typeof t.value === "number") {
              target = { type: "rir", value: t.value };
            }
          }

          result.blocks.push({
            kind: "work",
            sets: typeof block.sets === "number" ? block.sets : 1,
            reps,
            target,
          });
        }
      }
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Serialize a ProgramPrescriptionV1 to JSON string.
 */
export function serializePrescription(prescription: ProgramPrescriptionV1): string {
  return JSON.stringify(prescription);
}

/**
 * Create a simple work-only prescription.
 */
export function createSimplePrescription(args: {
  sets: number;
  reps: number | { min: number; max: number };
  target?: TargetSpec;
  restSeconds?: number;
  notes?: string;
}): ProgramPrescriptionV1 {
  const reps: RepSpec =
    typeof args.reps === "number"
      ? { type: "fixed", value: args.reps }
      : { type: "range", min: args.reps.min, max: args.reps.max };

  return {
    version: 1,
    restSeconds: args.restSeconds,
    notes: args.notes,
    blocks: [
      {
        kind: "work",
        sets: args.sets,
        reps,
        target: args.target,
      },
    ],
  };
}
