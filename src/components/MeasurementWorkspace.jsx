import { useMemo } from "react";
import { FilePlus2, Upload, ZoomOut, ZoomIn, Circle } from "lucide-react";
import { getLimits, getStatus } from "../lib/exporters.js";
import { types, methods } from "../lib/constants.js";
import { LeaderLayer } from "./CanvasOverlay.jsx";

export default function MeasurementWorkspace({
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
          <div className="tool-group">
            <button className="icon-button" onClick={onZoomOut} title="Zoom out">
              <ZoomOut size={17} />
            </button>
            <span className="zoom-label">{Math.round(zoom * 100)}%</span>
            <button className="icon-button" onClick={onZoomIn} title="Zoom in">
              <ZoomIn size={17} />
            </button>
          </div>
          <div className="page-control">
            <button className="small-button" disabled={pageNumber <= 1} onClick={onPrevPage}>Prev</button>
            <span>Page {pageNumber} / {pageCount || 1}</span>
            <button className="small-button" disabled={!pageCount || pageNumber >= pageCount} onClick={onNextPage}>Next</button>
          </div>
        </div>

        <div ref={scrollRef} className="canvas-scroll measurement-scroll">
          {!pdfDoc ? (
            <div className="upload-empty">
              <FilePlus2 size={44} />
              <h2>Upload a drawing PDF</h2>
              <p>Add balloons in Edit mode, then enter QC/FAI measurement data here.</p>
              <label className="button primary">
                <Upload size={16} />
                Choose PDF
                <input type="file" accept="application/pdf" onChange={onPdfUpload} />
              </label>
            </div>
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

        <MeasurementTable
          characteristics={characteristics}
          selectedId={selectedId}
          sampleCount={sampleCount}
          activeDrawingId={activeDrawingId}
          onSelect={onSelect}
          onChange={onChange}
          onSampleChange={onSampleChange}
        />

        <div className="message">{message}</div>
      </section>
    </main>
  );
}

function MeasurementTable({
  characteristics,
  selectedId,
  sampleCount,
  activeDrawingId,
  onSelect,
  onChange,
  onSampleChange,
}) {
  const sorted = useMemo(
    () => characteristics.slice().sort((a, b) => a.balloonNo - b.balloonNo),
    [characteristics],
  );

  if (!activeDrawingId) {
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
        <p>No balloons yet. Switch to Edit mode to add balloons, then return here for measurement entry.</p>
      </div>
    );
  }

  return (
    <div className="measurement-table-scroll">
      <table className="measurement-table">
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
            <th>Notes</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => {
            const { usl, lsl } = getLimits(item);
            const status = getStatus(item, sampleCount);
            return (
              <tr
                key={item.id}
                className={selectedId === item.id ? "row-selected" : ""}
                onClick={() => onSelect(item.id)}
              >
                <td className="id-cell locked-id">{item.balloonNo}</td>
                <td>
                  <select value={item.type} onChange={(event) => onChange(item.id, { type: event.target.value })}>
                    {types.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </td>
                <td><input value={item.unit} onChange={(event) => onChange(item.id, { unit: event.target.value })} /></td>
                <td><input value={item.nominal} onChange={(event) => onChange(item.id, { nominal: event.target.value })} /></td>
                <td><input value={item.tolerance} onChange={(event) => onChange(item.id, { tolerance: event.target.value })} /></td>
                <td className="readonly">{usl}</td>
                <td className="readonly">{lsl}</td>
                {Array.from({ length: sampleCount }, (_, index) => (
                  <td key={index}>
                    <input
                      value={item.samples[index] ?? ""}
                      onChange={(event) => onSampleChange(item.id, index, event.target.value)}
                      placeholder={item.type === "dimension" ? "0.000" : "OK"}
                    />
                  </td>
                ))}
                <td>
                  <select value={item.method} onChange={(event) => onChange(item.id, { method: event.target.value })}>
                    {methods.map((method) => <option key={method} value={method}>{method}</option>)}
                  </select>
                </td>
                <td><input value={item.notes} onChange={(event) => onChange(item.id, { notes: event.target.value })} /></td>
                <td><span className={`status mini ${status.toLowerCase()}`}>{status}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
