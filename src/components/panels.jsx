import { memo, useMemo } from "react";
import { X, HelpCircle, Plus, FilePlus2, Circle, Trash2, RotateCcw, ArrowLeft } from "lucide-react";
import { getLimits, getStatus } from "../lib/exporters.js";
import { methods, types, APP_VERSION } from "../lib/constants.js";
import { formatBytes, formatDate } from "../lib/utils.js";
import { DrawingNavToolbar, PdfUploadPrompt, LeaderLayer, Field } from "./widgets.jsx";

function GuideFigure({ src, alt, caption }) {
  return (
    <figure className="guide-figure">
      <img src={src} alt={alt} loading="lazy" />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

export function FullUserGuide() {
  return (
    <div className="guide-body">
      <div className="guide-topic">
        <h4>Projects &amp; Drawings</h4>
        <p>Everything is stored locally in your browser. A project holds one or more drawings; each drawing keeps its own PDF, metadata, balloons, tolerances, and measurements.</p>
        <GuideFigure src="/guide/01-dashboard-empty.png" alt="Dashboard with no projects yet" />
        <p><strong>New Project</strong> creates a project and drops you straight into the workspace with an empty drawing slot.</p>
        <GuideFigure src="/guide/03-new-project-dialog-filled.png" alt="New Project dialog with a name entered" />
        <p>Click <strong>Manage</strong> on a project card to edit its name, code, owner, delivery date, and notes, and to add, rename, or delete drawings without opening the workspace.</p>
        <GuideFigure src="/guide/06-project-detail-with-drawing.png" alt="Project Detail page with one drawing added" caption="Project Detail: info fields, plus one drawing added." />
        <p>A project can hold up to 25 drawings. You'll see a warning past ~25 MB for a single PDF, or ~500 MB total per project. Changes autosave (debounced) as you work, and the last project/drawing you had open reopens automatically.</p>
      </div>

      <div className="guide-topic">
        <h4>Uploading &amp; Viewing a Drawing</h4>
        <GuideFigure src="/guide/04-workspace-upload-prompt.png" alt="Upload a drawing PDF prompt" />
        <GuideFigure src="/guide/07-workspace-drawing-layout.png" alt="Drawing-only layout with the PDF loaded, no balloons yet" caption="Drawing-only layout: canvas plus inspector, no table." />
        <p><strong>Edit</strong> mode has the full toolset. <strong>Measurement</strong> mode locks balloon positions and requirement definitions — only sample values and notes stay editable, so nobody can move a balloon mid-inspection.</p>
        <p><strong>Layout</strong> (Edit mode) arranges the canvas, table, and inspector: Drawing only, Table only, Side by Side, or Stacked (default). Panel sizes are resizable and remembered.</p>
      </div>

      <div className="guide-topic">
        <h4>Capturing Text &amp; OCR</h4>
        <GuideFigure src="/guide/11-text-select-active.png" alt="Text Select tool active in the workspace" />
        <p>The <strong>Text Select</strong> tool (<kbd>T</kbd>) pulls text straight off the PDF into "Selected PDF Text." Click embedded text directly, or drag a rectangle over raster/scanned text to run on-device OCR instead. Then send the captured text to Description, Drawing No, Rev, Requirement, Tolerance, or Notes.</p>
      </div>

      <div className="guide-topic">
        <h4>Ballooning</h4>
        <p>Select <strong>Balloon</strong> (<kbd>B</kbd>) and click a dimension callout. QC Assistant snaps to the nearest recognized dimension text and pre-fills the nominal/tolerance when it can parse them — e.g. <code>42.50 ±0.10</code>, <code>Ø12.00 +0.05/-0.02</code>, <code>90° ±0.5°</code>. Drag the circle or leader target to adjust placement afterward.</p>
        <GuideFigure src="/guide/08-balloons-placed.png" alt="Three balloons manually placed on the drawing" />
        <p>Single-click selects a balloon; double-click or <kbd>E</kbd> opens reassign/delete. <strong>Add Row</strong> creates a characteristic with no balloon placed yet. <strong>Demo Rows</strong> seeds 7 examples. <strong>Clear Drawing Data</strong> / <strong>Clear All Balloons</strong> wipe with confirmation.</p>
      </div>

      <div className="guide-topic">
        <h4>Auto Balloon (Review tool)</h4>
        <p>The <strong>Review</strong> tool (<kbd>A</kbd>) detects several balloons at once. Drag a rectangle around a cluster of dimensions, review the candidates, then commit the ones you want.</p>
        <div className="guide-flow">
          <div className="guide-flow-title">Detection flow</div>
          <div className="guide-decision">
            <div className="guide-decision-row">
              <span className="guide-decision-q">Embedded PDF text found in the box?</span>
              <span className="guide-decision-arrow">yes →</span>
              <span className="status ok mini">use it</span>
            </div>
            <div className="guide-decision-row">
              <span className="guide-decision-q">Nothing usable found?</span>
              <span className="guide-decision-arrow">→</span>
              <span className="status open mini">fall back to OCR</span>
            </div>
            <div className="guide-decision-row">
              <span className="guide-decision-q">Either path, then dedupe + filter noise</span>
              <span className="guide-decision-arrow">→</span>
              <span className="status mini">order clockwise</span>
            </div>
            <div className="guide-decision-row">
              <span className="guide-decision-q">Shown in Review Candidates, remove any unwanted</span>
              <span className="guide-decision-arrow">→</span>
              <span className="status ok mini">Add balloons</span>
            </div>
          </div>
        </div>
        <GuideFigure src="/guide/09-auto-balloon-review-candidates.png" alt="Selection box drawn, three candidates detected and shown for review" />
        <GuideFigure src="/guide/10-balloons-and-table.png" alt="All six balloons placed, three manual and three from Auto Balloon" />
      </div>

      <div className="guide-topic">
        <h4>Characteristics Table</h4>
        <p>Every balloon has a matching row. Type sets a default Method (dimension→DC, gdt→CMM, note/visual→VS) unless you've chosen one already. USL/LSL compute automatically from Nominal + Tolerance. Sample columns follow the chosen sample count (1, 3, 5, 10, or custom). The table stays sorted by balloon number and stays read-only (except samples/Notes) in Measurement mode.</p>
      </div>

      <div className="guide-topic">
        <h4>Tolerance Table</h4>
        <p>Open <strong>Tolerance</strong> in the toolbar. QC Assistant reads the drawing's title-block note (e.g. <code>X.XX = ±0.05</code>, <code>X° = ±0.5°</code>) and offers to apply it in bulk, keyed by decimal-place count (angles only match dimensions whose unit contains ° or "deg").</p>
        <GuideFigure src="/guide/12-tolerance-table.png" alt="Tolerance table with auto-detected linear and angular tolerances" />
        <p><strong>Fill N blank dimensions</strong> / <strong>Apply all rows</strong> only ever fill blanks — an existing tolerance is never overwritten. Override any row, or <strong>Reset</strong> back to auto-detected.</p>
      </div>

      <div className="guide-topic">
        <h4>Measurements &amp; Status Logic</h4>
        <p>Switch to <strong>Measurement</strong> mode to enter samples against a locked view of the drawing.</p>
        <GuideFigure src="/guide/14-measurement-mode.png" alt="Measurement mode with a table of six requirements and samples entered" />
        <div className="guide-flow">
          <div className="guide-flow-title">Status, per requirement — conservative by design</div>
          <div className="guide-decision">
            <div className="guide-decision-row">
              <span className="guide-decision-q">All samples empty?</span>
              <span className="guide-decision-arrow">yes →</span>
              <span className="status open mini">OPEN</span>
            </div>
            <div className="guide-decision-row">
              <span className="guide-decision-q">Note/Visual, every filled sample is "OK"?</span>
              <span className="guide-decision-arrow">yes →</span>
              <span className="status ok mini">OK</span>
            </div>
            <div className="guide-decision-row">
              <span className="guide-decision-q">Note/Visual, any filled sample isn't "OK"?</span>
              <span className="guide-decision-arrow">yes →</span>
              <span className="status fail mini">NG</span>
            </div>
            <div className="guide-decision-row">
              <span className="guide-decision-q">Dimension type, no usable USL/LSL?</span>
              <span className="guide-decision-arrow">yes →</span>
              <span className="status open mini">OPEN</span>
            </div>
            <div className="guide-decision-row">
              <span className="guide-decision-q">Any sample non-numeric or outside LSL…USL?</span>
              <span className="guide-decision-arrow">yes →</span>
              <span className="status fail mini">NG</span>
            </div>
            <div className="guide-decision-row">
              <span className="guide-decision-q">All samples filled and within limits?</span>
              <span className="guide-decision-arrow">yes →</span>
              <span className="status ok mini">OK</span>
            </div>
            <div className="guide-decision-row">
              <span className="guide-decision-q">Otherwise (still some blanks)</span>
              <span className="guide-decision-arrow">→</span>
              <span className="status open mini">OPEN</span>
            </div>
          </div>
        </div>
        <p>Overall status rolls up the same way everywhere it's shown: any <span className="status fail mini">NG</span> → <strong>FAIL</strong>; else any <span className="status open mini">OPEN</span> → <strong>OPEN</strong>; else <strong>PASS</strong>.</p>
        <GuideFigure src="/guide/15-measurement-mode-status.png" alt="A requirement mid-entry, status still reading OPEN" caption="Status stays OPEN until every sample for that requirement is filled in." />
      </div>

      <div className="guide-topic">
        <h4>Settings</h4>
        <GuideFigure src="/guide/13-settings-dialog.png" alt="Settings dialog with a live balloon preview" />
        <p>Toolbar button style (Icon + Text or Icon Only), balloon diameter, number font size, and leader length — all save automatically and follow you across every project and drawing.</p>
      </div>

      <div className="guide-topic">
        <h4>Exporting</h4>
        <GuideFigure src="/guide/16-export-toolbar.png" alt="Export buttons enabled in the toolbar" />
        <p><strong>PDF</strong> draws a red circle, leader line, and balloon number over each requirement's target on the original drawing. <strong>Excel</strong> exports a "QC FAI" workbook: header block, one row per characteristic with ID #, Type, Unit, Nominal, Tolerance, USL, LSL, every sample, computed MIN/MAX, Method, Status, and Notes, plus a Method legend. Both reflect exactly what's in the table the moment you click.</p>
      </div>

      <div className="guide-topic">
        <h4>Troubleshooting</h4>
        <ul>
          <li><strong>"Local storage quota exceeded"</strong> — your browser's storage for this site is full; delete unused drawings/projects or use a smaller PDF.</li>
          <li><strong>A requirement stays OPEN</strong> — either not every sample is filled in, or the tolerance couldn't be resolved. Check the Tolerance Table and the row's +Tol/−Tol fields.</li>
          <li><strong>Auto Balloon found nothing, or found garbage</strong> — it only searches inside the rectangle you drag; try a tighter or looser box, remove bad candidates before committing, or place that one manually.</li>
          <li><strong>Can't edit a requirement in Measurement mode</strong> — by design, so measurement entry can't change what's being measured. Switch to Edit mode.</li>
          <li><strong>Text Select won't pick up some text</strong> — that text is a raster scan, not embedded PDF text. Drag a rectangle over it to run OCR instead.</li>
        </ul>
      </div>
    </div>
  );
}

export function GuidePage({ onBack }) {
  const shortcuts = [
    ["B", "Balloon tool"],
    ["A", "Review balloon candidates (Auto Balloon)"],
    ["V", "Select tool"],
    ["H", "Pan tool"],
    ["T", "Text Select / OCR"],
    ["E", "Edit selected balloon actions"],
    ["Esc", "Close help, cancel selection UI"],
  ];

  const releaseNotes060 = [
    "Improved the UI overall.",
    "Icon buttons now support a Text label alongside the icon, with a setting to choose Icon only or Icon + Text.",
  ];

  const releaseNotes050 = [
    "Tolerance inputs now preserve common leading-decimal drawing values like .005, +.005, and -.002.",
    "The tolerance table can fill every blank dimension with the same drawing pattern in one pass without overwriting entered tolerances.",
  ];

  const releaseNotes040 = [
    "Added settings to customize balloon appearance and behavior so engineers can tune the marker style to match their drawing workflow.",
  ];

  const releaseNotes031 = [
    "Changing a balloon type from the table now keeps the selected-balloon editor in sync with the same requirement.",
    "Type changes now update the inspection method through one shared rule, so the table and right sidebar stay consistent.",
  ];

  const releaseNotes030 = [
    "The toolbar is now organised into clear sections for project controls and drawing controls — less hunting, faster access.",
    "Auto Balloon is now a dedicated panel: detect candidates, review them, and confirm in one place without interrupting your workflow.",
    "Switch between drawing view and measurement entry with a single toggle to stay in context while filling in values.",
    "Drawings open at a better default zoom that fits most standard PDF sheet sizes without manual adjustment.",
    "Unsaved changes are now clearly indicated on the workspace tab so you always know what has been saved.",
    "Rows with incomplete or indeterminate limits always show OPEN — nothing slips through as falsely passed.",
  ];

  const releaseNotes020 = [
    "Project management support with local projects and up to 25 drawings per project. Large PDFs over 25 MB show a storage warning, and projects over 500 MB show a project storage warning.",
    "Auto Balloon support: drag a selected area, review detected balloon candidates, then add confirmed balloons with aligned leaders.",
    "Shortcuts added for faster workflow: B Balloon, A Auto Balloon candidate review, V Select, H Pan, T Text/OCR, E Edit selected balloon, Esc cancel/close.",
  ];

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="brand">
          <img className="brand-mark" src="/logo-mark.svg" alt="" aria-hidden="true" />
          <div>
            <div className="brand-title-row">
              <h1>QC Assistant Help</h1>
            </div>
            <p>Fast path from drawing upload to submittable FAI exports.</p>
          </div>
        </div>
        <button className="button secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to Projects
        </button>
      </header>

      <section
        className="help-dialog dashboard-main"
        aria-labelledby="help-title"
      >
        <div className="help-content">
          <section className="help-section help-hero">
            <div>
	              <h3>Quick Workflow</h3>
	              <ol className="help-flow">
	                <li>Upload drawing PDF</li>
	                <li>Select Balloon or Review Candidates (Auto Balloon)</li>
	                <li>Add nominal, tolerance, and inspection values</li>
	                <li>Export ballooned drawing PDF</li>
	                <li>Export Excel with balloon list and values</li>
	              </ol>
	            </div>
	          </section>

          <section className="help-section">
            <h3>Tool Shortcuts</h3>
            <div className="shortcut-grid">
              {shortcuts.map(([key, label]) => (
                <div key={key} className="shortcut-row">
                  <kbd>{key}</kbd>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <div className="help-toolbar-preview" aria-hidden="true">
              <span className="help-tool active">B</span>
              <span className="help-tool">A</span>
              <span className="help-tool">V</span>
              <span className="help-tool">H</span>
              <span className="help-tool">T</span>
              <span className="help-export">PDF</span>
              <span className="help-export primary">Excel</span>
            </div>
          </section>

          <section className="help-section help-columns">
            <div>
              <h3>Balloon Behavior</h3>
              <p>Press <kbd>B</kbd>, then click each dimension target once. QC Assistant places the numbered balloon with a default leader line. Drag the circle or target later to adjust placement.</p>
              <p>Press <kbd>A</kbd>, drag around drawing numbers, review the candidates, then add the confirmed balloons.</p>
              <p>Single-click selects a balloon. Double-click or press <kbd>E</kbd> to open the small edit/delete actions.</p>
            </div>
            <div>
              <h3>Text And OCR</h3>
              <p>Press <kbd>T</kbd> to capture embedded PDF text. Drag over raster text to run OCR, then send the captured value to metadata or the selected QC row.</p>
            </div>
            <div>
              <h3>Export</h3>
              <p>Export the ballooned PDF for distribution and the Excel workbook for the inspection report. Status remains conservative: incomplete rows stay OPEN.</p>
            </div>
	          </section>

          <details className="help-section version-history user-guide">
            <summary>
              <span>Full User Guide</span>
              <strong>13 topics</strong>
            </summary>
            <FullUserGuide />
          </details>

          <details className="help-section version-history">
            <summary>
              <span>Version History</span>
              <strong>v0.6.0</strong>
            </summary>
            <div className="release-note">
              <h3>v0.6.0</h3>
              <ul>
                {releaseNotes060.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
            <div className="release-note">
              <h3>v0.5.0</h3>
              <ul>
                {releaseNotes050.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
            <div className="release-note">
              <h3>v0.4.0</h3>
              <ul>
                {releaseNotes040.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
            <div className="release-note">
              <h3>v0.3.1</h3>
              <ul>
                {releaseNotes031.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
            <div className="release-note">
              <h3>v0.3.0</h3>
              <ul>
                {releaseNotes030.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
            <div className="release-note">
              <h3>v0.2.0</h3>
              <ul>
                {releaseNotes020.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          </details>
	        </div>
      </section>
    </div>
  );
}

export function ProjectDashboard({
  projectsReady,
  projects,
  projectDialog,
  onNewProject,
  onOpenProject,
  onManageProject,
  onRenameProject,
  onDeleteProject,
  onDialogChange,
  onDialogSubmit,
  onDialogClose,
  onOpenGuide,
}) {
  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="brand">
          <img className="brand-mark" src="/logo-mark.svg" alt="" aria-hidden="true" />
          <div>
            <div className="brand-title-row">
              <h1>QC Assistant</h1>
              <span className="version-badge">{APP_VERSION}</span>
              <button className="icon-button brand-help" onClick={onOpenGuide} title="Help and shortcuts" aria-label="Help and shortcuts">
                <HelpCircle size={17} />
              </button>
            </div>
            <p>Local inspection projects</p>
          </div>
        </div>
        <button className="button primary" onClick={onNewProject}>
          <Plus size={16} />
          New Project
        </button>
      </header>

      <main className="dashboard-main">
        <section className="dashboard-panel">
          <div className="dashboard-title">
            <div>
              <h2>Projects</h2>
              <p>{projects.length} local projects</p>
            </div>
          </div>

          {!projectsReady ? (
            <div className="dashboard-empty">
              <FilePlus2 size={34} />
              <p>Loading projects...</p>
            </div>
          ) : projects.length ? (
            <div className="project-list">
              {projects.map((project) => (
                <article key={project.id} className="project-card">
                  <div className="project-card-main">
                    <div>
                      <h3>
                        {project.name}
                        {project.code ? <span className="project-card-code">{project.code}</span> : null}
                      </h3>
                      <p>
                        {project.drawingCount} drawings · {formatBytes(project.totalBytes)} · Updated {formatDate(project.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="project-card-actions">
                    <button className="button primary" onClick={() => onOpenProject(project.id)}>Open</button>
                    <button className="small-button project-action add" onClick={() => onManageProject(project.id)}>Manage</button>
                    <button className="small-button project-action add" onClick={() => onRenameProject(project)}>Edit Name</button>
                    <button className="small-button project-action delete-project" onClick={() => onDeleteProject(project)}>Delete Project</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="dashboard-empty">
              <FilePlus2 size={38} />
              <h2>No projects yet</h2>
              <button className="button primary" onClick={onNewProject}>
                <Plus size={16} />
                New Project
              </button>
            </div>
          )}
        </section>
      </main>

      {projectDialog.open ? (
        <div className="dialog-backdrop" role="presentation">
          <form className="project-dialog" onSubmit={onDialogSubmit}>
            <div className="dialog-title">
              <h2>Edit Project Name</h2>
              <button type="button" className="icon-button" onClick={onDialogClose} aria-label="Close project dialog">×</button>
            </div>
            <label className="stacked-label">
              Project Name
              <input
                autoFocus
                value={projectDialog.name}
                onChange={(event) => onDialogChange(event.target.value)}
                placeholder="Example: BS-Extrusion"
              />
            </label>
            <div className="dialog-actions">
              <button type="button" className="button secondary" onClick={onDialogClose}>Cancel</button>
              <button type="submit" className="button primary" disabled={!projectDialog.name.trim()}>Save Name</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function NewProjectPage({ name, onNameChange, onSubmit, onCancel }) {
  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="brand">
          <img className="brand-mark" src="/logo-mark.svg" alt="" aria-hidden="true" />
          <div>
            <div className="brand-title-row">
              <h1>New Project</h1>
            </div>
            <p>Create a project to hold one or more drawings.</p>
          </div>
        </div>
        <button className="button secondary" onClick={onCancel}>
          <ArrowLeft size={16} />
          Back to Projects
        </button>
      </header>

      <main className="dashboard-main">
        <section className="dashboard-panel">
          <form className="project-detail-form" onSubmit={onSubmit}>
            <label className="stacked-label">
              Project Name
              <input
                autoFocus
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="Example: BS-Extrusion"
              />
            </label>
            <div className="dialog-actions">
              <button type="button" className="button secondary" onClick={onCancel}>Cancel</button>
              <button type="submit" className="button primary" disabled={!name.trim()}>Create Project</button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

export function ProjectDetail({
  project,
  drawings,
  ready,
  fieldDraft,
  fieldsDirty,
  onFieldChange,
  onSaveFields,
  onBack,
  onOpenProjectWorkspace,
  onAddDrawing,
  onRenameDrawing,
  onDeleteDrawing,
  drawingDialog,
  onDrawingDialogChange,
  onDrawingDialogSubmit,
  onDrawingDialogClose,
  onOpenGuide,
}) {
  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="brand">
          <img className="brand-mark" src="/logo-mark.svg" alt="" aria-hidden="true" />
          <div>
            <div className="brand-title-row">
              <h1>QC Assistant</h1>
              <span className="version-badge">{APP_VERSION}</span>
              <button className="icon-button brand-help" onClick={onOpenGuide} title="Help and shortcuts" aria-label="Help and shortcuts">
                <HelpCircle size={17} />
              </button>
            </div>
            <p>Project details</p>
          </div>
        </div>
        <button className="button secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to Projects
        </button>
      </header>

      <main className="dashboard-main">
        <section className="dashboard-panel">
          <div className="dashboard-title">
            <div>
              <h2>Project Info</h2>
              <p>Name and code for this project</p>
            </div>
          </div>

          {!ready ? (
            <div className="dashboard-empty">
              <FilePlus2 size={34} />
              <p>Loading project...</p>
            </div>
          ) : (
            <div className="project-detail-form">
              <div className="project-detail-fields">
                <Field label="Project Name" value={fieldDraft.name} onChange={(value) => onFieldChange("name", value)} wide />
                <Field label="Project Code" value={fieldDraft.code} onChange={(value) => onFieldChange("code", value)} compact />
                <Field label="Project Owner" value={fieldDraft.owner} onChange={(value) => onFieldChange("owner", value)} compact />
                <Field
                  label="Estimated Delivery Date"
                  type="date"
                  value={fieldDraft.estimatedDeliveryDate}
                  onChange={(value) => onFieldChange("estimatedDeliveryDate", value)}
                  compact
                />
                <Field label="Notes" value={fieldDraft.notes} onChange={(value) => onFieldChange("notes", value)} wide multiline />
              </div>
              <div className="dialog-actions">
                <button className="button primary" onClick={onSaveFields} disabled={!fieldDraft.name.trim() || !fieldsDirty}>
                  Save
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-title">
            <div>
              <h2>Drawings</h2>
              <p>{drawings.length} drawings</p>
            </div>
            <label className="small-button project-action add file-button">
              <Plus size={14} />
              Add Drawing
              <input type="file" accept="application/pdf" onChange={onAddDrawing} />
            </label>
          </div>

          {drawings.length ? (
            <div className="project-list">
              {drawings.map((drawing) => (
                <article key={drawing.id} className="project-card">
                  <div className="project-card-main">
                    <div>
                      <h3>{drawing.name}</h3>
                      <p>
                        {drawing.pdfName} · {formatBytes(drawing.pdfByteLength)} · Updated {formatDate(drawing.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="project-card-actions">
                    <button className="button primary" onClick={() => onOpenProjectWorkspace(drawing.id)}>Open</button>
                    <button className="small-button project-action add" onClick={() => onRenameDrawing(drawing)}>Rename</button>
                    <button className="small-button project-action delete-drawing" onClick={() => onDeleteDrawing(drawing)}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="dashboard-empty">
              <FilePlus2 size={38} />
              <h2>No drawings yet</h2>
              <label className="button primary">
                <Plus size={16} />
                Add Drawing
                <input type="file" accept="application/pdf" onChange={onAddDrawing} />
              </label>
            </div>
          )}
        </section>
      </main>

      {drawingDialog.open ? (
        <div className="dialog-backdrop" role="presentation">
          <form className="project-dialog" onSubmit={onDrawingDialogSubmit}>
            <div className="dialog-title">
              <h2>Rename Drawing</h2>
              <button type="button" className="icon-button" onClick={onDrawingDialogClose} aria-label="Close rename dialog">×</button>
            </div>
            <label className="stacked-label">
              Drawing Name
              <input
                autoFocus
                value={drawingDialog.name}
                onChange={(event) => onDrawingDialogChange(event.target.value)}
                placeholder="Example: Bracket Rev C"
              />
            </label>
            <div className="dialog-actions">
              <button type="button" className="button secondary" onClick={onDrawingDialogClose}>Cancel</button>
              <button type="submit" className="button primary" disabled={!drawingDialog.name.trim()}>Save</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function MeasurementWorkspace({
  pdfDoc,
  canvasRef,
  overlayRef,
  scrollRef,
  canvasSize,
  pageNumber,
  pageCount,
  zoom,
  onZoomOut,
  onZoomIn,
  onPrevPage,
  onNextPage,
  currentPageBalloons,
  characteristics,
  selectedId,
  sampleCount,
  projectStatus,
  message,
  activeDrawingId,
  onPdfUpload,
  onSelect,
  onChange,
  onSampleChange,
  onSampleCountChange,
  balloonDiameter = 24,
}) {
  return (
    <main className="measurement-area">
      <section className="measurement-drawing-panel">
        <div className="panel-toolbar">
          <div className="tool-group">
            <span className="mode-chip">View-only drawing</span>
          </div>
          <DrawingNavToolbar
            zoom={zoom}
            pageNumber={pageNumber}
            pageCount={pageCount}
            onZoomOut={onZoomOut}
            onZoomIn={onZoomIn}
            onPrevPage={onPrevPage}
            onNextPage={onNextPage}
          />
        </div>

        <div ref={scrollRef} className="canvas-scroll measurement-scroll">
          {!pdfDoc ? (
            <PdfUploadPrompt
              message="Add balloons in Edit mode, then enter QC/FAI measurement data here."
              onUpload={onPdfUpload}
            />
          ) : (
            <div
              ref={overlayRef}
              className="pdf-stage measurement-readonly"
              style={{ width: canvasSize.width, height: canvasSize.height }}
            >
              <canvas ref={canvasRef} />
              <LeaderLayer
                balloons={currentPageBalloons}
                selectedId={selectedId}
                width={canvasSize.width}
                height={canvasSize.height}
                balloonDiameter={balloonDiameter}
              />
              {currentPageBalloons.map((item) => (
                <button
                  key={item.id}
                  className={`balloon measurement-balloon ${selectedId === item.id ? "selected" : ""}`}
                  style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%` }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(item.id);
                  }}
                  title={`Select balloon ${item.balloonNo}`}
                >
                  {item.balloonNo}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="measurement-entry-panel">
        <div className="measurement-header">
          <div>
            <h2>QC / FAI Measurement Data</h2>
            <p>{characteristics.length} requirements ready for inspection input</p>
          </div>
          <strong className={`status ${projectStatus.toLowerCase()}`}>{projectStatus}</strong>
        </div>

        <div className="measurement-controls">
          <label className="stacked-label">
            Samples
            <div className="sample-count-row">
              <select value={sampleCount} onChange={(event) => onSampleCountChange(Number(event.target.value))}>
                {[1, 3, 5, 10].map((count) => (
                  <option key={count} value={count}>{count}</option>
                ))}
                {![1, 3, 5, 10].includes(sampleCount) && (
                  <option value={sampleCount}>{sampleCount}</option>
                )}
              </select>
              <input
                type="number"
                min={1}
                className="sample-count-custom"
                placeholder="Custom"
                value={sampleCount}
                onChange={(event) => {
                  const parsed = Math.max(1, Math.round(Number(event.target.value) || 1));
                  onSampleCountChange(parsed);
                }}
              />
            </div>
          </label>
          <span className="mode-chip">Balloon geometry locked</span>
        </div>

        <CharacteristicTable
          characteristics={characteristics}
          selectedId={selectedId}
          sampleCount={sampleCount}
          activeDrawingId={activeDrawingId}
          readOnly
          onSelect={onSelect}
          onChange={onChange}
          onSampleChange={onSampleChange}
        />

        <div className="message">{message}</div>
      </section>
    </main>
  );
}

function parseToleranceParts(tolerance) {
  const text = String(tolerance || "").trim();
  if (!text) return { upper: "", lower: "" };
  const asym = text.match(/^[+\s]*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\/\s*[-\s]*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/);
  if (asym) return { upper: normalizeToleranceHalf(asym[1]), lower: normalizeToleranceHalf(asym[2]) };
  const sym = text.match(/^[±]\s*((?:\d+(?:\.\d*)?|\.\d+))$/);
  if (sym) return { upper: normalizeToleranceHalf(sym[1]), lower: normalizeToleranceHalf(sym[1]) };
  const lowerOnly = text.match(/^-\s*((?:\d+(?:\.\d*)?|\.\d+))$/);
  if (lowerOnly) return { upper: "", lower: normalizeToleranceHalf(lowerOnly[1]) };
  const upperOnly = text.match(/^[+\s]*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/);
  if (upperOnly) return { upper: normalizeToleranceHalf(upperOnly[1]), lower: "" };
  return { upper: normalizeToleranceHalf(text), lower: "" };
}

function normalizeToleranceHalf(value) {
  const text = String(value || "")
    .replace(/−/g, "-")
    .trim();
  const numeric = text.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/);
  const normalized = numeric ? numeric[0].replace(/^[+\-±]+/, "") : "";
  return normalized.replace(/^\.(\d)/, "0.$1");
}

function formatTolerance(upper, lower) {
  const u = normalizeToleranceHalf(upper);
  const l = normalizeToleranceHalf(lower);
  if (!u && !l) return "";
  if (u && l) return u === l ? `±${u}` : `+${u}/-${l}`;
  return u ? `+${u}` : `-${l}`;
}

function ToleranceHalfInput({ value, disabled, onChange, label }) {
  return (
    <input
      className="tolerance-half"
      value={value}
      disabled={disabled}
      onClick={(event) => event.stopPropagation()}
      onChange={disabled ? undefined : (event) => onChange(event.target.value)}
      placeholder="0.00"
      aria-label={label}
    />
  );
}

function ToleranceInput({ value, onChange }) {
  const { upper, lower } = parseToleranceParts(value);
  return (
    <div className="tolerance-split">
      <span className="tolerance-sign">+</span>
      <ToleranceHalfInput
        value={upper}
        onChange={(nextUpper) => onChange(formatTolerance(nextUpper, lower))}
        label="Upper tolerance"
      />
      <span className="tolerance-sign">−</span>
      <ToleranceHalfInput
        value={lower}
        onChange={(nextLower) => onChange(formatTolerance(upper, nextLower))}
        label="Lower tolerance"
      />
    </div>
  );
}

export function BalloonEditor({ item, sampleCount, onChange, onReassign, onSampleChange }) {
  const { usl, lsl } = getLimits(item);
  return (
    <div className="editor-grid">
      <label>
        Balloon #
        <input
          type="number"
          min="1"
          value={item.balloonNo}
          onChange={(event) => onReassign(event.target.value)}
        />
      </label>
      <label>
        Type
        <select
          value={item.type}
          onChange={(event) => {
            const type = event.target.value;
            onChange({ type });
          }}
        >
          {types.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>
      <label>
        Unit
        <input value={item.unit} onChange={(event) => onChange({ unit: event.target.value })} />
      </label>
      <label>
        Method
        <select value={item.method} onChange={(event) => onChange({ method: event.target.value })}>
          {methods.map((method) => <option key={method} value={method}>{method}</option>)}
        </select>
      </label>
      <label className="span-2">
        Nominal / Requirement
        <input value={item.nominal} onChange={(event) => onChange({ nominal: event.target.value })} />
      </label>
      <label className="span-2">
        Tolerance
        <ToleranceInput value={item.tolerance} onChange={(val) => onChange({ tolerance: val })} />
      </label>
      <label className="span-2">
        Limits
        <input value={`${lsl || "-"} / ${usl || "-"}`} readOnly />
      </label>
      <label className="span-2">
        Notes
        <textarea value={item.notes} onChange={(event) => onChange({ notes: event.target.value })} />
      </label>
      <div className="sample-stack span-2">
        {Array.from({ length: sampleCount }, (_, index) => (
          <label key={index}>
            #{index + 1}
            <input value={item.samples[index] ?? ""} onChange={(event) => onSampleChange(index, event.target.value)} placeholder={item.type === "dimension" ? "0.000" : "OK"} />
          </label>
        ))}
      </div>
    </div>
  );
}

const CharacteristicRow = memo(function CharacteristicRow({
  item,
  sampleCount,
  selectedId,
  readOnly,
  onSelect,
  onChange,
  onReassign,
  onSampleChange,
  onDelete,
}) {
  const { usl, lsl } = getLimits(item);
  const status = getStatus(item, sampleCount);
  const toleranceParts = parseToleranceParts(item.tolerance);
  return (
    <tr
      className={selectedId === item.id ? "row-selected" : ""}
      onClick={() => onSelect(item.id)}
    >
      {readOnly ? (
        <td className="id-cell locked-id">{item.balloonNo}</td>
      ) : (
        <td className="id-cell">
          <input
            type="number"
            min="1"
            value={item.balloonNo}
            aria-label={`Reassign balloon ${item.balloonNo}`}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onReassign(item.id, event.target.value)}
          />
        </td>
      )}
      <td>
        <select
          value={item.type}
          disabled={readOnly}
          onChange={readOnly ? undefined : (event) => {
            const type = event.target.value;
            onChange(item.id, { type });
          }}
        >
          {types.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </td>
      <td><input value={item.unit} disabled={readOnly} onChange={readOnly ? undefined : (event) => onChange(item.id, { unit: event.target.value })} /></td>
      <td><input value={item.nominal} disabled={readOnly} onChange={readOnly ? undefined : (event) => onChange(item.id, { nominal: event.target.value })} /></td>
      <td>
        <ToleranceHalfInput
          value={toleranceParts.upper}
          disabled={readOnly}
          label={`Upper tolerance for balloon ${item.balloonNo}`}
          onChange={(upper) => onChange(item.id, { tolerance: formatTolerance(upper, toleranceParts.lower) })}
        />
      </td>
      <td>
        <ToleranceHalfInput
          value={toleranceParts.lower}
          disabled={readOnly}
          label={`Lower tolerance for balloon ${item.balloonNo}`}
          onChange={(lower) => onChange(item.id, { tolerance: formatTolerance(toleranceParts.upper, lower) })}
        />
      </td>
      <td className="readonly">{usl}</td>
      <td className="readonly">{lsl}</td>
      {Array.from({ length: sampleCount }, (_, index) => (
        <td key={index}>
          <input
            value={item.samples[index] ?? ""}
            onChange={(event) => onSampleChange(item.id, index, event.target.value)}
            placeholder={readOnly ? (item.type === "dimension" ? "0.000" : "OK") : undefined}
          />
        </td>
      ))}
      <td>
        <select value={item.method} disabled={readOnly} onChange={readOnly ? undefined : (event) => onChange(item.id, { method: event.target.value })}>
          {methods.map((method) => <option key={method} value={method}>{method}</option>)}
        </select>
      </td>
      {readOnly ? (
        <td className="notes-cell"><input value={item.notes} onChange={(event) => onChange(item.id, { notes: event.target.value })} /></td>
      ) : null}
      <td><span className={`status mini ${status.toLowerCase()}`}>{status}</span></td>
      {!readOnly ? (
        <td className="row-actions">
          <button
            className="icon-button danger"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(item.id);
            }}
            title={`Delete balloon ${item.balloonNo}`}
          >
            <Trash2 size={14} />
          </button>
        </td>
      ) : null}
    </tr>
  );
});

export function CharacteristicTable({
  characteristics,
  selectedId,
  sampleCount,
  activeDrawingId,
  readOnly,
  onSelect,
  onChange,
  onReassign,
  onSampleChange,
  onDelete,
}) {
  const sorted = useMemo(
    () => characteristics.slice().sort((a, b) => a.balloonNo - b.balloonNo),
    [characteristics],
  );

  if (readOnly && !activeDrawingId) {
    return (
      <div className="table-empty">
        <FilePlus2 size={26} />
        <p>Create or open a project drawing before entering measurement data.</p>
      </div>
    );
  }

  if (!characteristics.length) {
    return (
      <div className="table-empty">
        <Circle size={26} />
        <p>{readOnly ? "No balloons yet. Switch to Edit mode to add balloons, then return here for measurement entry." : "No characteristics yet. Add a balloon on the drawing or create a row manually."}</p>
      </div>
    );
  }

  return (
    <div className={readOnly ? "measurement-table-scroll" : "table-scroll"}>
      <table className={readOnly ? "measurement-table" : undefined}>
        <thead>
          <tr>
            <th>ID #</th>
            <th>Type</th>
            <th>Unit</th>
            <th>Nominal / Requirement</th>
            <th>+ Tol</th>
            <th>− Tol</th>
            <th>USL</th>
            <th>LSL</th>
            {Array.from({ length: sampleCount }, (_, index) => <th key={index}>#{index + 1}</th>)}
            <th>Method</th>
            {readOnly ? <th>Notes</th> : null}
            <th>Status</th>
            {!readOnly ? <th aria-label="Row actions"></th> : null}
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => (
            <CharacteristicRow
              key={item.id}
              item={item}
              sampleCount={sampleCount}
              selectedId={selectedId}
              readOnly={readOnly}
              onSelect={onSelect}
              onChange={onChange}
              onReassign={onReassign}
              onSampleChange={onSampleChange}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SettingsPage({ settings, onBack, onChange }) {
  const defaults = { diameter: 24, fontSize: 11, leaderScale: 1, toolButtonStyle: "icon-text" };

  function set(key, value) {
    onChange({ ...settings, [key]: value });
  }

  function resetOne(key) {
    onChange({ ...settings, [key]: defaults[key] });
  }

  function resetAll() {
    onChange({ ...defaults });
  }

  const leaderLineWidth = Math.round(40 + (settings.leaderScale - 1) * 28);

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="brand">
          <img className="brand-mark" src="/logo-mark.svg" alt="" aria-hidden="true" />
          <div>
            <div className="brand-title-row">
              <h1 id="settings-title">Settings</h1>
            </div>
            <p>Customize the toolbar and balloon appearance. Saved automatically.</p>
          </div>
        </div>
        <button className="button secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to Projects
        </button>
      </header>

      <section
        className="settings-dialog dashboard-main"
        aria-labelledby="settings-title"
      >
        <div className="settings-body">
          {/* Toolbar Buttons */}
          <div className="settings-row">
            <p className="settings-section-title">Toolbar</p>
            <div className="settings-row-header">
              <label>Button style</label>
            </div>
            <p className="settings-row-desc">Show a text label next to toolbar icons, or icons only.</p>
            <div className="settings-segmented" role="radiogroup" aria-label="Toolbar button style">
              <button
                type="button"
                className={`settings-segmented-option ${settings.toolButtonStyle !== "icon-only" ? "active" : ""}`}
                onClick={() => set("toolButtonStyle", "icon-text")}
                aria-pressed={settings.toolButtonStyle !== "icon-only"}
              >
                Icon + Text
              </button>
              <button
                type="button"
                className={`settings-segmented-option ${settings.toolButtonStyle === "icon-only" ? "active" : ""}`}
                onClick={() => set("toolButtonStyle", "icon-only")}
                aria-pressed={settings.toolButtonStyle === "icon-only"}
              >
                Icon Only
              </button>
            </div>
          </div>

          {/* Balloon Diameter */}
          <div className="settings-row">
            <p className="settings-section-title">Balloon appearance</p>
            <div className="settings-row-header">
              <label htmlFor="setting-diameter">Balloon diameter</label>
              <button
                type="button"
                className="settings-reset-btn"
                onClick={() => resetOne("diameter")}
                title="Reset to default"
                aria-label="Reset balloon diameter"
              >
                <RotateCcw size={10} style={{ marginRight: 3, verticalAlign: "middle" }} />
                Reset
              </button>
            </div>
            <p className="settings-row-desc">Size of the circle balloon in pixels. Default: 24 px.</p>
            <div className="settings-row-controls">
              <input
                id="setting-diameter"
                type="range"
                min={16}
                max={48}
                step={1}
                value={settings.diameter}
                onChange={(e) => set("diameter", Number(e.target.value))}
              />
              <span className="settings-value">{settings.diameter} px</span>
            </div>
          </div>

          {/* Font Size */}
          <div className="settings-row">
            <div className="settings-row-header">
              <label htmlFor="setting-fontsize">Number font size</label>
              <button
                type="button"
                className="settings-reset-btn"
                onClick={() => resetOne("fontSize")}
                title="Reset to default"
                aria-label="Reset font size"
              >
                <RotateCcw size={10} style={{ marginRight: 3, verticalAlign: "middle" }} />
                Reset
              </button>
            </div>
            <p className="settings-row-desc">Font size of the balloon number. Default: 11 px.</p>
            <div className="settings-row-controls">
              <input
                id="setting-fontsize"
                type="range"
                min={8}
                max={18}
                step={1}
                value={settings.fontSize}
                onChange={(e) => set("fontSize", Number(e.target.value))}
              />
              <span className="settings-value">{settings.fontSize} px</span>
            </div>
          </div>

          {/* Leader Length */}
          <div className="settings-row">
            <div className="settings-row-header">
              <label htmlFor="setting-leader">Leader length</label>
              <button
                type="button"
                className="settings-reset-btn"
                onClick={() => resetOne("leaderScale")}
                title="Reset to default"
                aria-label="Reset leader length"
              >
                <RotateCcw size={10} style={{ marginRight: 3, verticalAlign: "middle" }} />
                Reset
              </button>
            </div>
            <p className="settings-row-desc">Default leader line length when placing a balloon. Default: 1×.</p>
            <div className="settings-row-controls">
              <input
                id="setting-leader"
                type="range"
                min={0.25}
                max={3}
                step={0.25}
                value={settings.leaderScale}
                onChange={(e) => set("leaderScale", Number(e.target.value))}
              />
              <span className="settings-value">{settings.leaderScale}×</span>
            </div>
          </div>

          {/* Live Preview */}
          <div className="settings-preview-section">
            <span className="settings-preview-label">Preview</span>
            <div className="settings-preview-area">
              <div
                className="settings-preview-leader"
                style={{ right: settings.diameter / 2, width: leaderLineWidth }}
              />
              <div
                className="settings-preview-balloon"
                style={{
                  width: settings.diameter,
                  height: settings.diameter,
                  fontSize: settings.fontSize,
                }}
              >
                1
              </div>
            </div>
          </div>
        </div>

        <div className="settings-footer">
          <button type="button" className="settings-reset-all" onClick={resetAll}>
            Reset all to defaults
          </button>
          <button type="button" className="settings-close-btn" onClick={onBack}>
            Done
          </button>
        </div>
      </section>
    </div>
  );
}

const TOLERANCE_LINEAR_BASELINE = [1, 2, 3];
const TOLERANCE_ANGLE_BASELINE = [0, 1];

function getToleranceBuckets(baseline, autoTable, overrideTable) {
  const keys = new Set(baseline);
  Object.keys(autoTable || {}).forEach((key) => keys.add(Number(key)));
  Object.keys(overrideTable || {}).forEach((key) => keys.add(Number(key)));
  return [...keys].sort((a, b) => a - b);
}

function toleranceBucketLabel(kind, places) {
  const placeholder = places > 0 ? `X.${"X".repeat(places)}` : "X";
  return kind === "angle" ? `${placeholder}°` : placeholder;
}

function ToleranceRow({ kind, places, autoValue, overrideValue, matchCount, onChange, onReset, onApply }) {
  const isManual = overrideValue !== undefined;
  const value = isManual ? overrideValue : (autoValue || "");
  const badgeText = isManual ? "Manual" : autoValue ? "Auto" : "Not detected";
  const badgeClass = isManual ? "manual" : autoValue ? "auto" : "none";

  return (
    <div className="settings-row">
      <div className="settings-row-header">
        <label>{toleranceBucketLabel(kind, places)}</label>
        <span className={`tolerance-badge tolerance-badge--${badgeClass}`}>{badgeText}</span>
      </div>
      {isManual && autoValue ? (
        <p className="settings-row-desc">Detected from title block: {autoValue}</p>
      ) : null}
      <div className="settings-row-controls tolerance-row-actions">
        <ToleranceInput value={value} onChange={onChange} />
        {isManual ? (
          <button
            type="button"
            className="settings-reset-btn"
            onClick={onReset}
            title="Reset to auto-detected value"
          >
            <RotateCcw size={10} style={{ marginRight: 3, verticalAlign: "middle" }} />
            Reset
          </button>
        ) : null}
        <button
          type="button"
          className="button secondary tolerance-apply-btn"
          disabled={!value || !matchCount}
          onClick={() => onApply(value)}
        >
          Fill {matchCount} blank dimension{matchCount === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}

export function ToleranceTableDialog({
  open,
  onClose,
  autoTolerances,
  toleranceOverrides,
  onOverrideChange,
  onResetOverride,
  onApply,
  countMatches,
}) {
  if (!open) return null;

  const linearBuckets = getToleranceBuckets(TOLERANCE_LINEAR_BASELINE, autoTolerances.linear, toleranceOverrides.linear);
  const angleBuckets = getToleranceBuckets(TOLERANCE_ANGLE_BASELINE, autoTolerances.angle, toleranceOverrides.angle);

  const allBuckets = [
    ...linearBuckets.map((places) => ({ kind: "linear", places })),
    ...angleBuckets.map((places) => ({ kind: "angle", places })),
  ].map(({ kind, places }) => {
    const autoValue = autoTolerances[kind][places];
    const overrideValue = toleranceOverrides[kind][places];
    const value = overrideValue !== undefined ? overrideValue : (autoValue || "");
    return { kind, places, value, matchCount: value ? countMatches(kind, places) : 0 };
  });
  const totalApplyCount = allBuckets.reduce((sum, bucket) => sum + bucket.matchCount, 0);

  function applyAllRows() {
    allBuckets.forEach((bucket) => {
      if (bucket.matchCount) onApply(bucket.kind, bucket.places, bucket.value);
    });
  }

  return (
    <div className="dialog-backdrop help-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-dialog tolerance-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tolerance-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="dialog-title help-title">
          <div>
            <h2 id="tolerance-title">Tolerance Table</h2>
            <p>Auto-detected from the drawing's title block. Override a row, or fill it into every blank dimension that matches.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close tolerance table">
            <X size={17} />
          </button>
        </div>

        <div className="settings-body">
          <div className="tolerance-section">
            <h3>Linear Dimensions</h3>
            {linearBuckets.map((places) => (
              <ToleranceRow
                key={`linear-${places}`}
                kind="linear"
                places={places}
                autoValue={autoTolerances.linear[places]}
                overrideValue={toleranceOverrides.linear[places]}
                matchCount={countMatches("linear", places)}
                onChange={(value) => onOverrideChange("linear", places, value)}
                onReset={() => onResetOverride("linear", places)}
                onApply={(value) => onApply("linear", places, value)}
              />
            ))}
          </div>

          <div className="tolerance-section">
            <h3>Angles</h3>
            {angleBuckets.map((places) => (
              <ToleranceRow
                key={`angle-${places}`}
                kind="angle"
                places={places}
                autoValue={autoTolerances.angle[places]}
                overrideValue={toleranceOverrides.angle[places]}
                matchCount={countMatches("angle", places)}
                onChange={(value) => onOverrideChange("angle", places, value)}
                onReset={() => onResetOverride("angle", places)}
                onApply={(value) => onApply("angle", places, value)}
              />
            ))}
            <p className="settings-row-desc tolerance-angle-hint">
              Angle rows only match dimensions whose Unit field contains "°" or "deg".
            </p>
          </div>
        </div>

        <div className="settings-footer">
          <button
            type="button"
            className="settings-reset-all"
            disabled={!totalApplyCount}
            onClick={applyAllRows}
          >
            Apply all rows ({totalApplyCount})
          </button>
          <button type="button" className="settings-close-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </section>
    </div>
  );
}
