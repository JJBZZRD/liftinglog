# PSL UI Coverage Plan

Last updated: 2026-03-01

## Goals
- Full PSL v0.2 **authoring coverage** via a PSL (YAML) editor + helper snippet insertions.
- A guided builder remains a fast path for common programs, with a clear “Edit PSL” escape hatch.
- Programs are **template-first**: users can save programs without start/end dates and activate later.

## Key Definitions
### Template PSL
The stored PSL YAML string in `psl_programs.psl_source`. It may omit `calendar:` and still be useful as a template.

### Activation Context
Dates stored on the program row (`psl_programs.start_date` / `psl_programs.end_date`) and applied at compile/materialize time (as an override).

### Effective PSL for Compile
`Template PSL` + `Activation Context` merged into the parsed document **before** `validateAst()` runs.

## Invariants to Respect (PSL)
- If any session uses `schedule`, `calendar` is required.
- If repeating schedules are unbounded (no `end_offset_days`), `calendar.end_date` is required.
- With `blocks`, `calendar.end_date` is derived from total block duration when omitted.

## Coverage Matrix (track per surface)
Legend: ✅ supported, ⚠️ partial / awkward, ❌ not supported

| PSL feature area | Guided Builder | PSL Editor | Templates | Activation | Logging UI |
|---|---:|---:|---:|---:|---:|
| Template-first (no dates required) | ✅ | ✅ | ✅ | ✅ | n/a |
| Activation context merge | ✅ | ✅ | ✅ | ✅ | n/a |
| Program metadata (id/name/desc/author) | ⚠️ | ✅ | ✅ | ✅ | n/a |
| Calendar (start/end/timezone) | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ |
| Structure: sessions vs blocks | ❌ | ✅ | ⚠️ | ✅ | n/a |
| Session schedules (weekdays/interval/offsets) | ⚠️ | ✅ | ⚠️ | ✅ | ✅ |
| Multi-session per day (`slot`) | ❌ | ✅ | ⚠️ | ✅ | ⚠️ |
| Groups (superset/circuit/giant_set) | ❌ | ✅ | ⚠️ | ✅ | ❌ |
| Exercise identity/aliases/tags/family | ❌ | ✅ | ⚠️ | ✅ | ❌ |
| Substitutions | ❌ | ✅ | ⚠️ | ✅ | ❌ |
| Warmups | ❌ | ✅ | ⚠️ | ✅ | ❌ |
| Set work types (reps/time modes) | ❌ | ✅ | ⚠️ | ✅ | ❌ |
| Intensity union (percent/rpe/rir/load/range/role-based) | ⚠️ | ✅ | ⚠️ | ✅ | ⚠️ |
| Progression (increment/weekly/auto_adjust) | ⚠️ | ✅ | ⚠️ | ✅ | ❌ |
| Constraints/repeat/termination | ❌ | ✅ | ⚠️ | ✅ | ❌ |
| Units + rounding policies | ⚠️ | ✅ | ⚠️ | ✅ | ❌ |

## Milestones
### Phase 0 — Activation context plumbing
- [x] Add `compilePslSource(source, { calendarOverride })` to merge activation calendar into parse result before validation.
- [x] Add activation date utilities (`DEFAULT_ACTIVATION_WEEKS`, `computeEndDateIso`, defaults).

### Phase 1 — Activation UX
- [x] Activation prompt (start date + horizon weeks when needed).
- [x] Store activation dates on program row and materialize calendar entries.

### Phase 2 — Templates become templates
- [x] Templates: “Add to My Programs” (inactive), “Activate” (prompts), “Edit PSL” (opens editor).
- [x] Preview uses preview activation dates for compilation only.

### Phase 3 — PSL Editor
- [x] New `/programs/create/editor` screen with YAML editor + diagnostics.
- [x] Preview/Activation Dates panel (used for preview and for Save & Activate).
- [x] Helper snippet inserter menu.

### Phase 4 — Guided builder improvements (optional, iterative)
- [x] Align language in UI with PSL semantics (sessions vs blocks, day vs schedule).
- [ ] Expand guided schedule support (weekdays multi-select, interval days, fixed day, slot).

### Phase 5 — Compatibility warnings + logging guardrails
- [x] Add compatibility report (warn for constructs not fully supported in logging UI).
- [ ] Logging UI should not misinterpret non-load targets as numeric weight defaults.

## References
- PSL invariants + quick map: `node_modules/program-specification-language/AI_CONTEXT.md`
- PSL type definitions: `node_modules/program-specification-language/dist/ast/types.d.ts`
- PSL validator behavior: `node_modules/program-specification-language/dist/validate/validateAst.js`
