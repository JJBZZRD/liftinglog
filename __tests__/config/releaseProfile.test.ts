import type * as ReleaseProfileModule from '@/lib/config/releaseProfile';

jest.mock('expo/virtual/env', () => ({ env: process.env }));

type ReleaseProfileExports = typeof ReleaseProfileModule;

function loadReleaseProfile(value: string | undefined): ReleaseProfileExports {
  const originalProfile = process.env.EXPO_PUBLIC_RELEASE_PROFILE;

  try {
    if (value === undefined) {
      delete process.env.EXPO_PUBLIC_RELEASE_PROFILE;
    } else {
      process.env.EXPO_PUBLIC_RELEASE_PROFILE = value;
    }

    jest.resetModules();

    let selected: ReleaseProfileExports | undefined;
    jest.isolateModules(() => {
      selected = require('@/lib/config/releaseProfile');
    });

    return selected!;
  } finally {
    if (originalProfile === undefined) {
      delete process.env.EXPO_PUBLIC_RELEASE_PROFILE;
    } else {
      process.env.EXPO_PUBLIC_RELEASE_PROFILE = originalProfile;
    }
    jest.resetModules();
  }
}

describe('release profiles', () => {
  it('defaults an undefined value to the full profile', () => {
    const { parseReleaseProfile } = loadReleaseProfile(undefined);

    expect(parseReleaseProfile(undefined)).toBe('full');
  });

  it('accepts the exact full and mvp profile values', () => {
    const { parseReleaseProfile } = loadReleaseProfile(undefined);

    expect(parseReleaseProfile('full')).toBe('full');
    expect(parseReleaseProfile('mvp')).toBe('mvp');
  });

  it.each(['', ' full', 'full ', 'mvp ', 'MVP', 'preview'])('rejects invalid profile value %p', (value) => {
    const { parseReleaseProfile } = loadReleaseProfile(undefined);

    expect(() => parseReleaseProfile(value)).toThrow(`Invalid release profile: ${JSON.stringify(value)}`);
  });

  it('returns the shared immutable full capability object', () => {
    const { getCapabilities } = loadReleaseProfile(undefined);
    const capabilities = getCapabilities('full');

    expect(capabilities).toBe(getCapabilities('full'));
    expect(capabilities).toEqual({
      programsExperience: 'enabled',
      healthMetrics: true,
      videoRecording: true,
      thirdPartyImport: true,
      multipleWorkoutSessions: true,
    });
    expect(Object.isFrozen(capabilities)).toBe(true);
    expect(Reflect.set(capabilities, 'healthMetrics', false)).toBe(false);
    expect(capabilities.healthMetrics).toBe(true);
  });

  it('returns the shared immutable mvp capability object', () => {
    const { getCapabilities } = loadReleaseProfile(undefined);
    const capabilities = getCapabilities('mvp');

    expect(capabilities).toBe(getCapabilities('mvp'));
    expect(capabilities).toEqual({
      programsExperience: 'coming-soon',
      healthMetrics: false,
      videoRecording: false,
      thirdPartyImport: false,
      multipleWorkoutSessions: false,
    });
    expect(Object.isFrozen(capabilities)).toBe(true);
  });

  it.each([
    [undefined, 'full'],
    ['full', 'full'],
    ['mvp', 'mvp'],
  ] as const)('selects %s for EXPO_PUBLIC_RELEASE_PROFILE=%p', (value, profile) => {
    const { appCapabilities, getCapabilities, releaseProfile } = loadReleaseProfile(value);

    expect(releaseProfile).toBe(profile);
    expect(appCapabilities).toBe(getCapabilities(profile));
  });

  it('throws while loading the module with an invalid environment profile', () => {
    expect(() => loadReleaseProfile(' MVP')).toThrow('Invalid release profile: " MVP"');
  });
});
