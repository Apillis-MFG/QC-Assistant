---
version: v1
name: qc-assistant-design-system
description: "Design system and product experience contract for QC Assistant. This file tells AI agents how the product should look, feel, behave, and protect trust while generating UI."
colors:
  primary: "#d82020"
  on-primary: "#ffffff"
  primary-hover: "#a91313"
  primary-focus: "#294b77"
  canvas: "#f5f7fa"
  surface-1: "#ffffff"
  surface-2: "#f7f9fc"
  surface-3: "#fbfcfe"
  hairline: "#d8dee8"
  hairline-strong: "#b9c2d0"
  ink: "#161a22"
  ink-muted: "#657085"
  ink-subtle: "#465366"
  success: "#147a42"
  warning: "#85600f"
  danger: "#b91c1c"
  info: "#294b77"
  info-soft: "#e8eef7"
typography:
  display-xl:
    fontFamily: "Inter, ui-sans-serif, system-ui"
    fontSize: 48px
    fontWeight: 700
    lineHeight: 1.05
  display-lg:
    fontFamily: "Inter, ui-sans-serif, system-ui"
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.12
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui"
    fontSize: 24px
    fontWeight: 650
    lineHeight: 1.2
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Inter, ui-sans-serif, system-ui"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: "Inter, ui-sans-serif, system-ui"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.35
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui"
    fontSize: 11px
    fontWeight: 700
    lineHeight: 1.2
    textTransform: uppercase
  button:
    fontFamily: "Inter, ui-sans-serif, system-ui"
    fontSize: 13px
    fontWeight: 750
    lineHeight: 1.2
rounded:
  xs: 4px
  sm: 5px
  md: 6px
  lg: 8px
  xl: 12px
  pill: 9999px
spacing:
  xxs: 4px
  xs: 8px
  sm: 10px
  md: 14px
  lg: 18px
  xl: 24px
  xxl: 32px
---

# QC Assistant Design System

## Purpose

This file is the visual and interaction contract for QC Assistant. AI agents should read it before generating screens, components, table layouts, inspector panels, toolbar controls, export dialogs, or status indicators.

`AGENTS.md` explains how to build the project. `DESIGN.md` explains how the product should look, feel, and communicate.

## Product Experience North Star

QC Assistant helps manufacturing QC engineers produce a complete, correct, and submittable FAI inspection report from any engineering drawing PDF — entirely in the browser.

The product should make value obvious through this ladder:

```text
Day 0: Upload a drawing and place the first balloon in under 60 seconds.
Day 1: Export a complete ballooned PDF and Excel FAI report without manual post-processing.
Day 7: The tool replaces the manual Excel + Acrobat workflow for every inspection job.
```

Design every major surface to improve one of:

- Trust: calculations, status, and exports feel accurate and verifiable.
- Distribution: the exported PDF and Excel are professional and submittable.
- Activation: first-time engineers reach the export step without instruction.

## Visual Theme And Atmosphere

### Design Personality

QC Assistant should feel:

- **Precise**: dense data layout, tight grid, no decorative whitespace between working elements.
- **Reliable**: neutral background, calm surface colors, no distracting gradients in the workspace.
- **Status-clear**: inspection status (OK / NG / OPEN / PASS / FAIL) must be visually unambiguous at a glance.
- **Engineering-native**: the product should look like a professional inspection tool, not a consumer SaaS app.

### Density

Use **high** information density in the QC table and inspector panel.
Use **medium** density in the toolbar and metadata header.

Rules:

- The QC table must show the next action (empty cell, OPEN status) without scrolling.
- Inspector panel fields should be compact but not cramped — 32px minimum input height.
- Empty states should call for action; do not explain the whole product.
- Avoid decorative panels that hold no data or decision.

### Visual Metaphor

The visual system centers on the **ballooned engineering drawing** as the primary artifact.

- Red circles (balloons) and leader lines on a white drawing canvas are the signature visual.
- The accent color (`#d82020`) is the engineering red used in GD&T and ballooning conventions worldwide.
- Do not reuse the accent color for decoration — it belongs to balloons, CTAs, and active selection states.

## Color Palette And Roles

Use semantic CSS variables, not hardcoded hex values.

### Brand And Accent

| Token | Hex | Role |
| --- | --- | --- |
| `var(--accent)` | `#d82020` | Balloon circles, leader lines, primary CTA, active tool, selected balloon |
| `var(--accent-dark)` | `#a91313` | Hover/pressed state on accent elements |
| `var(--blue)` | `#294b77` | Focus ring, info banner text, draw-panel link color |
| `var(--blue-soft)` | `#e8eef7` | Info banner background |

### Surfaces

| Token | Hex | Role |
| --- | --- | --- |
| `var(--bg)` | `#f5f7fa` | App background / canvas |
| `var(--panel)` | `#ffffff` | Topbar, drawing panel, inspector panel, table panel |
| table header bg | `#f7f9fc` | Sticky table header row |
| status card bg | `#fbfcfe` | Inspector status card |
| `var(--line)` | `#d8dee8` | Default borders and dividers |
| `var(--line-strong)` | `#b9c2d0` | Hover borders, strong dividers |
| shadow | `0 12px 34px rgba(17,24,39,0.08)` | Panel elevation |

### Text

| Token | Hex | Role |
| --- | --- | --- |
| `var(--ink)` | `#161a22` | Primary text |
| `var(--muted)` | `#657085` | Secondary text, field labels, metadata |
| `#465366` | — | Table header labels (ink-subtle) |

### Semantic Status Colors

| Token | Hex | Role |
| --- | --- | --- |
| `var(--ok)` | `#147a42` | Status OK / PASS |
| `var(--open)` | `#85600f` | Status OPEN / pending |
| `var(--fail)` | `#b91c1c` | Status NG / FAIL |

Status badge backgrounds:

| Status | Text color | Background |
| --- | --- | --- |
| OK / PASS | `var(--ok)` | `#eaf7f0` |
| OPEN | `var(--open)` | `#fff8e8` |
| NG / FAIL | `var(--fail)` | `#fff0f0` |

### Color Rules

Do:

- Use `var(--accent)` only for balloons, leader lines, active tools, selected states, and the primary CTA.
- Keep semantic status colors reserved for OK/NG/OPEN/PASS/FAIL indicators only.
- Use `var(--blue)` for focus rings and informational banners.
- Use surface changes and border weight before adding new accent colors.

Do not:

- Use `var(--accent)` for informational or warning states.
- Introduce new hex values outside the `:root` token set.
- Use gradients in the workspace or table — reserve them for the brand mark only.
- Use `var(--fail)` or `var(--danger)` for normal empty states or helper text.

## Typography Rules

### Font Family

- All text: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- No custom display font. Inter handles all sizes and weights in this tool.

### Type Scale

| Token | Size | Weight | Use |
| --- | --- | --- | --- |
| `body` | 16px | 400 | Default body (rarely used directly) |
| `body-sm` | 14px | 400 | Inspector panel copy, descriptions |
| `caption` | 12px | 500 | Table cells, metadata values, messages |
| `label` | 11px | 700 uppercase | Field labels, column headers |
| `button` | 13px | 750 | Toolbar buttons, action buttons |

### Typography Rules

- Do not scale font size with viewport width.
- Keep letter spacing at `0` — Inter reads cleanly without tracking adjustments.
- Table cells use 12px. Column headers use 11px uppercase.
- Inspector field labels use 11px uppercase bold (`var(--muted)`).
- Button labels are 13px bold; icon buttons need a visible label or tooltip.

## Layout Principles

### App Shell Grid

```text
topbar (sticky, auto height)
  workspace (minmax(0, 1fr))
    drawing-panel (flex: 1, min 520px)
    inspector (330px fixed)
  table-panel (290px fixed height, full width)
```

Do not break this grid layout without a user-requested redesign.

### Spacing System

Base unit: 4px.

| Value | Use |
| --- | --- |
| 4px | Tight icon/text gaps |
| 8px | Compact element gaps, icon-button size unit |
| 10–12px | Panel padding, inspector sections |
| 14–18px | Topbar padding, workspace padding |
| 24px | Card padding grouping |

### Grid And Containers

- Topbar: `270px | 1fr | auto` three-column grid.
- Metadata: `1fr 76px 0.9fr 1.4fr` four-column grid.
- Editor (inspector): `repeat(2, 1fr)` two-column grid.
- Sample inputs: `repeat(5, 1fr)` five-column grid (for 5-sample default).
- Table: min-width 1180px, scrolls horizontally within `.table-scroll` container.
- Avoid layout shifts when label lengths, status values, or sample counts change.

### Page Rhythm

- First screen must be the working tool — no landing page, no splash, no marketing.
- One dominant action per toolbar state: the active tool button is the primary focus.
- Navigation is in the toolbar — no sidebar, no bottom nav.
- The drawing panel is the primary content; the inspector panel is supporting context.

## Depth And Elevation

| Level | Treatment | Use |
| --- | --- | --- |
| 0 | `var(--bg)` no border | App background |
| 1 | `var(--panel)` + `var(--line)` border + shadow | Drawing panel, inspector, table panel |
| 2 | `#f7f9fc` + `var(--line)` border | Sticky table header, status card |
| 3 | `var(--blue)` focus ring at 3px offset | Keyboard focus on inputs |

Rules:

- Do not put cards inside cards.
- Do not style entire page sections as floating cards.
- The table header row must be sticky within `.table-scroll`, not the page.
- The topbar is sticky at the top of the page.

## Shapes And Radius

| Value | Use |
| --- | --- |
| 4px | Tags, status mini badges |
| 5–6px | Inputs, buttons, small controls |
| 7–8px | Panels, inspector sections, messages |
| 999px | Balloons, status badges, icon-button circles |

Rules:

- Balloons are always circular (999px radius).
- Buttons use 6px radius.
- Panels use 8px radius.
- Do not use large pill shapes for standard action buttons.

## Component Stylings

### Buttons

`.button.primary`

- Background `var(--accent)`, text `#fff`.
- Use for the one dominant CTA per toolbar group (e.g., Upload, Export PDF, Export Excel).
- Hover: `var(--accent-dark)`.
- Include an icon when it clarifies the action.

`.button.secondary`

- Background `var(--panel)`, text `var(--ink)`, border `var(--line)`.
- Use for alternate actions that do not compete with the primary CTA.
- Hover: border `var(--line-strong)`, background `#f8fafc`.

`.icon-button`

- 34×34px square, 6px radius.
- Background `var(--panel)`, border `var(--line)`.
- Active tool state: `color: var(--accent)`, `border-color: var(--accent)`, background `#fff4f4`.
- Danger variant: `color: var(--fail)`.

### Inputs

- Background `#fff`, border `var(--line)`, min-height 32px.
- Focus: `border-color: var(--blue)`, `box-shadow: 0 0 0 3px rgba(41,75,119,0.12)`.
- Inside table cells: transparent border and background; focus restores white background.
- Numeric inputs must show units in the field label.

### Table

- Table font size: 12px. Column headers: 11px uppercase, color `#465366`.
- `id-cell`: accent color, font-weight 850, centered — this is the balloon number.
- `readonly` cells: `var(--muted)`, bold — USL, LSL, Status (auto-calculated).
- Row hover: `#fbfdff`. Selected row: `#fff7f7`.
- Table must scroll horizontally within `.table-scroll`; do not let it overflow the page.

### Status Badges

Use `.status` pill for OK, NG, OPEN, PASS, FAIL indicators.

- Always use the semantic color pair from the status color table above.
- Do not use status colors for any other UI states.
- Mini variant (`.status.mini`) for table row status cells.

### Inspector Panel

- 330px fixed width, scrollable.
- Sections separated by `border-top: 1px solid var(--line)` with 12px padding-top.
- Field labels: 11px uppercase bold, `var(--muted)`.
- Use two-column grid for paired fields (type/unit, nominal/tolerance).
- Sample inputs in a five-column grid.

### Empty States

- Drawing panel empty: centered, heading + description + upload CTA.
- Table empty: centered, short instruction.
- Empty states must create one clear action; they must not explain the whole product.

## Core Product Surfaces

### First Session

Target flow:

```text
Upload a drawing PDF
  -> Drawing renders in the canvas panel
  -> Text-capture or OCR to fill header fields (Drawing No, Rev, Supplier, Description)
  -> Select Balloon tool, click target then balloon position for the first requirement
  -> Fill in type, nominal, tolerance, method in the inspector
  -> Repeat for all requirements
  -> Enter sample measurements
  -> Export PDF + Export Excel
```

First-session output:

```text
A ballooned PDF with numbered circles on each requirement and a filled-in Excel FAI workbook
ready for customer submission — both downloaded in one click each.
```

### Recurring Loop

```text
Open QC Assistant
  -> upload new drawing
  -> balloon all requirements (text-capture accelerates data entry)
  -> record measurements
  -> export and submit
  -> return for next inspection job
```

## Data Visualization And Status

Use status badges, not charts or gauges, for inspection status.

Rules:

- Status must be calculated deterministically from measurement values and limits — never estimated.
- Insufficient-data state (`OPEN`) must be visually distinct from `OK` and `NG`.
- Overall project status (`PASS` / `OPEN` / `FAIL`) rolls up from all characteristic statuses.
- Do not show a passing status until all characteristics have at least one measurement.
- USL, LSL, and Status columns in the table are read-only calculated fields — style them with `var(--muted)`.

## Motion And Interaction

Motion should clarify state changes only.

Use motion for:

- balloon appearing after placement click (instantaneous, no animation needed — keep it snappy)
- drag feedback for balloon and target repositioning
- OCR busy indicator (spinner or opacity pulse on the selection rectangle)

Avoid:

- animated transitions between tool modes
- loading skeletons for synchronous operations
- motion that delays the next user action

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
| --- | --- | --- |
| Desktop | 1100px+ | Three-column topbar; two-column workspace; full table |
| Tablet | 768–1099px | Single-column topbar; single-column workspace; inspector stacks below drawing |
| Mobile | < 720px | Reduced padding; stacked metadata fields; wrapping toolbar |

### Touch And Accessibility

- Minimum touch target: 44px on tablet and mobile.
- Icon buttons must have accessible labels or tooltips.
- Focus rings must be visible on all interactive elements.
- Table scrolls horizontally within its container — no horizontal page scroll.

## Copy And Tone

Voice:

- specific, not generic — name the exact field, tool, or action
- direct — no filler phrases
- engineering-native — use FAI, GD&T, USL/LSL, nominal, tolerance as standard terms
- status-clear — OK, NG, OPEN, PASS, FAIL are unambiguous labels, not UI softened

Rules:

- Field labels should match manufacturing industry conventions.
- Empty state copy should tell the engineer the next action, not describe the app.
- Error messages should say what failed and what to do next.
- Do not add marketing language, value propositions, or onboarding copy inside the working tool.

## Trust Boundaries

QC Assistant can say:

- "Status: OK — all measurements within specified limits."
- "Status: NG — one or more measurements outside limits."
- "Status: OPEN — measurements not yet recorded."
- "Overall: PASS / FAIL / OPEN."

QC Assistant should not say:

- "Part is conforming" (QC Assistant evaluates measurements, not the part).
- "Approved for shipment" (approval requires human sign-off, not tool output).
- "Automatically detected requirements" (all ballooning is manual and engineer-verified).

When data is incomplete:

- show `OPEN` status, not `OK`.
- explain what is missing (no samples entered, no tolerance set).
- never default to a passing state.

## Do's And Don'ts

### Do

- Use the `:root` CSS token set before adding any color or spacing value.
- Keep the drawing panel the primary content area.
- Make balloon number and status the most visible data points in the table.
- Use `var(--accent)` (engineering red) only for balloons, leader lines, active tools, and the primary CTA.
- Show `OPEN` status conservatively — require at least one measurement before showing `OK`.
- Export artifacts must look professional enough to submit to a customer without editing.

### Don't

- Do not create landing pages or marketing surfaces inside the app.
- Do not add decorative gradients, blobs, or bokeh backgrounds to the workspace.
- Do not use cards inside cards.
- Do not use the accent color for anything other than balloons, active states, and primary CTAs.
- Do not soften status language — `NG` means out of tolerance; do not write "needs review."
- Do not auto-advance status from `OPEN` to `OK` when measurements are absent.
- Do not add AI-generated inspection summaries or auto-approval language.

## Agent Prompt Guide

When asking an AI agent to build or modify UI:

```text
Use DESIGN.md as the design system.
Build the <screen/component/panel> for <user outcome>.
Primary action: <action>.
Data states to handle: empty, loading (OCR busy), success, error.
Use var(--accent) only for balloons, active tools, and primary CTAs.
Status colors (ok/open/fail) are reserved for inspection status only.
Do not add unsupported claims or decorative sections.
```

Fast component prompt:

```text
Build <component name> for QC Assistant.
It should help a manufacturing QC engineer do <job>.
Use var(--bg), var(--panel), var(--accent), and the CSS tokens from DESIGN.md.
Include default, active, hover, disabled, and empty states.
Keep table cell heights stable when values change.
```

## Implementation Notes

Map this design system to CSS:

- All color tokens: `:root` in `src/styles.css`.
- Typography: `font-family` on `:root`; sizes and weights inline in component rules.
- Spacing: inline pixel values aligned to the 4px grid — no CSS spacing variables currently.
- Component classes: `.button`, `.button.primary`, `.icon-button`, `.icon-button.active`, `.status`, `.status.mini`, `.inspector`, `.table-panel`.
- Status logic: evaluated in `src/exporters.js` (`getStatus`), rendered as `.status` badges in `App.jsx`.

Do not hardcode hex values in component CSS. Add to `:root` if a new semantic token is needed.
