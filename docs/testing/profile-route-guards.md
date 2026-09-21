# Profile route-guard tests

`__tests__/routing/profile-route-guards.test.tsx` uses Expo Router's installed
`renderRouter` harness with the production `app/_layout.tsx` root. Dummy leaf
routes isolate the navigation boundary while the production `Stack.Protected`
configuration remains responsible for access decisions.

The root Jest configuration runs this test in a dedicated `jest-expo` project.
The existing unit project retains its prior node environment, transforms, setup,
and test discovery; the router project owns this test alone, so it is neither
omitted nor executed twice.

Run the route suite directly:

```powershell
npm.cmd test -- --runInBand __tests__/routing/profile-route-guards.test.tsx
```

Run all unit and router tests:

```powershell
npm.cmd test -- --runInBand
```

The route suite currently contains 22 tests. It covers every discovered program,
health, and recording route for MVP denial and no leaf mount; core exercise,
gallery, calculators, and Programs tab access; representative full-profile
direct links; and root seed/notification bootstrap behavior. Embedded program
mode in `UnifiedRecordTab` remains MVP-001D scope.
