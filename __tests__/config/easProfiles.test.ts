import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ReleaseProfile } from '@/lib/config/releaseProfile';
import { getCapabilities, parseReleaseProfile } from '@/lib/config/releaseProfile';

type EasConfig = {
  build: Record<string, {
    env?: Record<string, string>;
    developmentClient?: boolean;
    distribution?: string;
    autoIncrement?: boolean;
  }>;
  submit: Record<string, unknown>;
};

function readEasConfig(): EasConfig {
  return JSON.parse(readFileSync(resolve(__dirname, '../../eas.json'), 'utf8')) as EasConfig;
}

describe('EAS build capability profiles', () => {
  it.each([
    ['development', 'mvp'],
    ['preview', 'mvp'],
    ['production', 'mvp'],
  ] as const)('sets the %s build profile to %s', (buildProfile, expectedProfile) => {
    const config = readEasConfig();
    const configuredProfile = config.build[buildProfile]?.env?.EXPO_PUBLIC_RELEASE_PROFILE;

    expect(configuredProfile).toBe(expectedProfile);

    const parsedProfile = parseReleaseProfile(configuredProfile);
    expect(parsedProfile).toBe(expectedProfile satisfies ReleaseProfile);
    expect(getCapabilities(parsedProfile)).toEqual(getCapabilities(expectedProfile));
  });

  it('preserves the existing development, distribution, increment, and submit settings', () => {
    const config = readEasConfig();

    expect(config.build.development).toMatchObject({
      developmentClient: true,
      distribution: 'internal',
    });
    expect(config.build.preview).toMatchObject({ distribution: 'internal' });
    expect(config.build.production).toMatchObject({ autoIncrement: true });
    expect(config.submit.production).toEqual({});
  });
});
