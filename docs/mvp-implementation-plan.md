# WorkoutLog MVP Implementation Plan

Status: Proposed delivery plan based on `docs/mvp-product-facts.md` and the
codebase-memory graph as inspected on 2026-09-19.

## 1. Epic

### EPIC-MVP-01: Release the logging and visualisation MVP

Deliver a releasable, offline WorkoutLog build centered on exercise creation,
concurrent exercise logging, in-progress and completed history, existing analytics
and PBs, existing calculators, gallery video attachment, and rigorous local backup
and restore.

Deferred features remain in the same codebase. The MVP build exposes Programs as a
Coming Soon tab and prevents access to program authoring/logging, health metrics,
and in-app video recording.

Before product implementation begins, the repository is upgraded from Expo SDK 54
to the latest stable Expo SDK 57 patch and its direct dependencies are brought to a
known-compatible baseline. Delivery controls and baseline evidence are established
first so each SDK step is independently reviewable and reversible.

### Epic acceptance criteria

1. Users can create exercises, including exercises with duplicate display names.
2. Users can keep multiple exercise entries in progress and resume them after an
   app restart.
3. Completing one exercise does not complete any other exercise.
4. A later logging session for the same completed exercise creates a new exercise
   entry.
5. Broad and exercise-specific history show real in-progress entries with an
   explicit In Progress state.
6. Existing analytics and PB definitions include valid in-progress sets and
   recalculate after set edits or deletion.
7. Existing visualisations, history filters, and calculators remain available.
8. Workout, exercise-entry, and set notes are usable and durable.
9. A set supports one user-facing gallery video that can be replaced, viewed, and
   rediscovered after restore when the device still contains a match.
10. Backup export is a valid database snapshot; restore replaces current data and
    never silently merges it.
11. Programs shows Coming Soon in the MVP profile. Deferred routes cannot be opened
    through direct navigation, deep links, or notifications.
12. The full development profile still compiles and retains the existing deferred
    feature source code.
13. Automated checks and the manual release matrix pass on the release candidate.

## 2. Delivery Principles

- `main` is the integration branch and remains buildable.
- Do not create a long-lived MVP fork.
- Complete the platform-modernization prerequisite before branching feature stories.
- Upgrade one Expo SDK at a time; each passing SDK step merges to `main` before the
  next begins.
- Incomplete exposure changes land behind a centralized release capability profile.
- Deferred source code and database tables are retained.
- The MVP and full profiles use the same schema and forward-only migrations.
- Each worker agent owns one ticket, one branch, one worktree, and a narrow write
  scope.
- Worker agents do not merge, widen scope, or resolve cross-ticket conflicts.
- The organizer/reviewer agent owns dependency ordering, shared contracts, review,
  merge order, and release decisions.
- High-risk database work receives an independent read-only review before merge.

## 3. Branching and Main Maintenance

### 3.1 Branch model

Use short-lived branches from the latest `main`:

```text
upgrade/MVP-PRE-001B-expo-55
upgrade/MVP-PRE-001C-expo-56
upgrade/MVP-PRE-001D-expo-57
mvp/MVP-001A-capability-contract
mvp/MVP-002B-history-read-model
mvp/MVP-003B-duplicate-name-migration
mvp/MVP-006B-replacement-restore
```

One branch corresponds to one independently reviewable ticket. Delete it after
merge. Avoid a shared branch on which several agents write concurrently.

Expo upgrade branches are deliberately sequential because they share `package.json`,
the lockfile, app configuration, and native Android files. Read-only compatibility
inventory can run in parallel, but only one upgrade worker may write those files at
a time. Each SDK PR must leave `main` buildable; do not combine SDK 55, 56, and 57 in
one diff.

Dependent tickets use stacked branches only while the dependency is under review.
After the parent ticket merges, the organizer rebases or recreates the child from
the new `main`. Agents must not carry an old stack through several waves.

### 3.2 Main integration policy

- All ticket branches start from a commit SHA recorded in the ticket packet.
- Before handoff, the worker rebases on the current `main` when there are no
  conflicts.
- If a rebase conflicts outside the worker's assigned files, the worker stops and
  reports the conflict. The organizer decides the integration order.
- Every ticket is merged through a reviewed PR or an equivalent reviewed diff.
- Prefer squash merges with the ticket ID in the final commit subject.
- No worker pushes directly to `main`.
- No worker stashes, commits, or rewrites changes that predate its worktree.
- Schema migrations are never rewritten after they have reached `main`; corrections
  are new forward migrations.

### 3.3 Keeping deferred features healthy

The release profile controls availability, not compilation. CI must exercise both
profiles:

| Profile | Purpose | Programs | Health metrics | Video recording |
| --- | --- | --- | --- | --- |
| `full` | Development and future feature work | Existing implementation | Enabled | Enabled |
| `mvp` | Preview and production MVP | Coming Soon | Unavailable | Unavailable |

Changes for the MVP must not delete program, health, or recording modules. Existing
tests for those modules remain in the suite. New shared database migrations must be
compatible with both profiles.

### 3.4 Release branches and hotfixes

Do not create `release/mvp-1.0` until every epic story has passed acceptance on
`main`. The release branch is stabilization-only:

- Accept release blockers, versioning, and store/build configuration only.
- Apply every code fix to `main` first, then cherry-pick it to the release branch.
- Tag the accepted release commit, for example `v1.0.0`.
- Delete the release branch after the release is stable.
- For a production-only emergency after `main` has moved on, branch from the
  release tag, merge the fix back to `main`, then tag the patch release.

This policy prevents the release line from becoming a second maintained product.

### 3.5 Required repository protections

- Require PR review by the organizer/reviewer agent or a human maintainer.
- Require lint, typecheck, and Jest status checks.
- Block force pushes and direct pushes to `main`.
- Require branches to be current with `main` before merge.
- Use a merge queue when several agent tickets finish in the same wave.

## 4. Agent Operating Model

### 4.1 Central organizer/reviewer

Use the strongest general coding model available, currently `gpt-5.6-sol` with high
or xhigh reasoning.

The organizer is the only agent given the complete epic context. It:

1. Maintains the dependency graph and merge queue.
2. Uses codebase-memory search and path tracing before creating each ticket.
3. Pins the base commit and write scope for every worker.
4. Defines shared interfaces before parallel workers begin.
5. Reviews every diff against the ticket and MVP facts.
6. Runs or delegates independent migration and restore audits.
7. Merges accepted tickets and refreshes the codebase-memory index at wave
   boundaries.
8. Updates story status and prepares the release candidate.

The organizer should avoid implementing feature tickets itself. Its implementation
work should be limited to small merge conflict resolutions whose behavior has
already been reviewed.

### 4.2 Worker model selection

| Work type | Suggested model | Reasoning |
| --- | --- | --- |
| Schema migration, history SQL, replacement restore, rollback design | `gpt-5.6-sol` | high or xhigh |
| Expo SDK transitions, native-module compatibility, custom Android patch review | `gpt-5.6-sol` | high |
| Cross-screen Expo Router gating, stateful UI integration | `gpt-5.6-terra` | high |
| Isolated UI work with an established contract | `gpt-5.6-terra` | medium |
| Focused unit tests, fixtures, config, CI, and documentation | `gpt-5.6-luna` | medium |
| Read-only inventories and mechanical verification | `gpt-5.6-luna` | low or medium |
| Independent audit of migration or restore code | `gpt-5.6-sol` | high; read-only |

A lower-cost agent should not own work where a subtle error could corrupt or hide
training data. A worker that discovers broader architectural risk must return the
ticket to the organizer rather than silently expanding its task.

### 4.3 Minimal worker context packet

Every worker receives only:

```text
Ticket ID and title
Pinned base commit
Objective
Acceptance criteria
Relevant MVP facts by section number
Required repository instructions
Exact symbols and files to inspect
Allowed write paths
Explicit non-goals and forbidden paths
Interface contract supplied by the organizer
Required targeted test command
Required handoff format
```

Database workers additionally receive `docs/database-ground-truth.md` and
`docs/db-access-patterns.md`. UI workers receive only the relevant route/component
context and the repository's existing UI consistency rules. Workers do not receive
the full conversation or unrelated story designs.

### 4.4 Worker handoff contract

Every worker returns:

- Commit SHA
- Files changed
- Behavior implemented
- Tests run and exact results
- Assumptions made
- Remaining risks or follow-up findings
- Confirmation that no out-of-scope files were changed

An incomplete handoff is not review-ready.

### 4.5 Review gates

The organizer checks every ticket for:

- Match to acceptance criteria
- Compliance with assigned write scope
- No deletion of deferred feature code
- The current/full app compiles; after MVP-001, both release profiles compile
- Database invariants and downstream consumers
- Tests that fail before and pass after the change where practical
- Error, cancellation, empty, and restart states
- No unrelated formatting or metadata churn
- Updated product/ground-truth documentation when behavior changes

Migration and restore tickets also require an independent specialist review and a
failure-injection test before merge.

## 5. Story Dependency Graph

```text
MVP-000 Delivery foundation
  -> MVP-PRE-001 Expo and dependency modernization

MVP-PRE-001
  |-> MVP-001 Capability profile
  |-> MVP-002 In-progress history
  |-> MVP-003 Exercise identity
  |-> MVP-004 Set detail and gallery media

MVP-002 -> MVP-005 Workout and exercise notes
MVP-003 -> MVP-006 Replacement restore
MVP-004 -> MVP-006 Replacement restore

MVP-001 + MVP-002 + MVP-003 + MVP-004 + MVP-005 + MVP-006
  -> MVP-007 Release correctness and stabilization
```

The arrows describe merge dependencies, not when discovery can begin. Read-only
spikes and test-fixture design can start earlier if they do not edit shared files.

## 6. Stories and Subtasks

### MVP-000: Delivery foundation and baseline

**Goal:** Establish a reproducible baseline and merge controls before parallel work
begins.

**Acceptance criteria:**

- MVP product facts and this plan are committed without absorbing unrelated local
  changes.
- Baseline lint, typecheck, and Jest results are recorded.
- CI runs lint, typecheck, and Jest for every PR.
- Known pre-existing failures are recorded and cannot be confused with ticket
  regressions.
- Branch protections and merge ownership are documented.

| Ticket | Subtask | Agent | Write scope | Depends on |
| --- | --- | --- | --- | --- |
| MVP-000A | Establish the clean baseline commit and preserve unrelated worktree changes | Organizer | Git metadata and MVP docs only | None |
| MVP-000B | Add or normalize `typecheck` and PR quality workflow using existing npm tooling | Luna, medium | `package.json`, lockfile only if required, `.github/workflows/**` | 000A |
| MVP-000C | Run baseline checks and write a machine-readable failure register | Luna, low | `docs/mvp-baseline.md` | 000A |
| MVP-000R | Review CI reproducibility from a fresh worktree | Organizer | No feature code | 000B, 000C |

Do not update dependencies merely to build the quality workflow. Dependency changes
begin only in MVP-PRE-001 after the pre-upgrade baseline is recorded.

### MVP-PRE-001: Expo and dependency modernization

**Goal:** Move the application from Expo SDK 54 to the latest stable SDK 57 patch,
align direct dependencies, and prove that existing JavaScript, database, media, and
custom native behavior still works before MVP features are changed.

Follow Expo's [incremental SDK upgrade guide](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
and review the official [SDK 55](https://expo.dev/changelog/sdk-55),
[SDK 56](https://expo.dev/changelog/sdk-56), and
[SDK 57](https://expo.dev/changelog/sdk-57) release notes at execution time. The
target is the newest stable 57.x patch available when the SDK 57 branch starts, not
a canary or preview release.

**Upgrade constraints:**

- Upgrade 54 -> 55 -> 56 -> 57 in separate PRs. Run `npx expo install --fix` and
  `npx expo-doctor@latest` at every step and resolve failures before merge.
- Let Expo choose versions for Expo-managed and React Native peer dependencies. Do
  not hand-select versions that conflict with the target SDK.
- Remove SDK 55-obsolete `newArchEnabled` and `edgeToEdgeEnabled` configuration only
  when that transition is made. The New Architecture remains mandatory.
- Treat SDK 56's iOS 16.4 minimum, TypeScript 6 baseline, MediaLibrary changes, and
  Expo Router/React Navigation dependency warnings as explicit compatibility checks.
- Treat SDK 57's React Native 0.86/React 19.2, Reanimated, Worklets, Gesture Handler,
  and native build changes as explicit compatibility checks.
- Use the stable NativeWind 4 line with
  [documented SDK 57 support](https://www.nativewind.dev/docs/getting-started/installation)
  (currently 4.2.7). A NativeWind 5 prerelease migration is outside this
  prerequisite.
- Do not enable Hermes V1, migrate navigation architecture, replace the database
  layer, or refactor product behavior as part of the SDK upgrade.
- Update unrelated third-party packages only when required for SDK 57 compatibility,
  a supported security fix, or removal of a confirmed deprecation. Use small
  compatibility batches with separate evidence rather than a blanket latest-version
  update.
- Keep deferred feature code compiling. In particular, do not remove camera or
  program dependencies merely because recording and programs are hidden in the MVP.

**Acceptance criteria:**

- `package.json` and the lockfile describe one clean, reproducible SDK 57 dependency
  tree; `npm ls --depth=0` succeeds.
- `npx expo-doctor@latest` is clean, or every accepted exception is documented with
  owner, rationale, and follow-up ticket.
- Lint, typecheck, and the full Jest suite pass against the upgraded baseline, apart
  from pre-recorded baseline exceptions.
- A clean Android development build compiles, installs, and boots. The checked-in
  native project can run `:app:compileDebugKotlin` after regeneration/synchronization.
- An iOS development build is produced through EAS or another clean generated-native
  path because this repository does not check in an `ios` project.
- SQLite startup/migrations, manual logging, history, PB/analytics reads, calculators,
  backup/export/import, notifications/rest timer, gallery selection, video playback,
  and the retained full-profile camera surface pass focused smoke tests.
- `scripts/patch-expo-camera-orientation.js` and
  `scripts/patch-react-native-css-interop-safe-area.js` are each revalidated against
  upgraded package sources. A patch is removed only when tests prove the upstream
  package makes it unnecessary; otherwise it is updated and guarded with a clear
  failure message.
- `plugins/withAndroidRestTimerNative` and its generated Kotlin/manifest integration
  compile and pass their runtime smoke test.
- No product behavior, schema, or release-profile feature work is mixed into an SDK
  transition PR.
- The organizer pins the accepted SDK 57 `main` SHA as the base for every Wave 1
  feature ticket and refreshes codebase-memory before dispatch.

| Ticket | Subtask | Agent | Write scope | Depends on |
| --- | --- | --- | --- | --- |
| MVP-PRE-001A | Capture dependency/native inventory, current command results, device smoke baseline, and an upgrade decision log | Luna, medium | `docs/mvp-platform-baseline.md` only | MVP-000 |
| MVP-PRE-001B | Upgrade SDK 54 to 55, align managed packages, remove obsolete config, and pass all step gates | Sol, high | dependency manifests/lockfile, app config, native/config compatibility fixes, focused tests | PRE-001A |
| MVP-PRE-001C | Upgrade SDK 55 to 56 and resolve iOS minimum, TypeScript, media, router/navigation, and native build compatibility | Sol, high | same platform seam as 001B | PRE-001B |
| MVP-PRE-001D | Upgrade SDK 56 to the latest stable SDK 57 patch and align React Native, React, Reanimated, Worklets, and Gesture Handler | Sol, high | same platform seam as 001C | PRE-001C |
| MVP-PRE-001E | Audit direct third-party dependencies in small risk groups; upgrade only justified packages and move NativeWind to stable SDK 57 support | Terra, high | dependency manifests/lockfile, Metro/Babel/style compatibility, focused tests | PRE-001D |
| MVP-PRE-001F | Revalidate or retire both postinstall patches and validate the custom Android rest-timer plugin | Sol, high | `scripts/**`, `plugins/**`, `android/**`, focused native tests | PRE-001D, PRE-001E |
| MVP-PRE-001G | Run clean Android and iOS development-build smoke matrices and document accepted exceptions | Organizer plus device operator | test evidence/docs; fixes require a new scoped ticket | PRE-001F |
| MVP-PRE-001H | Run the accepted SDK 57 build in an Android emulator, audit Metro and logcat, delegate scoped fixes, and repeat until clean | Luna/Terra operator plus organizer-selected fix agents | operator: evidence/docs only; repair agents: explicitly assigned files on separate scoped branches | PRE-001G |
| MVP-PRE-001R | Independently review version alignment, lockfile, native diffs, patch necessity, and upgrade evidence | Sol audit, high | Read-only | MVP-PRE-001B through MVP-PRE-001H |

The SDK implementation tickets are not parallel work. PRE-001A may delegate
read-only package and native-patch inspections concurrently, and PRE-001G can split
Android and iOS device runs. PRE-001H may use one device operator while the organizer
dispatches independent findings, but all writes to the platform seam remain
serialized.

**MVP-PRE-001H execution contract:**

- Start only after PRE-001G has accepted the Android and iOS development-build
  evidence. Record the tested commit, APK/build identity, emulator model, Android API
  level, and exact launch commands.
- Run both clean-install and populated/update scenarios. Exercise startup, database
  migration, manual logging, history, analytics/PBs, calculators, backup/import,
  gallery attachment and playback, and rest-timer/notification paths while capturing
  Metro output, React Native JavaScript logs, Android logcat, crashes, and ANRs.
- The operator classifies every relevant message as a project defect,
  dependency/upstream issue, expected development-only behavior, or emulator/OS
  noise. Accepted exceptions require evidence, rationale, an owner, and a follow-up
  ticket; absence of an observed crash is not sufficient evidence of a clean run.
- The operator is read-only and returns reproducible log signatures and routes to the
  organizer. The organizer gives each repair agent only the reproduction, affected
  symbols/files, expected behavior, and focused verification target. Use Sol for
  native, database, or data-integrity risk; Terra for JavaScript/UI integration; and
  Luna for focused configuration, tests, or documentation.
- Repair agents may edit only the files and symbols explicitly named in their ticket.
  Any additional file, dependency, schema, or data-model change requires a new ticket
  and organizer approval before work proceeds.
- Every project-owned error, unhandled rejection, native exception, database failure,
  and actionable warning is fixed on a separate narrowly scoped branch. This includes
  replacing the already-observed deprecated Expo ImagePicker media-type API. Do not
  combine unrelated findings into one repair ticket.
- After each repair, rerun its focused reproduction. Then rerun the complete Android
  console sweep on the resulting `main` SHA. PRE-001H closes only when no
  project-owned console issue remains and all external noise is explicitly recorded.
- Commit the final command transcript, exercised-route matrix, relevant log
  signatures, repair ticket/commit links, and accepted exceptions before PRE-001R.

### MVP-001: Centralized capability profile and route containment

**Goal:** Keep one codebase while producing an MVP build that cannot enter deferred
features.

**Acceptance criteria:**

- One typed, immutable module is the source of truth for release capabilities.
- Local/full development retains the existing feature set.
- MVP preview and production builds explicitly select the `mvp` profile.
- Programs remains in the tab bar and renders Coming Soon.
- Program authoring/logging, health metrics, and recording routes reject direct and
  deep-link access in the MVP profile.
- Disabled feature cards, buttons, notifications, and background startup work do
  not expose or enter those flows.
- Calculators, manual logging, history, settings, backup, and gallery attachment
  remain accessible.

**Proposed contract:**

```ts
type ReleaseProfile = "full" | "mvp";

type AppCapabilities = {
  programsExperience: "enabled" | "coming-soon";
  healthMetrics: boolean;
  videoRecording: boolean;
  thirdPartyImport: boolean;
  multipleWorkoutSessions: boolean;
};
```

The implementation may refine names but must preserve a single, testable source of
truth. Expo Router protection must exist at route/layout boundaries as well as at
visible entry points.

| Ticket | Subtask | Agent | Write scope | Depends on |
| --- | --- | --- | --- | --- |
| MVP-001A | Implement release-profile parsing, capability map, and unit tests | Terra, medium | `lib/config/**`, focused tests | MVP-PRE-001 |
| MVP-001B | Add reusable route/layout guards and direct-link tests | Terra, high | routing component/hook, `app/_layout.tsx`, route-layout tests | 001A |
| MVP-001C | Replace MVP Programs content with Coming Soon while preserving full-profile screen | Terra, medium | `app/(tabs)/programs.tsx`, extracted program screen if needed | 001A |
| MVP-001D | Remove health and recording entry points and guard their routes | Terra, high | overview/navigation entry points and relevant route wrappers | 001A, 001B |
| MVP-001E | Configure EAS development/full and preview/production MVP profiles | Luna, medium | `eas.json`, configuration tests/docs | 001A |
| MVP-001R | Test the route matrix under both profiles, including direct URLs | Organizer | No feature implementation | 001B-001E |

`app` route files should remain route components; shared gates and capability logic
belong outside `app`.

### MVP-002: Concurrent logging and in-progress broad history

**Goal:** Make the current intentional logging lifecycle consistent across all
history and data consumers.

**Acceptance criteria:**

- Opening an exercise without a real set does not create a visible history item.
- A real set under an open exercise entry appears in broad history and
  exercise-specific history as In Progress.
- Day summaries, day details, search, pagination, set counts, and date filters agree
  on the same inclusion rule.
- Completing an exercise changes its status without creating duplicate set history.
- Editing a completed exercise leaves it completed.
- Selecting the same exercise after completion creates a separate entry.
- An open entry retains its original selected date across midnight.
- Existing PB and analytics behavior for real sets remains immediate.
- Program persistence behavior is not changed by this story.

**Read-model contract:** Broad history includes every `workout_exercises` row that
has at least one linked real `sets` row. Completion controls the displayed status,
not inclusion.

| Ticket | Subtask | Agent | Write scope | Depends on |
| --- | --- | --- | --- | --- |
| MVP-002A | Add lifecycle characterization tests for resume, completion, re-entry, empty drafts, and midnight | Terra, medium | focused workout/record tests only | MVP-PRE-001 |
| MVP-002B | Update all broad-history read queries and return completion status consistently | Sol, high | `lib/db/workouts.ts`, DB tests | 002A |
| MVP-002C | Render In Progress in workout history and day details without changing existing filters | Terra, high | `app/workout-history.tsx`, `app/workout/[dayKey].tsx`, focused UI tests | 002B |
| MVP-002D | Add PB, analytics, and CSV regression tests for in-progress set edit/delete | Sol, high | relevant tests; production analytics/export only if a test exposes a defect | 002B |
| MVP-002E | Update database ground truth and supersede the MVP portion of the old autosave finding | Luna, medium | relevant docs only | 002B-002D |
| MVP-002R | Review raw SQL inclusion, pagination, counts, and date boundaries | Organizer plus Sol audit | Read-only audit | 002B-002D |

The DB worker owns all changes in `lib/db/workouts.ts` for this wave. UI workers do
not duplicate query logic in screens.

### MVP-003: Exercise identity and duplicate display names

**Goal:** Make exercise IDs authoritative in practice by allowing duplicate display
names without data loss or cross-linking the wrong history.

**Acceptance criteria:**

- `exercises.name` is no longer unique in new and upgraded databases.
- Existing exercise IDs, UIDs, parent/variation links, workout entries, sets, media,
  formulas, and program references survive migration unchanged.
- Creating and renaming exercises can produce duplicate display names.
- Selecting, editing, deleting, pinning, and logging an exercise targets its ID.
- Two same-named exercises retain separate history, analytics, PBs, and media.
- Name-only compatibility helpers have explicit deterministic behavior and are not
  used as identity in MVP flows.
- Existing program code continues to compile; redesigning program name resolution
  is deferred.

| Ticket | Subtask | Agent | Write scope | Depends on |
| --- | --- | --- | --- | --- |
| MVP-003A | Produce and test a migration proof for removing the SQLite unique constraint | Sol, xhigh | spike tests/ADR only | MVP-PRE-001 |
| MVP-003B | Implement forward migration, bootstrap/schema alignment, and rollback-on-failure tests | Sol, xhigh | `lib/db/bootstrap.ts`, `lib/db/schema.ts`, bootstrap tests | 003A |
| MVP-003C | Audit and correct exercise DB APIs that infer identity from names | Sol, high | `lib/db/exercises.ts`, focused DB tests | 003A |
| MVP-003D | Remove duplicate-name validation and verify ID-based exercise UI actions | Terra, high | exercise creation/list UI and focused tests | 003B, 003C |
| MVP-003E | Add end-to-end data-isolation fixtures for two identically named exercises | Terra, medium | tests only | 003B-003D |
| MVP-003R | Independently inspect migration SQL, FK preservation, IDs, indexes, and failure recovery | Sol audit, high | Read-only | 003B, 003C |

The migration proof is a hard gate. Do not implement a table rebuild directly on
`main` without first demonstrating it against a populated legacy fixture.

### MVP-004: Set detail, notes, and gallery video

**Goal:** Complete the set-level MVP surface in one file-ownership boundary.

**Acceptance criteria:**

- A user can create, edit, and clear a set note.
- A user can select one video from the gallery and view it from the set.
- Selecting another video replaces the user-facing attachment.
- The attachment stores sufficient gallery metadata for later rediscovery.
- Missing media is reported without damaging or hiding the set.
- Deleting the set removes its media relationship.
- Recording controls are absent in the MVP profile and remain available in full
  development.
- Existing media rows with more than one legacy attachment resolve predictably to
  one user-facing attachment.

| Ticket | Subtask | Agent | Write scope | Depends on |
| --- | --- | --- | --- | --- |
| MVP-004A | Characterize current set-note, gallery, replacement, playback, and rediscovery behavior | Luna, medium | tests and findings only | MVP-PRE-001 |
| MVP-004B | Enforce the one-user-facing-video contract in media helpers | Terra, high | `lib/db/media.ts`, `lib/utils/videoStorage.ts`, focused tests | 004A |
| MVP-004C | Complete set note/media UI and apply the recording capability | Terra, high | `app/set/[id].tsx`, focused UI tests | MVP-001A, 004B |
| MVP-004D | Verify deletion cleanup and unresolved-media presentation | Terra, medium | media cleanup and tests only | 004B, 004C |
| MVP-004R | Device-review gallery permission, replacement, playback, and missing-file states | Organizer | Read-only/manual | 004C, 004D |

This story owns `app/set/[id].tsx`; no other parallel story edits that route.

### MVP-005: Workout and exercise-entry notes

**Goal:** Make the remaining two note levels explicit and durable without changing
the logging lifecycle.

**Acceptance criteria:**

- A user can add, edit, and clear the current exercise-entry note.
- Exercise-entry notes persist while switching among in-progress exercises and
  after restart.
- A user can add, edit, and clear the workout note for the current MVP session
  envelope.
- History displays notes in the existing locations without introducing a new
  filtering model.
- Completing or editing an exercise does not lose either note.
- Backup and restore preserve all three note levels.

| Ticket | Subtask | Agent | Write scope | Depends on |
| --- | --- | --- | --- | --- |
| MVP-005A | Audit current workout and exercise-note UI against the acceptance criteria | Luna, medium | tests/findings only | MVP-002 |
| MVP-005B | Add any missing workout-note DB operation and focused tests | Terra, medium | `lib/db/workouts.ts`, DB tests | 005A, MVP-002 merged |
| MVP-005C | Complete exercise-entry note behavior | Terra, high | `components/exercise/UnifiedRecordTab.tsx`, focused tests | 005A |
| MVP-005D | Complete workout-note editing on the existing workout/history surface | Terra, high | `app/edit-workout.tsx` and/or day route selected by organizer | 005B |
| MVP-005R | Restart, completion, edit, and clear-state review | Organizer | Read-only/manual | 005C, 005D |

The organizer selects one canonical workout-note surface before dispatching 005D;
the worker does not invent a second editor.

### MVP-006: Replacement restore with media reconciliation

**Goal:** Replace merge import with a transactional, failure-safe restore whose
result matches the selected backup.

**Acceptance criteria:**

- The user is clearly warned that restore replaces current data.
- Cancellation and invalid files leave current data untouched.
- A valid restore removes live rows that are absent from the backup.
- IDs/UIDs and relationships remain coherent after restore and migrations.
- All app-owned tables have an explicit restore policy, including tables belonging
  to currently disabled features.
- Derived PB events are rebuilt from restored sets.
- Media rows are restored as links/metadata; video bytes are not embedded.
- Media reconciliation runs after data commit and can produce a non-fatal unresolved
  result.
- Exported backup filenames and MIME types match the advertised `.db` contract and
  round trip through supported Android and iOS pickers.
- A mid-restore failure rolls back to the pre-restore database.
- The app can immediately reopen or deliberately restart into the restored DB.

**Required design decision:** Before implementation, write a short ADR choosing
between an atomic database-file swap and a transactional logical replacement. The
ADR must cover Expo SQLite connection lifecycle, schema compatibility, rollback,
and post-restore migration. Do not assume that overwriting an open database file is
safe.

**Characterization input from PRE-001G:** The current Android path successfully
exports a valid SQLite file through SAF and reopens it through the document picker,
but current import is a non-destructive merge whose success message says existing
data was preserved. The export helper strips `.db` before SAF and the tested provider
did not restore it. A same-database import of development fixtures exported before
their one-time UID backfill inserted 112 workouts, 112 workout-exercise rows, and 112
sets. Preserve both that backup and the pre-import live state as a candidate-ambiguity
fixture for 006A/006E; replacement restore must not inherit these merge semantics.

| Ticket | Subtask | Agent | Write scope | Depends on |
| --- | --- | --- | --- | --- |
| MVP-006A | Build paired backup/live-state fixtures, define the filename/MIME contract, and write the replacement-restore ADR | Sol, xhigh | ADR and tests/fixtures only | MVP-003, MVP-004 |
| MVP-006B | Implement the restore engine and atomic rollback behavior behind a narrow API | Sol, xhigh | `lib/db/backup.ts` or extracted restore module, DB tests | 006A |
| MVP-006C | Integrate media reconciliation and unresolved attachment results | Sol, high | backup/media integration and tests | 006B |
| MVP-006D | Update Settings confirmation, progress, cancellation, and result UI | Terra, high | `app/(tabs)/settings.tsx`, focused UI tests | API contract from 006A; implementation can run parallel with 006B |
| MVP-006E | Add exact-replacement, invalid-backup, rollback, migration, PB, note, media, and filename/MIME tests | Sol, high | backup integration tests only | 006B, 006C |
| MVP-006R | Independent corruption and data-loss audit with failure injection | Sol audit, xhigh | Read-only | 006B-006E |

006D may work against a mocked contract while 006B is in progress. The organizer
owns the interface and resolves integration; the UI agent never edits restore code.

### MVP-007: Release correctness and stabilization

**Goal:** Prove the MVP profile is complete, the full profile remains maintainable,
and the release candidate is safe to tag.

**Acceptance criteria:**

- Full and MVP profile unit/integration suites pass.
- Lint and typecheck pass.
- Existing analytics and calculator tests pass without metric-definition changes.
- An in-progress PB appears immediately and is removed/recalculated after edit or
  deletion.
- History, analytics, PB, CSV, media, and backup agree on real set data.
- Disabled routes are inaccessible in the MVP profile.
- Programs displays Coming Soon and retains its tab position.
- Manual device matrix passes on supported Android and iOS targets.
- Database ground truth and release documentation match shipped behavior.
- The release branch contains no feature work not already on `main`.

| Ticket | Subtask | Agent | Write scope | Depends on |
| --- | --- | --- | --- | --- |
| MVP-007A | Run and extend analytics/PB/history consumer regression tests | Terra, high | tests; production fixes only through a new scoped ticket | MVP-002-006 |
| MVP-007B | Verify all five calculators and their catalog/navigation in MVP | Luna, medium | calculator tests only | MVP-001 |
| MVP-007C | Run profile route matrix and deferred-feature compilation tests | Terra, medium | tests only | MVP-001-006 |
| MVP-007D | Run backup/restore and gallery-media device scenarios | Organizer plus device operator | No unreviewed code | MVP-006 |
| MVP-007E | Reconcile `database-ground-truth.md`, autosave analysis disposition, and release notes | Luna, medium | docs only | 007A-007D |
| MVP-007F | Cut release branch, build candidate, and tag accepted commit | Organizer | release metadata/config only | All prior tickets |

Any production defect found during stabilization becomes a new narrowly scoped
ticket from current `main`; it is not patched directly on the release branch.

## 7. Parallel Execution Waves

### Prerequisite wave: Control plane and platform stabilization

- MVP-000A, MVP-000B, MVP-000C
- MVP-PRE-001A records the SDK 54 baseline after MVP-000 passes.
- MVP-PRE-001B, PRE-001C, and PRE-001D merge sequentially.
- MVP-PRE-001E and PRE-001F complete dependency and custom-native stabilization.
- MVP-PRE-001G, PRE-001H, and PRE-001R approve the SDK 57 baseline.
- Organizer refreshes codebase-memory and pins the accepted baseline SHA. No MVP
  feature implementation branch starts before this gate.

### Wave 1: Independent foundations

Run concurrently in separate worktrees:

- MVP-001A capability contract
- MVP-002A logging lifecycle tests
- MVP-003A duplicate-name migration proof
- MVP-004A set-detail characterization
- Read-only design work for MVP-006 fixtures and restore risks

### Wave 2: Main implementation seams

Run concurrently after their local prerequisites:

- MVP-001B/001C/001E across disjoint route, Programs, and config files
- MVP-002B history read model
- MVP-003B migration and MVP-003C DB API audit in coordinated, non-overlapping
  scopes
- MVP-004B media helper contract

### Wave 3: User-facing integration

- MVP-001D route entry-point removal
- MVP-002C history UI
- MVP-002D analytics/PB regressions
- MVP-003D duplicate-name UI
- MVP-004C set detail UI
- MVP-005A notes audit

### Wave 4: Dependent data work

- MVP-005B/005C/005D after history ownership is released
- MVP-006A restore ADR and fixtures after identity/media contracts merge
- MVP-006B core restore and MVP-006D Settings UI in parallel against the fixed API

### Wave 5: Restore integration and release proof

- MVP-006C/006E and independent audit
- MVP-007A/007B/007C in parallel
- MVP-007D device verification
- MVP-007E documentation
- MVP-007F release cut

## 8. File Ownership Seams

| Seam | Primary owner story | Parallel-safe from |
| --- | --- | --- |
| Dependency manifests, lockfile, app config, Metro/Babel, `android/**`, native patch/plugin scripts | MVP-PRE-001 | Read-only MVP discovery only until prerequisite approval |
| `lib/config/**`, profile tests | MVP-001 | History, identity, media, backup |
| Root/tab routing and Programs tab | MVP-001 | DB-only stories |
| `lib/db/workouts.ts`, history DB tests | MVP-002, then MVP-005 | Identity, media, backup |
| Workout history/day screens | MVP-002, then MVP-005 | Identity, set detail, backup |
| `lib/db/schema.ts`, `bootstrap.ts`, `exercises.ts` | MVP-003 | History UI, media, capability UI |
| Exercise creation/list UI | MVP-003 | History and backup |
| `app/set/[id].tsx`, media/video helpers | MVP-004 | History, identity, capability routes |
| `UnifiedRecordTab.tsx`, workout-note surface | MVP-005 | Backup and release tests |
| Backup/restore modules and Settings import UI | MVP-006 | Notes and release test preparation |
| Cross-feature tests/docs | MVP-007 | Only after owning implementation merges |

The organizer enforces these locks. Two agents must not edit the same high-churn
file in the same wave, even when their requested behavior appears independent.

## 9. Test Strategy

### Per-ticket minimum

- Targeted Jest tests for changed behavior
- `npm run lint`
- `npm run typecheck` once MVP-000 adds it
- Relevant profile-specific tests
- Platform tickets also run `npm ls --depth=0`, `npx expo-doctor@latest`, and the
  native build command appropriate to the changed SDK step.

### Merge-wave gate

- Full Jest suite with serial execution for database-heavy tests
- Lint and typecheck
- Both `full` and `mvp` capability matrices
- Codebase-memory impact check for changed shared functions

### Release gate

1. Use clean Android and iOS development builds as the primary release candidates;
   the custom native plugin and native-module patches cannot be proven in Expo Go.
2. Use Expo Go only for optional JavaScript-only navigation and layout spot checks.
3. Verify Android and iOS gallery permissions, video playback, missing-media state,
   and restore reconciliation on real devices.
4. Test an upgrade from a populated pre-migration database.
5. Test a fresh install.
6. Test restore failure at validation, transaction, and post-commit reconciliation
   stages.

## 10. Definition of Done for Every Story

A story is done only when:

- All story acceptance criteria pass.
- Each merged ticket stayed inside its write scope.
- Targeted and repository-wide checks pass or an accepted baseline exception is
  documented.
- The current/full app compiles; after MVP-001, both profiles compile.
- No deferred feature code was deleted.
- Data changes have upgrade and failure-path coverage.
- The organizer has reviewed the final integrated behavior, not only individual
  ticket diffs.
- Codebase-memory is refreshed and the next wave's ticket symbol references are
  regenerated from the new `main`.

## 11. First Organizer Actions

1. Confirm ownership of current uncommitted files and create a clean baseline
   without stashing or absorbing unrelated work.
2. Commit `docs/mvp-product-facts.md` and this plan as the epic contract.
3. Run MVP-000 baseline checks.
4. Configure branch protections and CI.
5. Execute MVP-PRE-001 one SDK transition at a time and merge each passing step to
   `main`.
6. Approve and pin the SDK 57 baseline only after native patch and device review.
7. Dispatch the five Wave 1 packets from that same pinned `main` commit.
8. Merge MVP-001A first because later UI tickets consume its capability contract.
9. Keep MVP-003 and MVP-006 under high-risk review gates until their populated DB
   and rollback tests pass.
