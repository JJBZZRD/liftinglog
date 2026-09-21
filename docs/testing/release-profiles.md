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

Changing the value does not change an already-installed native binary. Restart
Metro after changing it and perform a full reload so the JavaScript bundle is
rebuilt with the selected profile. A new native build is required when the
native binary itself must change.

The repository's `.env.local` remains the local source for the ignored
localhost hostname and is not modified by the release-profile setup.
