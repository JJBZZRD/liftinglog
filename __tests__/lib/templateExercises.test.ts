import {
  buildTemplateExerciseAliasesMap,
  buildTemplateExerciseRequirement,
  getTemplateExerciseSuggestions,
  matchTemplateExercises,
} from "../../lib/programs/psl/templateExercises";

describe("templateExercises", () => {
  it("finds alias-based suggestions for slightly different library names", () => {
    const requirement = buildTemplateExerciseRequirement(
      "Standing Barbell Overhead Press"
    );
    const suggestions = getTemplateExerciseSuggestions(requirement, [
      { id: 1, name: "Barbell OHP" },
      { id: 2, name: "Dumbbell Shoulder Press" },
      { id: 3, name: "Cable Row" },
    ]);

    expect(suggestions[0]?.exercise.name).toBe("Barbell OHP");
    expect(suggestions[0]?.matchType).toBe("alias");
  });

  it("auto-selects exact canonical name matches but not alias-only matches", () => {
    const [match] = matchTemplateExercises(
      [buildTemplateExerciseRequirement("Barbell Bench Press")],
      [
        { id: 1, name: "Bench Press" },
        { id: 2, name: "Barbell Bench Press" },
      ]
    );

    expect(match.exactMatch?.exercise.name).toBe("Barbell Bench Press");
    expect(match.suggestions[0]?.exercise.name).toBe("Barbell Bench Press");
  });

  it("skips ambiguous aliases when building the top-level alias map", () => {
    const aliases = buildTemplateExerciseAliasesMap([
      buildTemplateExerciseRequirement("Barbell Bench Press", ["Bench Press"]),
      buildTemplateExerciseRequirement("Dumbbell Bench Press", ["Bench Press"]),
    ]);

    expect(aliases["Bench Press"]).toBeUndefined();
  });
});
