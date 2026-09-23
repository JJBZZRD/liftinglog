# Android pager lifecycle patch

`react-native-pager-view` 8.0.2 can crash with `Scrapped or attached views may
not be recycled` when an exercise's tab animation overlaps closing its native
stack screen. This was reproduced by opening Analytics, returning to Record,
and pressing Back again before the pager finished moving.

The native stack's `Screen.startTransitionRecursive` calls `startViewTransition`
on descendants. This retains RecyclerView's page containers in their parent
while the pager's `ViewFlinger` can still attempt to remove and recycle them.
Stopping only in `onDropViewInstance` or page removal is too late: the screen's
removal transition has already started.

`scripts/patch-react-native-pager-view.js` applies a small Android-only patch:

- Stop the internal RecyclerView at the pager host's `startViewTransition`,
  before the native stack holds its descendants for the removal animation.
- Stop scrolling before page removal and final disposal as well.
- In `removeAll`, detach React children from their containers; leave ownership
  of the holder containers with RecyclerView.

The patch retains swiping and animated screen/tab navigation. It does not catch
and ignore native exceptions, replace the pager, change holder recycling, or
modify training data.

Related upstream evidence: [issue #1005](https://github.com/callstack/react-native-pager-view/issues/1005)
and [lifecycle work in 2c4ea72](https://github.com/callstack/react-native-pager-view/commit/2c4ea72).
The early transition hook addresses the race reproduced with the narrower
teardown changes alone.

## Installation and upgrades

Both `postinstall` and `npm run verify:native-dependencies` run the patch. Its
version and normalized source hashes are pinned to 8.0.2. All source files are
validated before any writes; unexpected versions, source drift, and incomplete
patches fail visibly. Already patched files are verified without being rewritten.

Rebuild the Android development app after applying the patch:

```sh
npm run verify:native-dependencies
npm run android
```

Reloading Metro alone does not replace compiled Kotlin code. Review or remove
the patch deliberately when upgrading the pager dependency. The fixture-based
test suite is independent of generated Android project files and includes the
upstream MIT license.

## Regression verification

On 2026-09-24, an x86_64 Android development build reproduced the original
exception. A rebuilt app with the full patch passed these checks without a
process restart or new native exceptions:

- Analytics → Back to Record → Back to the exercise library, with 100, 250,
  400, and 600 ms between the two Back presses.
- Three repeated swipe and Android system-Back navigation cycles.
- Four pinned-overlay tab changes followed by closing the overlay and returning
  to Workouts, which unmounts that pager.

The 14 fixture tests, TypeScript check, scoped ESLint check, native dependency
verification, and Android debug compilation passed. No logged training data was
created or changed during these checks. Native runtime verification was Android
only; the patch does not alter iOS sources.
