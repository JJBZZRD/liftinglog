# MVP Baseline Register

baseline_date: 2026-09-20
plan: [docs/mvp-implementation-plan.md](mvp-implementation-plan.md)
scope: MVP-000C
status: recorded

## Toolchain

| Tool | Version / state |
| --- | --- |
| Node.js | v22.19.0 |
| npm | 11.7.0 |
| Java | OpenJDK 17.0.16 |
| Expo package | 54.0.32 installed before modernization |
| Gradle | 8.14.3 |
| Android compile SDK | 36 |
| Android target SDK | 36 |
| Android minimum SDK | 24 |
| Kotlin | 2.1.20 |

## Command Outcomes

| Command | Outcome |
| --- | --- |
| `npm ls --depth=0` | PASS |
| `npm run typecheck` | PASS after commit `b5e27b2` |
| `npm test -- --runInBand` | PASS: 26 suites, 337 tests |
| `npm run lint` | PASS: 0 errors, 20 warnings |
| `cd android; .\gradlew.bat :app:compileDebugKotlin` | PASS |
| `npx expo-doctor@1.20.4` | 15/18 checks passed; 3 platform findings recorded below |

## Accepted Warnings

These warnings are accepted for the baseline only and must not be treated as release sign-off:

- Lint: 20 warnings, 0 errors.
- Android Kotlin compilation: `NODE_ENV` was unset.
- Android Kotlin compilation: Gradle deprecation warnings were emitted.

## Unresolved Prerequisite Findings

The following `expo-doctor@1.20.4` findings are owned by `MVP-PRE-001` in the implementation plan. They are not accepted release exceptions:

- Invalid uppercase `LiftingLog` URL scheme.
- Native project and app configuration synchronization warning because `android/` is checked in.
- 11 SDK 54 package/patch mismatches.

The baseline remains valid as a recorded starting point, but the prerequisite modernization work must resolve or explicitly review each finding before MVP feature work is released.

## Worktree Exclusions

The unrelated existing worktree paths below are excluded from all ticket commits:

- `.gitignore`
- `docs/codebase-analysis-2026-06-21/`

