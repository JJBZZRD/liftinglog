# Calculator verification (MVP-007B)

Verified 2026-09-21 against the MVP calculator scope in `docs/mvp-product-facts.md` section 8.

## Scope and evidence

- The catalog contains all five offline MVP tools: 1RM Toolkit, Powerlifting Total, Power Score, Sinclair, and Plate Loader.
- Each catalog entry has a matching `/calculators/...` route, and the hub test presses every card and verifies the resulting route target.
- Representative calculations cover Epley 1RM projections, powerlifting total plus DOTS/IPF GL/Wilks scores, Sinclair scoring, exact and remainder plate loadouts, and kg/lb conversion.
- Invalid input coverage verifies zero and non-finite values are rejected by each calculator family.
- No calculator sends results into a workout; this remains deferred for MVP.

## Checks

The permitted calculator test paths pass under both release profiles:

```text
EXPO_PUBLIC_RELEASE_PROFILE=full npx.cmd jest --runInBand --watch=false --runTestsByPath __tests__/lib/calculators.test.ts __tests__/app/calculators-ui.test.tsx
EXPO_PUBLIC_RELEASE_PROFILE=mvp npx.cmd jest --runInBand --watch=false --runTestsByPath __tests__/lib/calculators.test.ts __tests__/app/calculators-ui.test.tsx
```

Both runs: 2 suites passed, 13 tests passed.

Repository checks also pass:

- `npx.cmd tsc --noEmit`
- `npm.cmd run lint -- --no-cache` (0 errors; existing warnings remain elsewhere in the repository)

Native device rendering and deep-link launch behavior are outside this Jest verification and are not proved here. Formula definitions and production calculator routes were read-only during this review.
