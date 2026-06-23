import { X } from "lucide-react";

export default function HelpDialog({ open, onClose }) {
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
