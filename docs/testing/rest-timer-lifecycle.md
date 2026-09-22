# Rest timer lifecycle tests

`timerStore` is inert when imported. The ready application subtree calls
`timerStore.activateWhenAppReady()` once it is permitted to mount; activation
installs notification handling, begins permission/channel setup, and registers
the AppState listener.

`quiesceForReplacementRestore()` synchronously suspends timer mutations,
invalidates async work, removes the AppState listener and clears intervals. It
then drains native work already issued by the store and removes each known
countdown/completion artifact. Cleanup failures reject and retain timer
identities so a replacement restore cannot proceed with a false success.

Focused coverage lives in `__tests__/timerStore.test.ts` and
`__tests__/app/notification-lifecycle.test.tsx`. Run it under each profile:

```powershell
$env:EXPO_PUBLIC_RELEASE_PROFILE = "full"; npm.cmd test -- --runInBand __tests__/timerStore.test.ts __tests__/app/notification-lifecycle.test.tsx
$env:EXPO_PUBLIC_RELEASE_PROFILE = "mvp"; npm.cmd test -- --runInBand __tests__/timerStore.test.ts __tests__/app/notification-lifecycle.test.tsx
```

The native bulk-retirement facade is separately owned and is intentionally not
called here.
