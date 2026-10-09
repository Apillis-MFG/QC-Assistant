# Repeated-dimension sub-balloons — implementation plan

Date: 2026-10-08  
Product: QC Assistant  
Status: Local implementation ready for review; cloud occurrence support deferred
Documentation issue: [#28](https://github.com/Apillis-MFG/QC-Assistant/issues/28)

## Outcome and product rationale

An engineer captures a repeated requirement such as `3X Ø10 ±0.1`, confirms quantity 3, and creates inspection rows `5.1`, `5.2`, `5.3` with matching drawing balloons. Each occurrence has independent measurements for each inspected part. The next unrelated requirement receives base number `6`.

- Trust: each physical occurrence has an identifiable measurement record.
- Distribution: drawing balloons and Excel report identifiers match.
- Activation: engineers avoid copying requirements and manually maintaining identifiers.

Quantity means feature locations on one part. Sample count means inspected parts. For quantity 3 and sample count 5, create three rows with five measurement cells each: 15 measurements total.

The local implementation follows this plan in [#29](https://github.com/Apillis-MFG/QC-Assistant/issues/29), with slices [#30](https://github.com/Apillis-MFG/QC-Assistant/issues/30), [#31](https://github.com/Apillis-MFG/QC-Assistant/issues/31), and [#32](https://github.com/Apillis-MFG/QC-Assistant/issues/32). Cloud occurrence support remains deferred: cloud drawings disable expansion, and local projects containing repeated requirements cannot be shared. No migration or deployment accompanies this implementation.

## Lessons from SOLIDWORKS Inspection

The standalone application documents creating a table row per instance, then placing additional sub-balloons interactively. Placing `2.2` converts the existing balloon `2` to `2.1`. Adopt the separation between instance records and balloon placement.

Source: [Official Create and Place Sub-Balloons documentation, 2018](https://help.solidworks.com/2018/english/WhatsNew/t_inspection_create_place_sub_balloons.htm).

The add-in documents two grouping presentations: separate balloon and characteristic identifiers such as `13.1–13.3`, or a shared drawing balloon `13` with characteristic identifiers `13.1–13.3`. Build separate sub-balloons first; reserve shared-balloon presentation for later.

Source: [Official Grouping Characteristics documentation, 2024](https://help.solidworks.com/2024/english/SWInspectionAddIn/t_grouping_characteristics.htm).

SOLIDWORKS also documents preventing automatic renumbering to avoid confusion when requirements are removed. Prefer stable identifiers and deliberate renumbering over silent identifier changes.

Source: [Official What's New, 2017 — preventing automatic renumbering](https://files.solidworks.com/Supportfiles/Whats_new/2017/English/whatsnew.pdf).

These sources establish the documented behaviors in those versions. They do not establish SOLIDWORKS's internal storage model or synchronized requirement-edit behavior. The model and edit rules below are QC Assistant design decisions.

## Current code findings

The repository has evolved beyond the flat structure described in some project guides. Use the actual existing files; avoid unrelated restructuring.

| File / function | Current behavior | Planned change |
| --- | --- | --- |
| `src/lib/utils.js` / `parseDimension` | Removes integer `x`, `X`, or `×` prefixes and loses quantity | Return quantity alongside nominal/tolerance |
| `src/App.jsx` / `createCharacteristic` | One row, UUID, integer balloon number, coordinates, samples | Add occurrence metadata and explicit placement state |
| `src/App.jsx` / manual click and reviewed auto-balloon creation | Creates one row per requirement/candidate | Preserve suggested quantity; expand only on an explicit action |
| `src/App.jsx` / `updateCharacteristic` | Updates one row | Propagate shared requirement fields within repeated-dimension groups |
| `src/App.jsx` / `reassignBalloonNo` | `parseInt` plus one-row number swap | Reassign base numbers for whole groups |
| `src/lib/autoBalloon.js` / numbering helpers | Numeric maximum plus one; dense row renumbering | Base-number allocation and group-aware ordering |
| `src/components/panels.jsx` and `widgets.jsx` | Direct balloonNo display, numeric inputs, numeric sorting | Derived labels, quantity controls, group-aware base editing |
| `src/lib/projectStore.js` | Stores characteristic arrays without stripping added fields | Normalize legacy records on load and persist placement/group metadata |
| `src/lib/exporters.js` | Numeric sorting; PDF sizing based on balloonNo > 99 | Derived labels, tuple sorting, label-width fitting, text Excel IDs |
| `src/lib/supabaseStore.js` and characteristic migrations | Server assigns one integer per row; explicit field mapping | Group-aware allocation, schema, mapping, reconciliation, and realtime |

Observed review probes:

- `parseDimension('3X Ø10 ±0.1')` returns nominal `10` and tolerance `±0.1`, without quantity.
- Feeding labels `5.1`, `5.2`, `5.3` into the current next-number helper yields `6.3`.
- Current dense renumbering replaces those labels with `1`, `2`, `3`.
- Numeric conversion treats `5.10` and `5.1` as equal.

## First-version user flow

1. Capture or manually enter a requirement. Show editable **Quantity**, default 1; suggest an unambiguous detected repeat count.
2. Engineer selects **Create N instances**. Convert the existing placed row to instance 1 and create the remaining rows with empty measurements. Do not silently expand during typing or OCR capture.
3. Existing balloon `5` becomes `5.1`. Begin guided placement for `5.2`, then `5.3`; display the current identifier and remaining count.
4. Each click identifies the target feature. Use existing leader/balloon positioning behavior; allow later dragging of each balloon and target.
5. Escape or switching tools stops placement without deleting rows. Show unplaced rows and offer **Resume placement**. Reopening the drawing retains their placement state.
6. Measurement mode presents one row per occurrence. Requirement values stay shared; measurements and notes remain independent.
7. Export matching PDF and Excel identifiers. The next new requirement receives base number `6`.

Do not infer the physical locations of repeated features from the quantity prefix. The engineer assigns them. Quantity recognition must not mistake a multiplication or thread-pitch expression for a repeated-feature count; use a leading integer quantity followed by a valid dimension and retain manual correction. Split PDF text items and fragmented OCR may miss the prefix; fallback to manual quantity rather than guessing.

## Proposed data model

Keep the existing flat characteristic array and application state in `App.jsx`. Store each occurrence as a row so the existing measurement and status functions can continue evaluating individual rows.

```js
{
  id: 'occurrence-uuid',
  balloonNo: 5,
  groupId: 'requirement-group-uuid',
  quantity: 3,
  occurrenceIndex: 1,
  instancesExpanded: true,
  isPlaced: true,
  page: 1,
  x: 0.5,
  y: 0.4,
  targetX: 0.45,
  targetY: 0.45,
  type: 'dimension',
  unit: 'MM',
  nominal: '10',
  tolerance: '±0.1',
  method: 'DC',
  notes: '',
  samples: {}
}
```

- `balloonNo` is the integer base. Labels are derived strings: `5` before expansion, `5.1` after expansion.
- `quantity` retains the intended count, including before expansion. `instancesExpanded` distinguishes an unexpanded count suggestion from actual occurrence rows.
- `groupId` is stable across number changes. Generate it once on legacy normalization and persist it; never regenerate during rendering.
- Sort by base number, then integer occurrence index: `5.9`, `5.10`, `5.11`, `6`.
- Existing records normalize to quantity 1, occurrence index 1, unexpanded, and placed, preserving old labels and measurements.
- Unplaced rows have `isPlaced: false`. Coordinates alone do not prove placement; the current factory supplies default coordinates.
- Shared fields: base number, quantity, expansion state, type, unit, nominal, tolerance, method. Update these atomically for all group members, including bulk default-tolerance application.
- Independent fields: row UUID, occurrence index, samples, notes, page, placement flag, balloon coordinates, target coordinates.
- Preserve the original row UUID and samples when expanding. Never copy its measurements into new instances.
- Grouping is specifically repeated instances of the same requirement. Generic grouping of unrelated dimensions/GD&T is deferred.

## Numbering, deletion, and inspection safety

- Expansion consumes one base number regardless of quantity.
- Reassigning a base number moves the whole group. If occupied, swap whole groups using the current number-swap concept; prevent duplicate base/index pairs.
- Preserve other identifiers on deletion. Recommended scope: stable numbering for all local characteristics, with any explicit renumber action operating by group. Record this behavior change in the implementation issue; do not accidentally apply dense row renumbering to occurrences.
- First version deletes a repeated requirement as a whole group. Quantity reduction removes only trailing instances and requires confirmation if those rows contain measurements or notes. Retained instances keep their IDs, measurements, and positions.
- Increasing quantity appends empty, unplaced instances. Returning to quantity 1 restores the base label after confirming any removed inspection data.
- Required instances must exist before the group can be complete. An unexpanded quantity greater than 1 must remain visibly incomplete; do not report PASS from one measured row.
- Keep dimensional math unchanged. Every occurrence passes through existing `getLimits` / `getStatus`; the group is NG if any instance is NG, otherwise OPEN if any required instance is missing/incomplete, otherwise OK.
- Placement completeness is separate from measurement status. Block ballooned PDF export while required instances are unplaced and direct the engineer to resume placement. Excel can retain every required row, including blank measurements, with OPEN status where appropriate.
- Apply the same completeness checks to the UI, persisted drawing status, and Excel overall result.

## Delivery slices

Each slice needs its own implementation issue with acceptance criteria and trust/distribution/activation rationale. Do not release intermediate slices with broken exports or silently lossy cloud saves.

### 1. Local occurrence model and manual expansion

Add normalization, label/sort helpers in existing modules, quantity controls, explicit expansion, group requirement edits, independent sample updates, base reassignment, safe count changes, stable deletion, and local save/reload. Update demo seeds if needed.

### 2. Guided placement and exports

Add placement state and resume behavior, sub-balloon rendering and label fitting, unplaced-instance visibility, PDF export guard, one Excel row per occurrence with text identifiers, and completeness-aware overall status. Keep placement coordinates in the existing normalized page coordinate system.

### 3. Quantity capture

Preserve leading repeat counts in `parseDimension` and carry them through highlighted-dimension seeds, nearest-text capture, nominal capture, and reviewed auto-balloon candidates. Confirm quantity before expansion. Do not broaden automatic geometry recognition.

### 4. Existing opt-in cloud compatibility

The current database has integer `balloon_no` with unique `(drawing_id, balloon_no)`. Saving currently allocates a new integer for each row; adding client fields alone will lose the grouping.

Plan a migration with group identity, quantity, occurrence index, expansion/placement flags, and uniqueness on `(drawing_id, balloon_no, occurrence_index)`. Backfill existing rows as single-instance groups. The allocator must allocate once per new group, and concurrent group creation/expansion must preserve uniqueness and completeness through a server transaction. Retain access checks and server-authoritative numbering.

Update row mappings, save reconciliation, local-to-cloud sharing conversion, ordering, and realtime handlers. Base reassignment must also become group-aware and atomic; the current saver intentionally preserves existing server numbers. Review stale-client writes and deployment order before enabling cloud groups.

If cloud support is deferred, explicitly disable grouped expansion for cloud drawings and prevent sharing local grouped drawings. Explain why in the UI; never silently flatten groups or discard metadata. Keep the local no-login workflow available.

### Deferred

Shared-balloon presentation, generic multi-characteristic grouping, arbitrary sub-number editing, automatic feature-location detection, CAD integration, and new dependencies. Existing drawing-version-management deferral remains in effect.

## Acceptance and verification checklist

- [ ] `3X Ø10 ±0.1` at base 5 creates exactly `5.1`, `5.2`, `5.3`; next base is 6.
- [ ] Quantity 1 retains existing behavior and label; manual quantity works without text detection.
- [ ] Test `2x10.0`, `3X Ø10 ±0.1`, `4× R25`, and 12 occurrences; invalid/ambiguous prefixes do not silently expand.
- [ ] `5.9`, `5.10`, `5.11`, `5.12`, `6` sort correctly in UI and Excel.
- [ ] Requirement edits propagate across the group; sample/note/position edits affect only the selected occurrence.
- [ ] Existing measurements stay on instance 1 after expansion; new rows are empty.
- [ ] Interrupted placement and reload preserve completed positions and remaining instances; PDF export requires all placements.
- [ ] Quantity increases append rows; decreases warn before data loss and preserve retained IDs/data.
- [ ] Deletion and base swaps operate by group without duplicates or silent renumbering of unrelated requirements.
- [ ] One failed occurrence makes overall FAIL; one incomplete required occurrence prevents PASS; indeterminate limits remain OPEN.
- [ ] Legacy local projects reload without label/data changes; grouped projects retain all metadata across save/reload.
- [ ] Visually inspect exported PDF labels/leader positions on multiple pages, including long labels such as `105.12`; screen and PDF labels remain readable.
- [ ] Open Excel and inspect text IDs, occurrence ordering, per-sample values, USL/LSL, MIN/MAX, and overall status.
- [ ] Cloud-enabled release verifies save/reload, local-to-cloud conversion, realtime, concurrent creation/expansion, and group reassignment; deferred cloud support uses explicit guards.
- [ ] Run `pnpm build` after implementation. Use focused regression probes/tests for numbering and group mutations without adding dependencies unless agreed.
- [ ] Since exports change, verify existing math branches: bilateral, MAX-only, MIN-only, null nominal, note/visual, empty and partially filled samples. Avoid unrelated math fixes in this feature.

## Development handoff

Start with manual quantity and expansion; complete placement and exports before release. Then wire quantity suggestions into capture. Resolve cloud support versus explicit guards before enabling sharing of grouped drawings.

Follow `WORKFLOW.md` for each implementation slice. Keep state in `App.jsx`, deterministic inspection math in `src/lib/exporters.js`, and CSS tokens in `src/styles.css`. This document records the design; the verification record below describes checks actually performed.


## Implementation verification — 2026-10-09

Branch: `feature/repeated-dimension-balloons`.

Implemented the local occurrence model, explicit quantity expansion/resizing, shared requirement edits, independent inspection fields, group base swaps, stable deletion, resumable placement, capture suggestions, PDF placement guard, Excel text identifiers, and completeness-aware overall status. Pure occurrence helpers live in `src/lib/occurrences.js`; application state remains in `App.jsx` and inspection evaluation remains in `src/lib/exporters.js`.

Unexpanded quantity suggestions export every intended occurrence to Excel, including empty required rows; overall result stays OPEN unless a recorded measurement already fails. PDF export requires explicit expansion and all placements. Quantity controls accept 1–1000 locations. Expanded table rows display derived identifiers; edit the integer group base in the inspector.

Verification passed:

- `corepack pnpm --config.verify-deps-before-run=never build` (the pnpm executable is absent from PATH; this runs the configured Vite build without reinstalling dependencies).
- `node scripts/verify-repeated-dimensions.mjs`: quantity parsing/ambiguity, legacy normalization, labels/tuple sorting, expansion/resizing, IDs and measurements, group swaps/renumbering, missing-instance status, PDF/cloud guards, numeric MAX/MIN/null/partial sample and note/visual branches.
- `node scripts/verify-unit-parsing.mjs`: existing parsing and inspection-math regression checks, adjusted for the parser's additive quantity field.
- With the local dev server running, `node scripts/verify-repeated-dimensions-browser.mjs`: explicit expansion, independent measurements/notes, shared requirement edits, placement pause/reload/resume across pages, base swaps, count-reduction cancellation and retained IDs, group deletion, direct PDF quantity capture, reviewed candidate preservation, PDF coordinate assertions and Excel text IDs/limits/MIN/MAX/overall status.
- Visually inspected screen labels, rendered multi-page PDF labels/leaders including `105.12`, and exported workbook rows. The browser script writes fixtures to `/tmp/qca-repeated-dimensions/`.

Existing verification limitation: `scripts/verify-drawing-units.mjs` fails at line 86, expecting “Apply all rows (3)” but receiving “Apply all rows (1)”. The identical failure was reproduced against an isolated unmodified `develop` baseline at commit `bcb8efa6e714`; no unrelated tolerance changes were made. Cloud schema/realtime/concurrency behavior was not exercised because grouped cloud support is explicitly disabled.
