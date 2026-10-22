# QC Assistant Development Team Guide

This guide establishes the coordination model for multi-agent or role-based development in the QC Assistant workspace.

## Roles

Every task balances three perspectives:

1. **Product Manager (Lead)**:
   - Owns scope, boundaries, and acceptance criteria.
   - Rejects scope creep unless it directly improves **Trust** (inspection math, export accuracy), **Distribution** (submittable PDF/Excel quality), or **Activation** (time to first export).
   - Approves work items and keeps them aligned with `SPEC.md` and GitHub Project boards.

2. **Implementation Writer**:
   - Only one writer operates in the repository checkout at a time.
   - Ships the smallest surgical implementation fitting the existing flat React architecture (`src/App.jsx`).
   - Respects design tokens in `src/styles.css` and keeps `src/exporters.js` math pure and deterministic.

3. **QA & Inspection Reviewer**:
   - Independent verification against manufacturing and QC requirements.
   - Checks edge cases: bilateral tolerances, unilateral tolerances, MAX/MIN limits, empty samples, non-numeric rows (Note/Visual).
   - Verifies coordinate transforms and balloon alignment on PDF export.

4. **Security & Privacy Auditor**:
   - Ensures the default local workflow remains completely client-side (no data leakage, no forced auth).
   - Audits any changes to Supabase schema, RLS policies, or authentication tokens.

## Single Writer Rule

To avoid conflicting changes in flat files like `src/App.jsx` and `src/styles.css`:
- Only one agent may make file edits during an implementation slice.
- Reviewer agents operate in read-only mode to critique diffs, evaluate math edge cases, and run checks.
- Changes are verified with `pnpm build` and domain test scripts before handoff.

