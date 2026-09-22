/**
 * Accept only the exercise IDs that the catalog stores. Route params are
 * untrusted strings, so parsing must not silently turn values such as
 * "1abc" or "1.5" into a different catalog ID.
 */
export function parseExerciseRouteId(value: unknown): number | null {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    return null;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
