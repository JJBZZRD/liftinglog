import { compilePslSource } from "../../lib/programs/psl/pslService";
import { introspectPslSource } from "../../lib/programs/psl/pslIntrospection";
import {
  buildImportedTemplateName,
  buildPersonalizedTemplateSource,
  getTemplateById,
  getRecommendedActivationWeeksForPslSource,
  PSL_TEMPLATES,
} from "../../lib/programs/psl/pslTemplates";

function getCompileOverride(source: string) {
  const introspection = introspectPslSource(source);
  if (!introspection.ok || introspection.requiresEndDateForActivation) {
    return {
      start_date: "2026-01-05",
      end_date: "2026-03-30",
    };
  }

  return {
    start_date: "2026-01-05",
  };
}

describe("pslTemplates", () => {
  it("builds valid v0.3 PSL for every template", () => {
    PSL_TEMPLATES.forEach((template) => {
      expect(template.pslSource).toContain('language_version: "0.3"');
      expect(template.exerciseRequirements.length).toBeGreaterThan(0);

      const result = compilePslSource(template.pslSource, {
        calendarOverride: getCompileOverride(template.pslSource),
      });

      expect(result.valid).toBe(true);
    });
  });

  it("uses sequence for the templates that now rely on v0.3 sequencing", () => {
    const template = getTemplateById("531-bbb");
    expect(template).toBeDefined();
    expect(template?.pslSource).toContain("\nsequence:\n");
    expect(template?.pslSource).not.toContain("schedule:");
  });

  it("can personalize template exercise names while keeping canonical aliases", () => {
    const personalizedSource = buildPersonalizedTemplateSource("531-bbb", {
      barbell_bench_press: "Bench Press",
      standing_barbell_overhead_press: "Barbell OHP",
    });

    expect(personalizedSource).toContain('exercise: "Bench Press"');
    expect(personalizedSource).toContain('exercise: "Barbell OHP"');
    expect(personalizedSource).toContain('"Standing Barbell Overhead Press"');

    const result = compilePslSource(personalizedSource, {
      calendarOverride: getCompileOverride(personalizedSource),
    });

    expect(result.valid).toBe(true);
  });

  it("marks single-exercise templates as explicit exercise selections", () => {
    const template = getTemplateById("smolov-jr");
    expect(template).toBeDefined();
    expect(template?.defaultActivationWeeks).toBe(3);
    expect(template?.exerciseRequirements).toHaveLength(1);
    expect(template?.exerciseRequirements[0]?.canonicalName).toBe("Target Exercise");
    expect(template?.exerciseRequirements[0]?.resolutionStrategy).toBe(
      "select_or_create"
    );
  });

  it("returns the bundled recommended activation horizon from template-backed PSL", () => {
    const template = getTemplateById("smolov-jr");
    expect(template).toBeDefined();
    expect(getRecommendedActivationWeeksForPslSource(template!.pslSource)).toBe(3);
  });

  it("builds imported names from explicit exercise selections", () => {
    expect(
      buildImportedTemplateName("smolov-jr", { target_exercise: "Bench Press" })
    ).toBe("Smolov Jr (Bench Press)");
  });

  it("can personalize the stored PSL metadata name for imported templates", () => {
    const personalizedSource = buildPersonalizedTemplateSource(
      "smolov-jr",
      { target_exercise: "Bench Press" },
      "Smolov Jr (Bench Press)"
    );

    expect(personalizedSource).toContain('name: "Smolov Jr (Bench Press)"');
    expect(personalizedSource).toContain('exercise: "Bench Press"');
  });
});
