import { memo, useMemo } from "react";
import { X, HelpCircle, Plus, FilePlus2, Circle, Trash2 } from "lucide-react";
import { getLimits, getStatus } from "./exporters.js";
import { methods, types, APP_VERSION } from "./constants.js";
import { formatBytes, formatDate } from "./utils.js";
import { DrawingNavToolbar, PdfUploadPrompt, LeaderLayer } from "./widgets.jsx";

export function HelpDialog({ open, onClose }) {
  if (!open) return null;

  const shortcuts = [
    ["B", "Balloon tool"],
    ["A", "Review balloon candidates (Auto Balloon)"],
    ["V", "Select tool"],
    ["H", "Pan tool"],
    ["T", "Text Select / OCR"],
    ["E", "Edit selected balloon actions"],
    ["Esc", "Close help, cancel selection UI"],
  ];

  const releaseNotes = [
    "Project management support with local projects and up to 25 drawings per project. Large PDFs over 25 MB show a storage warning, and projects over 500 MB show a project storage warning.",
    "Auto Balloon support: drag a selected area, review detected balloon candidates, then add confirmed balloons with aligned leaders.",
    "Shortcuts added for faster workflow: B Balloon, A Auto Balloon candidate review, V Select, H Pan, T Text/OCR, E Edit selected balloon, Esc cancel/close.",
  ];

  return (
    <div className="dialog-backdrop help-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-title help-title">
          <div>
            <h2 id="help-title">QC Assistant Help</h2>
            <p>Fast path from drawing upload to submittable FAI exports.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close help">
            <X size={17} />
          </button>
        </div>

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

          <details className="help-section version-history">
            <summary>
              <span>Version History</span>
              <strong>v0.2.0</strong>
            </summary>
            <div className="release-note">
              <h3>v0.2.0</h3>
              <ul>
                {releaseNotes.map((note) => (
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
  onRenameProject,
  onDeleteProject,
  onDialogChange,
  onDialogSubmit,
  onDialogClose,
  onOpenHelp,
  helpOpen,
  onCloseHelp,
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
              <button className="icon-button brand-help" onClick={onOpenHelp} title="Help and shortcuts" aria-label="Help and shortcuts">
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
                      <h3>{project.name}</h3>
                      <p>
                        {project.drawingCount} drawings · {formatBytes(project.totalBytes)} · Updated {formatDate(project.updatedAt)}
                      </p>
                    </div>
                    <strong className={`status ${project.status.toLowerCase()}`}>{project.status}</strong>
                  </div>
                  <div className="project-card-actions">
                    <button className="button primary" onClick={() => onOpenProject(project.id)}>Open</button>
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
              <h2>{projectDialog.mode === "create" ? "New Project" : "Edit Project Name"}</h2>
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
              <button type="submit" className="button primary" disabled={!projectDialog.name.trim()}>
                {projectDialog.mode === "create" ? "Create Project" : "Save Name"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <HelpDialog open={helpOpen} onClose={onCloseHelp} />
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
            <select value={sampleCount} onChange={(event) => onSampleCountChange(Number(event.target.value))}>
              {[1, 3, 5, 10].map((count) => (
                <option key={count} value={count}>{count}</option>
              ))}
            </select>
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
        <select value={item.type} onChange={(event) => onChange({ type: event.target.value })}>
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
      <label>
        Tolerance
        <input value={item.tolerance} onChange={(event) => onChange({ tolerance: event.target.value })} />
      </label>
      <label>
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
        <select value={item.type} disabled={readOnly} onChange={readOnly ? undefined : (event) => onChange(item.id, { type: event.target.value })}>
          {types.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </td>
      <td><input value={item.unit} disabled={readOnly} onChange={readOnly ? undefined : (event) => onChange(item.id, { unit: event.target.value })} /></td>
      <td><input value={item.nominal} disabled={readOnly} onChange={readOnly ? undefined : (event) => onChange(item.id, { nominal: event.target.value })} /></td>
      <td><input value={item.tolerance} disabled={readOnly} onChange={readOnly ? undefined : (event) => onChange(item.id, { tolerance: event.target.value })} /></td>
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
        <td><input value={item.notes} onChange={(event) => onChange(item.id, { notes: event.target.value })} /></td>
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
  const sortKey = useMemo(
    () => characteristics.map((c) => `${c.id}:${c.balloonNo}`).join(","),
    [characteristics],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sorted = useMemo(
    () => characteristics.slice().sort((a, b) => a.balloonNo - b.balloonNo),
    [sortKey],
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
            <th>Tolerance</th>
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
