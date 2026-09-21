import { appCapabilities, type AppCapabilities } from "../config/releaseProfile";

/**
 * Normalizes the mixed capability contract into a boolean for navigation guards.
 */
export function isCapabilityEnabled(
  capability: keyof AppCapabilities,
  capabilities: Readonly<AppCapabilities> = appCapabilities
): boolean {
  const value = capabilities[capability];
  return capability === "programsExperience" ? value === "enabled" : value === true;
}
