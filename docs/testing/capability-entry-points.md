# Capability entry-point coverage

`__tests__/app/capability-entry-points.test.tsx` verifies that the MVP overview never loads or renders the health-metrics card while the full profile retains both.

`__tests__/app/manual-logging-lifecycle.test.tsx` verifies that the included manual exercise route hides recording and ignores program selection parameters in MVP. It continues through the manual set path without scheduled-program lookups or program-history writers. The same harness verifies that full still performs the program lookup and shows recording.

Run the focused coverage with:

```powershell
npx.cmd jest --runInBand --runTestsByPath __tests__/app/capability-entry-points.test.tsx __tests__/app/manual-logging-lifecycle.test.tsx __tests__/routing/profile-route-guards.test.tsx
```
