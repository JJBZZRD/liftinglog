import { compilePslSource } from "../../lib/programs/psl/pslService";
import { introspectPslSource } from "../../lib/programs/psl/pslIntrospection";
import {
  buildPersonalizedTemplateSource,
  getTemplateById,
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
});
