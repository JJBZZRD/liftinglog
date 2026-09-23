# MVP-007H: Android exercise-tab swipe crash

Status: open, 2026-09-23. Inspected source baseline `822db11`; no production or
dependency correction has been accepted for this finding.

## User report and classification

The user's native build succeeded in 1m 23s. Metro could not deserialize its disk
cache, fell back to a full crawl, then successfully bundled 3010 modules. That
recoverable cache warning is separate from the later fatal Android exception.

The user confirmed that the crash occurred while swiping between exercise tabs.
The exception is `IllegalArgumentException: Scrapped or attached views may not be
recycled`, with `isScrap:false isAttached:true`, a ViewPager2 RecyclerView and
`com.reactnativepagerview.ViewPagerAdapter`. Its stack proceeds through
`recycleViewHolderInternal`, `removeAndRecycleViewAt`, `recycleViewsFromEnd`,
`scrollHorizontallyBy` and `ViewFlinger.run`.

Installed versions match the manifest/lockfile: Expo 57.0.24, React Native 0.86.3,
react-native-pager-view 8.0.2, react-native-tab-view 4.2.2 and
react-native-screens 4.26.2. The source was not changed during investigation.

## Independent source review

The organiser inspected `ExerciseModalScreen` in `app/exercise/[id].tsx`, its stable
Record/History/Analytics route keys, render callback, availability gate and swipe
context. A separate read-only Sol/high reviewer inspected the installed native
adapter and upstream primary sources.

- [Pager issue 1005](https://github.com/callstack/react-native-pager-view/issues/1005)
  contains the same recycling/fling stack. This establishes a matching reported
  failure, not a proven root cause or patch for this app.
- The native exception concerns the ViewHolder container still having a parent
  when RecyclerView attempts to recycle it. The installed adapter's child/holder
  lifecycle deserves investigation; the stack alone does not identify which
  operation created the inconsistent state.
- Upstream [2c4ea72](https://github.com/callstack/react-native-pager-view/commit/2c4ea72)
  and [402c690](https://github.com/callstack/react-native-pager-view/commit/402c690)
  are experimental lifecycle fixes, not an accepted local correction.
- Releases 8.0.3 and 8.0.4 list iOS corrections; no Android resolution was
  established from those release notes. Do not upgrade merely because they exist.
- `offscreenPageLimit` is accepted by TabView's TypeScript type but is not forwarded
  by installed TabView 4.2.2. Adding that prop alone to the app has no effect.
- Disabling swipe plus animation would be a temporary interaction change, not a
  root-cause repair. No such change has been made.

## Local observation and next gate

The organiser reopened the existing development client on Pixel_9_Pro_XL,
`emulator-5554`, using the user's localhost Metro server. The app survived 32
initial and 80 subsequent ADB swipe attempts across the exercise pager; PID 4221
remained alive. This is failure-to-reproduce evidence, not proof of correctness.
No sets were edited/deleted, no backups were restored, and no native build, cache
reset or dependency change was performed by the organiser.

Next ticket is a bounded reproduction/repair investigation. Preserve the existing
worktree and user data. Capture a timestamped native crash log and the exact
sequence of swipe, chart-detail open/close, route exit/re-entry and reload events.
Use a separate test package/worktree for any candidate native patch. A worker owns
only an organiser-approved pager patch/config scope, with no DB/history SQL edits.
The organiser must review the exact patch, build it, verify repeated swipe and
teardown behavior, and check both capability profiles before integration.

MVP-007 acceptance remains open independently of the earlier physical gallery
findings. A Metro `--clear` restart is cache maintenance and cannot establish that
this native crash is fixed.
