export type ReleaseProfile = 'full' | 'mvp';

export interface AppCapabilities {
  readonly programsExperience: 'enabled' | 'coming-soon';
  readonly healthMetrics: boolean;
  readonly videoRecording: boolean;
  readonly thirdPartyImport: boolean;
  readonly multipleWorkoutSessions: boolean;
}

const capabilitiesByProfile: Readonly<Record<ReleaseProfile, Readonly<AppCapabilities>>> = Object.freeze({
  full: Object.freeze({
    programsExperience: 'enabled',
    healthMetrics: true,
    videoRecording: true,
    thirdPartyImport: true,
    multipleWorkoutSessions: true,
  }),
  mvp: Object.freeze({
    programsExperience: 'coming-soon',
    healthMetrics: false,
    videoRecording: false,
    thirdPartyImport: false,
    multipleWorkoutSessions: false,
  }),
});

export function parseReleaseProfile(value: string | undefined): ReleaseProfile {
  if (value === undefined || value === 'full') {
    return 'full';
  }

  if (value === 'mvp') {
    return 'mvp';
  }

  throw new Error(`Invalid release profile: ${JSON.stringify(value)}`);
}

export function getCapabilities(profile: ReleaseProfile): Readonly<AppCapabilities> {
  return capabilitiesByProfile[profile];
}

export const releaseProfile = parseReleaseProfile(process.env.EXPO_PUBLIC_RELEASE_PROFILE);
export const appCapabilities = getCapabilities(releaseProfile);
