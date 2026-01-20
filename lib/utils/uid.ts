/**
 * Generate a unique identifier for database rows.
 * Prefers crypto.randomUUID() when available, falls back to timestamp + random.
 */
export function newUid(): string {
  // Try native crypto.randomUUID() first (available in modern RN/Expo)
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Fallback: timestamp + random string (unique enough for local IDs)
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  const randomPart2 = Math.random().toString(36).substring(2, 6);
  return `${timestamp}-${randomPart}-${randomPart2}`;
}
