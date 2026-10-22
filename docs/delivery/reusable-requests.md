# QC Assistant Reusable Requests

This library defines the prompt alias templates and expected behaviors for QC Assistant chat shortcuts. Match names case-insensitively.

---

## `/Whatnext`

**Intent**: Read-only current-state review; recommend the single next achievable slice aligned with trust, distribution, or activation.

**Default Target**: Current workspace state, active spec (`SPEC.md`), and issue backlog.

**Template**:
```text
Review current repository state and recommend the next smallest shippable slice.
- Highlight which pillar it improves: Trust, Distribution, or Activation.
- State clear acceptance criteria and verification steps.
- Do not make source edits.
```

---

## `/Explain`

**Intent**: Read-only code-backed explanation of the specified component, math rule, or workflow.

**Default Target**: Supplied component, function, or file (e.g. `src/exporters.js`, `getLimits`, `src/App.jsx`).

**Template**:
```text
Explain the behavior, edge cases, and call paths for: <TARGET>.
- Reference exact line numbers and logic branches.
- Identify invariants and failure modes.
- Do not make source edits.
```

---

## `/Investigate`

**Intent**: Read-only investigation of a reported symptom or defect; provide evidence, root cause, and minimal fix proposal.

**Default Target**: Reported bug or symptom.

**Template**:
```text
Investigate the following symptom: <SYMPTOM / TARGET>.
- Trace the execution path through code and data flow.
- Identify the root cause with direct evidence.
- Propose the minimal surgical fix and verification checks.
- Do not make source edits until confirmed.
```

---

## `/Build`

**Intent**: Implement the requested feature or enhancement within the scoped boundaries; verify against acceptance criteria.

**Default Target**: Specified feature, component, or enhancement.

**Template**:
```text
Implement the requested behavior: <TARGET>.
- Keep changes surgical and local to the owning subsystem.
- Preserve flat state in `App.jsx` and pure math in `exporters.js`.
- Use CSS tokens from `styles.css`.
- Verify build and behavior thoroughly.
- Report changed files and verification evidence.
```

---

## `/Fix`

**Intent**: Reproduce and fix an identified defect with the smallest viable diff; verify regression behavior.

**Default Target**: Specific bug, failing check, or math edge case.

**Template**:
```text
Fix the identified failure: <TARGET>.
- Apply the smallest surgical correction.
- Verify that the regression is resolved without side effects.
- Verify all affected math branches or coordinate calculations.
- Report diff and verification results.
```

---

## `/Test`

**Intent**: Run the smallest relevant workflow checks and verification scripts for the target or working tree; no source edits.

**Default Target**: Affected files, `pnpm build`, or verification scripts in `scripts/`.

**Template**:
```text
Run verification checks for: <TARGET or current diff>.
- Check build integrity and script checks.
- Test conservative math limits and status evaluation if touched.
- Report pass/fail status with full output details.
- Do not make source edits.
```

---

## `/Addtests`

**Intent**: Inspect test coverage and add deterministic verification scripts or contract tests for the specified behavior.

**Default Target**: Untested logic in `src/exporters.js`, unit parsing, or coordinate transformation.

**Template**:
```text
Add deterministic verification coverage for: <TARGET>.
- Cover standard paths, boundary conditions, and edge cases.
- Follow existing patterns in `scripts/` or `src/`.
- Run the new checks and confirm they pass.
```

---

## `/Review`

**Intent**: Read-only code audit of the target or working tree diff against project rules and architecture boundaries.

**Default Target**: Current git diff or specified file/module.

**Template**:
```text
Perform a thorough code review of: <TARGET or current diff>.
- Check architecture rules: flat state, pure math, CSS tokens, zero unexpected dependencies.
- Check edge-case handling (null values, MAX/MIN tolerances, zoom scaling).
- Note any potential regressions or trust violations.
- Do not make source edits.
```

---

## `/Security`

**Intent**: Read-only security and data privacy assessment against zero-backend and local storage boundaries.

**Default Target**: Current diff or cloud/auth boundary (`supabase/`, `src/lib/supabaseStore.js`).

**Template**:
```text
Review security and data privacy boundaries for: <TARGET>.
- Confirm default local session remains 100% offline and leak-free.
- Verify drawing PDFs and characteristic data stay in local browser memory unless explicitly shared.
- Verify RLS policies and Supabase auth checks if cloud functions are touched.
- Do not make source edits.
```

---

## `/QA`

**Intent**: Read-only acceptance assessment of a completed slice against user requirements and acceptance criteria.

**Default Target**: Completed feature or current working branch.

**Template**:
```text
Perform QA acceptance assessment for: <TARGET>.
- Validate against user stories, acceptance criteria, and visual rules.
- Test edge cases (extreme dimensions, empty inputs, non-standard PDF formats).
- Output verdict: PASS, FAIL, or PENDING with explicit evidence.
```

---

## `/Release`

**Intent**: Read-only assessment of release readiness against build gates, export fidelity, and documentation.

**Default Target**: Current branch candidate.

**Template**:
```text
Assess release readiness for candidate: <BRANCH / COMMIT>.
- Verify clean build (`pnpm build`).
- Verify PDF balloon burning and Excel FAI report generation integrity.
- Check documentation completeness (`README.md`, `SPEC.md`, `USER_GUIDE.md`).
- Output release decision and remaining risks.
```

---

## `/Team`

**Intent**: Explicitly coordinate multi-role agent work (Product Manager, Implementation Writer, QA Reviewer) for complex tasks.

**Default Target**: Complex feature epic or cross-cutting refactor.

**Template**:
```text
Coordinate agent execution for: <TASK>.
- Maintain one writer in the codebase with independent reviewers.
- Ensure scope stays locked to trust, distribution, or activation.
- Deliver unified verification evidence before closing.
```

---

## `/Status`

**Intent**: Produce a concise 3-bullet summary of the current task outcome, blocker, and immediate next action.

**Default Target**: Current session or git working directory.

**Template**:
```text
Provide current status in three bullets:
- Outcome: what was achieved or verified.
- Blocker: current impediment or open question (or "None").
- Next Action: immediate next achievable step.
```

---

## `/Handoff`

**Intent**: Summarize session outcome, changed files, checks run, open findings, branch state, and a copyable resume prompt; no edits.

**Default Target**: Current session end state.

**Template**:
```text
Generate a clean session handoff:
- Summary of changes and outcomes.
- List of modified and untracked files.
- Actual verification checks run and results.
- Open risks or unfinished items.
- Copyable prompt to resume work in a new thread.
```

