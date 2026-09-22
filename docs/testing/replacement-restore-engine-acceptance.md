# MVP-006B5 host acceptance

Organiser and independent Sol/high acceptance, 2026-09-22. Exact reviewed SHA
`ef0bc3c64dbe56ad083706de9987f0cd0df70eb9`, based on `5cd72ee`, was exact-tree
squash integrated as `fdd4313`. The worker changed exactly the nine files allowed
by the engine packet. The organiser retained all unrelated dirty/untracked work.

The independent audit rejected the first snapshot and then verified corrections
for stale nonmatching outcomes, stale safe-discard authorization after a later
commit, initial absence at safe-discard entry, malformed current process tokens,
ATTACH acknowledgement ownership, prepublication hash abort and misleading
managed-URI semantics. In the malformed-token case the original strict reread
blocked BEGIN but could leave an invalid durable marker; this was a control-state
lockout risk, not evidence of a malformed-token row commit.

The final audit accepts all corrections. Independent engine/preparation tests
pass **2 suites / 56 tests**, with TypeScript and a clean scope/diff check. The
organiser ran the entire exact-candidate suite: **79 suites / 945 tests in full**
(131.584 seconds) and **79 / 945 in MVP** (106.542 seconds). TypeScript passes;
uncached lint has zero errors and 19 existing warnings. Logs are retained as
`.codex-artifacts/mvp006b5-candidate-{full,mvp}.log`, `mvp006b5-typecheck.log` and
`mvp006b5-lint.log`.

This accepts the seven-method engine and its real-SQL host tests. It does not
enable app import or accept Android passed-handle replacement/process-death,
root/provider ordering, stale timer-link containment, postcommit media completion,
SAF export round trips or the physical release matrix. Those gates remain open.

The URI context is explicitly untrusted and process-local. No media deletion or
completion is implemented here. Private staging can remain after a process dies
between preparation and scheduling; there is no orphan sweep contract. A future
maintenance ticket must not sweep while pending controls are unreadable, infer
ownership from an untrusted control path, or delete a possibly open candidate.

The independently reviewed media packet can now proceed in parallel with the
non-shipping Android engine diagnostic. Lifecycle integration follows the complete
media service and the required native gates. Workers never merge or expand scope.
