# Karpathy Guidelines Examples

These examples describe the project-wide anti-patterns this skill is meant to prevent.

## Hidden Assumptions

Weak response: implement a tolerance parsing change without checking whether it affects `MAX`-only, `MIN`-only, bilateral, or note/visual characteristic types.

Better response: trace the change through all branches of `getLimits` and `getStatus`, state which cases are covered, and flag any edge case that could flip a status from `OPEN` to `OK` incorrectly.

## Over-Abstraction

Weak response: build a generic "tolerance strategy" registry or plugin system to handle different tolerance formats.

Better response: add a branch inside `getLimits` for the specific format that needs handling. Extract only when three or more distinct real cases exist and the duplication becomes the actual problem.

## Drive-By Refactoring

Weak response: fix a balloon placement bug while also renaming state variables, reformatting `App.jsx`, and reorganizing the characteristic table rendering.

Better response: change the coordinate mapping in `exportBalloonedPdf`, verify placement visually, and leave all adjacent code intact. Note the unrelated cleanup opportunity in the handoff.

## Verifiable Goals

Weak response: "improve export quality" or "make OCR more reliable" without a measurable path.

Better response: define the observable result (e.g., "balloon at (0.45, 0.72) on page 2 should render within 5px of the intended position in the exported PDF"), run the closest check, and stop when that criterion is met.

## Crossing Architectural Boundaries

Weak response: move characteristic state into a React context provider or add a `fetch` call to a cloud service when the user asks for "persistence."

Better response: keep all state in `App.jsx`. Implement local persistence (e.g., `localStorage` serialization) entirely client-side. Confirm the boundary is intentional before proposing anything that crosses it.

## Unsafe Math Defaults

Weak response: return `OK` when nominal or tolerance fields are empty because "no measurement has failed."

Better response: return `OPEN` whenever limits cannot be determined. A false `OK` on a manufacturing FAI is a trust failure — conservative defaults protect the engineer using the report.
