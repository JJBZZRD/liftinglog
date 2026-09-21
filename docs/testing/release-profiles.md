# Release profiles

The local default remains the `full` capability profile. To run the local MVP
surface, set the public profile for the Metro process before starting Expo:

```powershell
$env:EXPO_PUBLIC_RELEASE_PROFILE = 'mvp'
npm.cmd start -- --localhost
```

Clear the variable or set it to `full` to return to the full local surface:

```powershell
$env:EXPO_PUBLIC_RELEASE_PROFILE = 'full'
npm.cmd start -- --localhost
```

`EXPO_PUBLIC_RELEASE_PROFILE` is an Expo public environment variable. EAS
includes the value in the JavaScript bundle at build time, so the development
profile uses `full` while preview and production use `mvp`.

For a development client connected to Metro, restart Metro after changing the
value and perform a full reload. The newly served JavaScript bundle selects the
profile without rebuilding native code. An installed standalone preview or
production app uses its embedded bundle: changing the local shell variable does
not update that app. Build and install a new candidate with the required profile;
this ticket does not configure an over-the-air update pipeline.

This follows Expo's documented [build-profile environment configuration](https://docs.expo.dev/build/eas-json/)
and [public environment variable bundling](https://docs.expo.dev/guides/environment-variables/).

The repository's `.env.local` remains the local source for the ignored
localhost hostname and is not modified by the release-profile setup.

## CI coverage

The `Quality` workflow runs the same checkout, Node 22 setup, dependency
install, lint, Expo ambient type generation, typecheck, and serial Jest
commands once for each profile: `full` and `mvp`. Each matrix check is named
with its profile so branch protection can require both results explicitly.

The ambient type step writes Expo's standard one-line `expo-env.d.ts` because
that file is intentionally ignored locally while `tsconfig.json` includes it.
This keeps a clean checkout's CSS module typecheck equivalent to a local Expo
checkout.

This verifies that both profile environments pass the repository's static and
test checks from a clean CI install. It does not build an iOS or Android
binary, validate EAS profile configuration, or replace device-level smoke
testing of the bundled capability surface.
