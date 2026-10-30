---
description: Root operating guide for QC Assistant.
alwaysApply: true
---

# QC Assistant

## Insight

QC Assistant proves speed and precision for engineering drawing ballooning and first article inspection (FAI) report generation. It is a dedicated manufacturing quality workspace, not a generic PDF annotator. Missing requirements, unparseable tolerances, shifted balloon coordinates, wrong status evaluations (OK/NG/OPEN), or corrupted Excel workbooks directly destroy manufacturing trust and fail customer compliance audits.

## Decision

This repository is a zero-backend, browser-first application. Keep core application state flat and centralized in `src/App.jsx`, keep inspection math pure and deterministic in `src/lib/exporters.js`, and keep all design tokens in `src/styles.css`. Cloud synchronization (`supabase/`, `src/lib/supabaseStore.js`) is strictly opt-in per project; never make authentication or remote network access a requirement for the default local workflow. Build the smallest verifiable slices that directly improve trust, distribution, or activation.

## Repository boundaries

- `src/` owns UI layout, routing, drawing canvas interaction, OCR/text capture, and characteristic table management.
- `src/App.jsx` owns core application state, routes, event handlers, and drawing-to-table coordination.
- `src/lib/` owns pure mathematical engines and data persistence:
  - `src/lib/exporters.js` owns deterministic inspection math (`getLimits`, `getStatus`), PDF balloon coordinate transformation, and Excel AS9102 workbook exports.
  - `src/lib/faiTemplate.js` owns customer Excel FAI template validation, inspection, and filling.
  - `src/lib/occurrences.js` owns repeated-dimension instance management (`5.1..5.N`).
  - `src/lib/projectStore.js` owns IndexedDB local persistence (`qca_projects_v1`).
  - `src/lib/ocrPreprocessing.js` owns contrast stretching and adaptive binarization for OCR.
  - `src/lib/utils.js` and `src/lib/dimensionExtractor.js` own dimension parsing, conversion, and tolerance detection.
  - `src/lib/sampleData.js` owns demo characteristics and seed state.
- `src/components/` owns modular UI components (`panels.jsx`, `widgets.jsx`, `AuthScreens.jsx`, `OnboardingScreen.jsx`).
- `src/context/` owns opt-in cloud authentication state (`AuthContext.jsx`).
- `src/styles.css` owns global design tokens (`:root` variables), layout, and component styling.
- `docs/` owns product specifications, user guides, implementation plans, and delivery contracts.
- `SPEC.md` owns the execution spec, risk-aligned epics, and active issue backlog.
- `WORKFLOW.md` owns the mandatory GitHub issue/project loop and verification contracts.
- `DESIGN.md` owns visual system rules, tokens, typography, and component behavior.
- `supabase/` owns opt-in cloud schema, database migrations, and Edge Functions.
- `scripts/` owns deterministic offline verification and screenshot testing tools.

## Non-negotiables

- Keep inspection math conservative: when limits cannot be determined or are missing, default status to `OPEN`, never `OK`.
- The default workflow must remain 100% offline and client-side (no login, no network fetch required).
- Preserve the centralized state architecture in `src/App.jsx`. Do not introduce reducers or extra external state management libraries without explicit user request.
- Keep inspection math in `src/lib/exporters.js` pure, deterministic, and free of React or DOM dependencies.
- Use CSS tokens from `src/styles.css` (`var(--token)`). Do not inline colors, typography, or arbitrary spacing values.
- Balloon coordinate mapping must preserve exact relative positions (`0..1` fractions) and translate faithfully to PDF points across all page orientations and aspect ratios.
- Do not add npm dependencies without documenting bundle size impact and getting user approval.
- Every change touching inspection math, export logic, or balloon positioning must be verified against edge cases before completion.

## Working rules

For coordinated agent work, follow [the development team guide](docs/delivery/development-team.md). The lead agent owns scope, assignments, integration, and evidence. Act as three roles simultaneously: Product Manager (protect scope and prioritize trust, distribution, or activation), Engineer (ship the smallest reliable implementation), and QC Domain Expert (keep math and inspection status conservative). Keep one implementation writer at a time in the shared checkout, with independent read-only security and QA review. AI review never replaces required human review for production exports or safety-critical drawings.

Read `karpathy-guidelines/SKILL.md`, `WORKFLOW.md`, and `SPEC.md` before substantial work. Make the smallest change that traces to the requested outcome. Follow the mandatory GitHub issue loop in `WORKFLOW.md`: identify or create the issue in `Apillis-MFG/QC-Assistant`, add it to the GitHub Project, move it to `In Progress`, verify against acceptance criteria, and document evidence before moving to `In Review`.

Push back when a task increases scope without improving trust, distribution, or activation:
- **Good work**: PDF text/OCR capture precision, inspection math edge-case handling, export fidelity, time to first report.
- **Weak work**: settings screens before core workflow polish, AI auto-ballooning before deterministic math is proven, cloud sync before local session rock-solidity.

## Inspection & Export scope

Inspection-specific rules apply across `src/lib/exporters.js`, `src/lib/faiTemplate.js`, drawing canvas ballooning, and table entry:

- **Coordinate mapping**: Balloons store normalized `(x, y)` fractions (`0..1`) relative to the drawing canvas. `exportBalloonedPdf` must translate these accurately to PDF points using `page.getSize()`.
- **Data shape integrity**: All characteristics must follow the `createCharacteristic` factory in `App.jsx`. When fields change, update `sampleData.js` and `exporters.js` synchronously.
- **Limit calculation (`getLimits`)**: Compute USL and LSL strictly from nominal ± tolerance with robust handling of bilateral tolerances, unilateral tolerances, MAX/MIN suffixes, and non-numeric types (Note, Visual).
- **Status evaluation (`getStatus`)**:
  - Numeric: `OK` if all sample measurements are within `[LSL, USL]`; `NG` if any sample is out of limits; `OPEN` if samples are incomplete or limits undefined.
  - Visual / Note: Evaluate to `OK` only when explicitly confirmed passed; default to `OPEN`.
- **Excel FAI workbook**: Retain strict column order, limit columns, per-sample columns, and overall status rollups compatible with standard AS9102 / ISO FAI requirements.

## Chat naming

Give every chat/conversation a clear thread title using `<PROJECT>-<NN> | <Task or Subsystem>`. Each thread focuses on one task or subsystem.

This convention applies across Codex, Claude, ChatGPT, and Antigravity chats.

- Use `QCA` for QC Assistant (`QCA-01`, `QCA-02`, `QCA-03`, …). Keep a strictly increasing sequence; do not share or chain numbers across separate projects. Format titles as `QCA-<NN> | <Task or Subsystem>`.
- Inspect existing project chat titles before assigning a number; use the next unused number and preserve an existing thread's number when renaming it.
- Name the current chat once its scope is clear, and apply this convention when the user authorizes creating a new chat. Naming does not authorize creating additional chats.
- Use a specific task or subsystem title. Respect any explicit title supplied by the user.
- If chat management tools or the inventory are unavailable, propose a title without inventing a sequence or claiming it was applied. Do not rename unrelated chats.

QC Assistant examples:

- `QCA-01 | Balloon Placement & Leader Lines`
- `QCA-02 | PDF Coordinate Mapping`
- `QCA-03 | Excel FAI Export Formatting`
- `QCA-04 | OCR Tolerance Parsing`
- `QCA-05 | Inspection Math Verification`
- `QCA-06 | Drawing Canvas Pan & Zoom`
- `QCA-07 | Characteristic Table Editing`

## Chat shortcuts

Treat a user message beginning with a shortcut below as a request to execute its mapped task. Match names case-insensitively; text after the shortcut supplies the target, constraints, or acceptance criteria. These are project prompt aliases, not shell commands or native chat UI commands. Follow the full templates and defaults in [the request library](docs/delivery/reusable-requests.md).

| Shortcut | Task and default target | Sample invocation |
| --- | --- | --- |
| `/Whatnext` | Read-only current-state review; recommend one next achievable slice and acceptance checks | `/Whatnext focus on export fidelity` |
| `/Explain` | Read-only code-backed explanation of the supplied component or behavior | `/Explain getLimits handling of unilateral MAX/MIN tolerances in src/exporters.js` |
| `/Investigate` | Read-only investigation of the supplied symptom; evidence, likely cause, and smallest fix | `/Investigate balloon coordinates shifting on landscape drawings` |
| `/Build` | Implement the supplied behavior within stated scope; verify against acceptance criteria | `/Build leader line arrowheads for balloon placement` |
| `/Fix` | Reproduce and minimally fix the supplied failure; verify regression behavior | `/Fix getStatus evaluating empty sample rows as OK instead of OPEN` |
| `/Test` | Run the smallest relevant workflow checks for the supplied target or current diff; no source edits | `/Test exporters.js math verification and run pnpm build` |
| `/Addtests` | Inspect coverage and add missing contract-derived tests or verification scripts; run affected checks | `/Addtests script for drawing unit conversions and tolerance limits` |
| `/Review` | Read-only code audit of the supplied target or current working-tree diff and affected call paths | `/Review working tree diff against flat state and CSS token rules` |
| `/Security` | Read-only security and data privacy review of the supplied target or diff against client-side boundaries | `/Security verify drawing PDF and characteristics remain client-side only` |
| `/QA` | Read-only acceptance assessment of the supplied slice or current changes; pass/fail/pending with evidence | `/QA verify repeated dimension ballooning and table sync` |
| `/Release` | Read-only assessment of the current branch against export fidelity and production build gates | `/Release evaluate develop branch against production build and export gates` |
| `/Team` | Explicitly coordinate agents for the supplied outcome using the team guide, one writer and independent reviewers | `/Team coordinate multi-page PDF navigation and balloon persistence` |
| `/Status` | Current task outcome, blocker, and next action in three bullets; reconstruct from evidence when session context is absent | `/Status` |
| `/Handoff` | Session outcome, changed files, actual checks, open findings, branch state, and copyable resume prompt; no edits or commits | `/Handoff` |

Do not guess a missing feature, failure, or test behavior. For shortcuts requiring a target, use established conversation context; otherwise ask one concise clarification. If a review/test shortcut has no diff or usable target, report that and request a target. `/Build` and `/Fix` authorize their scoped edits; `/Team` authorizes delegation for its scoped task. No shortcut waives verification or authorizes unrelated external actions.
