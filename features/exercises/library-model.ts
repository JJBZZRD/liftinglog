import type { Exercise, ExerciseLibraryGroup } from "@/lib/db/exercises";

export type SortOption = "alphabetical" | "lastCompleted";
export type SearchScope = "all" | "muscle" | "equipment";

export type ExerciseSection = {
  key: string;
  title: string;
  items: ExerciseLibraryGroup[];
};

export const SEARCH_SCOPE_OPTIONS: { id: SearchScope; label: string }[] = [
  { id: "all", label: "All" },
  { id: "muscle", label: "Muscle" },
  { id: "equipment", label: "Equipment" },
];

const SECTION_ORDER = [
  "Chest & Triceps",
  "Back & Biceps",
  "Shoulders",
  "Lower Body",
  "Core",
  "Conditioning",
  "Uncategorized",
];

export function titleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatSectionTitle(muscleGroup: string | null | undefined): string {
  const value = muscleGroup?.trim().toLowerCase() ?? "";
  if (!value) {
    return "Uncategorized";
  }
  if (value.includes("chest") || value.includes("tricep")) {
    return "Chest & Triceps";
  }
  if (
    value.includes("back") ||
    value.includes("lat") ||
    value.includes("bicep") ||
    value.includes("row")
  ) {
    return "Back & Biceps";
  }
  if (
    value.includes("leg") ||
    value.includes("quad") ||
    value.includes("hamstring") ||
    value.includes("glute") ||
    value.includes("calf") ||
    value.includes("lower")
  ) {
    return "Lower Body";
  }
  if (
    value.includes("shoulder") ||
    value.includes("delt") ||
    value.includes("trap")
  ) {
    return "Shoulders";
  }
  if (value.includes("core") || value.includes("ab")) {
    return "Core";
  }
  if (value.includes("cardio") || value.includes("conditioning")) {
    return "Conditioning";
  }

  return titleCaseWords(muscleGroup!);
}

export function formatMuscleGroupTitle(muscleGroup: string | null | undefined): string {
  if (!muscleGroup?.trim()) {
    return "Uncategorized";
  }

  return titleCaseWords(muscleGroup);
}

export function getSectionTitleForMode(
  mode: SearchScope,
  exercise: Exercise
): string {
  if (mode === "equipment") {
    return getEquipmentBadgeLabel(exercise);
  }

  if (mode === "muscle") {
    return formatMuscleGroupTitle(exercise.muscleGroup);
  }

  return formatSectionTitle(exercise.muscleGroup);
}

export function getEquipmentBadgeLabel(exercise: Exercise): string {
  if (exercise.isBodyweight) {
    return "BODYWEIGHT";
  }

  const equipment = exercise.equipment?.trim();
  if (!equipment) {
    return "GENERAL";
  }

  const normalized = equipment.toLowerCase();
  if (normalized.includes("barbell")) return "BARBELL";
  if (normalized.includes("dumbbell")) return "DUMBBELL";
  if (normalized.includes("cable")) return "CABLE";
  if (normalized.includes("machine")) return "MACHINE";
  if (normalized.includes("kettlebell")) return "KETTLEBELL";

  return equipment.toUpperCase();
}

export function sortSections(sections: ExerciseSection[]): ExerciseSection[] {
  return [...sections].sort((a, b) => {
    const aIndex = SECTION_ORDER.indexOf(a.title);
    const bIndex = SECTION_ORDER.indexOf(b.title);
    const resolvedA = aIndex === -1 ? SECTION_ORDER.length : aIndex;
    const resolvedB = bIndex === -1 ? SECTION_ORDER.length : bIndex;

    if (resolvedA !== resolvedB) {
      return resolvedA - resolvedB;
    }

    return a.title.localeCompare(b.title);
  });
}

export function formatCompactDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const showYear = date.getFullYear() !== now.getFullYear();

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(showYear ? { year: "numeric" } : {}),
  });
}

export function filterAndSortGroups(items: ExerciseLibraryGroup[], searchQuery: string, sortOption: SortOption, sortAscending: boolean) {
  const query = searchQuery.trim().toLowerCase();
  let result = [...items];

  if (query) {
    result = result.filter((item) => {
      const searchableTerms = [
        item.exercise.name,
        item.exercise.muscleGroup ?? "",
        item.exercise.equipment ?? "",
        ...item.variations.flatMap((variation) => [
          variation.name,
          variation.variationLabel ?? "",
          variation.muscleGroup ?? "",
          variation.equipment ?? "",
        ]),
      ]
        .join(" ")
        .toLowerCase();

      return searchableTerms.includes(query);
    });
  }

  if (sortOption === "alphabetical") {
    result.sort((a, b) => {
      const comparison = a.exercise.name.localeCompare(b.exercise.name);
      return sortAscending ? comparison : -comparison;
    });
  } else {
    result.sort((a, b) => {
      const aTime = a.familyLastPerformedAt ?? 0;
      const bTime = b.familyLastPerformedAt ?? 0;
      return sortAscending ? aTime - bTime : bTime - aTime;
    });
  }

  return result;
}
export function groupExerciseSections(filteredAndSortedItems: ExerciseLibraryGroup[], searchScope: SearchScope, showAllTabBodyPartGrouping: boolean): ExerciseSection[] {
  if (searchScope === "all" && !showAllTabBodyPartGrouping) {
    return [
      {
        key: "all-exercises",
        title: "",
        items: filteredAndSortedItems,
      },
    ];
  }

  const grouped = new Map<string, ExerciseLibraryGroup[]>();

  for (const item of filteredAndSortedItems) {
    const sectionTitle = getSectionTitleForMode(searchScope, item.exercise);
    if (!grouped.has(sectionTitle)) {
      grouped.set(sectionTitle, []);
    }
    grouped.get(sectionTitle)!.push(item);
  }

  const nextSections = Array.from(grouped.entries()).map(([title, groupedItems]) => ({
    key: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    items: groupedItems,
  }));

  if (searchScope === "all") {
    return sortSections(nextSections);
  }

  return nextSections.sort((a, b) => a.title.localeCompare(b.title));
}

export function filteredLabel(count: number): string {
  return `${count} exercise${count === 1 ? "" : "s"}`;
}
