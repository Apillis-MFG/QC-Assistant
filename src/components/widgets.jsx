import { X, FilePlus2, ZoomIn, ZoomOut, Upload } from "lucide-react";

function getLeaderLine({ x, y, targetX, targetY, radius = 13 }) {
  const targetGap = 3;
  const dx = targetX - x;
  const dy = targetY - y;
  const distance = Math.hypot(dx, dy);
  if (distance < radius + targetGap) {
    return { startX: x, startY: y, endX: targetX, endY: targetY };
  }

  const ux = dx / distance;
  const uy = dy / distance;
  return {
    startX: x + ux * radius,
    startY: y + uy * radius,
    endX: targetX - ux * targetGap,
    endY: targetY - uy * targetGap,
  };
}

export function Field({ label, value, onChange, compact = false, wide = false, type = "text", multiline = false }) {
  return (
    <label className={`field ${compact ? "compact" : ""} ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} />
      ) : (
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

export function ToolButton({ active, title, label, onClick, icon }) {
  return (
    <button
      type="button"
      className={`icon-button icon-button-labeled ${active ? "active" : ""}`}
      onClick={onClick}
      data-tooltip={title}
      aria-label={title}
    >
      {icon}
      {label ? <span className="icon-button-text">{label}</span> : null}
    </button>
  );
}

export function ResizeHandle({
  axis,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKeyDown,
  onDoubleClick,
}) {
  const isColumn = axis === "column";
  return (
    <div
      className={`resize-handle ${isColumn ? "column" : "row"}`}
      role="separator"
      tabIndex={0}
      aria-orientation={isColumn ? "vertical" : "horizontal"}
      title="Drag to resize. Double-click to reset."
      onPointerDown={(event) => onPointerDown(event, axis)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={(event) => onKeyDown(event, axis)}
      onDoubleClick={() => onDoubleClick(axis)}
    >
      <span />
    </div>
  );
}

export function TextLayer({ active, items, onCapture }) {
  return (
    <div className={`text-layer ${active ? "active" : ""}`} onMouseUp={() => onCapture()}>
      {items.map((item) => (
        <span
          key={item.id}
          className="pdf-text-item"
          style={{
            left: item.left,
            top: item.top,
            width: item.width,
            height: item.height,
            fontSize: item.fontSize,
            transform: `rotate(${item.angle}rad)`,
          }}
          onClick={(event) => {
            if (!active) return;
            event.stopPropagation();
            onCapture(item.text);
          }}
          title={active ? item.text : undefined}
        >
          {item.text}
        </span>
      ))}
    </div>
  );
}

export function LeaderLayer({ balloons, selectedId, width, height, balloonDiameter = 24 }) {
  if (!width || !height) return null;
  const radius = Math.round(balloonDiameter / 2) + 1;
  return (
    <svg className="leader-layer" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {balloons.map((item) => {
        const targetX = item.targetX ?? item.x;
        const targetY = item.targetY ?? item.y;
        if (Math.abs(targetX - item.x) < 0.004 && Math.abs(targetY - item.y) < 0.004) return null;
        const geometry = getLeaderLine({
          x: item.x * width,
          y: item.y * height,
          targetX: targetX * width,
          targetY: targetY * height,
          radius,
        });
        return (
          <line
            key={item.id}
            className={`leader-line ${selectedId === item.id ? "selected" : ""}`}
            x1={geometry.startX}
            y1={geometry.startY}
            x2={geometry.endX}
            y2={geometry.endY}
          />
        );
      })}
    </svg>
  );
}

export function AutoBalloonPreview({ candidates, width, height }) {
  if (!width || !height || !candidates.length) return null;

  return (
    <div className="auto-balloon-preview" aria-hidden="true">
      <svg className="auto-balloon-leader-layer" viewBox={`0 0 ${width} ${height}`}>
        {candidates.map((item) => {
          const geometry = getLeaderLine({
            x: item.x * width,
            y: item.y * height,
            targetX: item.targetX * width,
            targetY: item.targetY * height,
          });
          return (
            <line
              key={`leader-${item.id}`}
              className="auto-balloon-leader"
              x1={geometry.startX}
              y1={geometry.startY}
              x2={geometry.endX}
              y2={geometry.endY}
            />
          );
        })}
      </svg>
      {candidates.map((item) => (
        <span
          key={item.id}
          className="auto-balloon-ghost"
          style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%` }}
        >
          {item.balloonNo}
        </span>
      ))}
      {candidates.map((item) => (
        <span
          key={`target-${item.id}`}
          className="auto-balloon-target"
          style={{ left: `${item.targetX * 100}%`, top: `${item.targetY * 100}%` }}
        />
      ))}
    </div>
  );
}

export function AutoBalloonReview({ busy, open, candidates, onRemove, onCancel, onCommit }) {
  if (busy) {
    return <p className="muted compact-note">Reviewing selected area...</p>;
  }

  if (!open && !candidates.length) {
    return <p className="muted">Choose the review tool, then drag around drawing numbers to preview balloon candidates.</p>;
  }

  return (
    <div className="candidate-review">
      <div className="candidate-list">
        {candidates.map((candidate) => (
          <div className="candidate-row" key={candidate.id}>
            <span className="candidate-number">{candidate.balloonNo}</span>
            <span className="candidate-label" title={candidate.label}>{candidate.label}</span>
            <button className="icon-button" onClick={() => onRemove(candidate.id)} title={`Remove candidate ${candidate.balloonNo}`}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="candidate-actions">
        <button className="small-button" onClick={onCancel}>Cancel</button>
        <button className="small-button primary-compact" disabled={!candidates.length} onClick={onCommit}>
          Add balloons
        </button>
      </div>
    </div>
  );
}

export function DrawingNavToolbar({ zoom, pageNumber, pageCount, onZoomOut, onZoomIn, onPrevPage, onNextPage }) {
  return (
    <>
      <div className="tool-group">
        <button className="icon-button" onClick={onZoomOut} data-tooltip="Zoom out" aria-label="Zoom out">
          <ZoomOut size={17} />
        </button>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <button className="icon-button" onClick={onZoomIn} data-tooltip="Zoom in" aria-label="Zoom in">
          <ZoomIn size={17} />
        </button>
      </div>
      <div className="page-control">
        <button className="small-button" disabled={pageNumber <= 1} onClick={onPrevPage}>Prev</button>
        <span>Page {pageNumber} / {pageCount || 1}</span>
        <button className="small-button" disabled={!pageCount || pageNumber >= pageCount} onClick={onNextPage}>Next</button>
      </div>
    </>
  );
}

/**
 * Renders colored border boxes over detected dimension text.
 * Visible only in balloon-placement mode; pointer-events are off so existing
 * canvas click handling remains the sole source of interaction.
 */
export function DimensionHighlights({ candidates, active }) {
  if (!active || !candidates.length) return null;
  return (
    <div className="dimension-highlights" aria-hidden="true">
      {candidates.map((item) => (
        <div
          key={item.id}
          className="dimension-highlight"
          style={{ left: item.left, top: item.top, width: item.width, height: item.height }}
          title={[item.nominal, item.tolerance].filter(Boolean).join(" ")}
        />
      ))}
    </div>
  );
}

export function PdfUploadPrompt({ message, onUpload }) {
  return (
    <div className="upload-empty">
      <FilePlus2 size={44} />
      <h2>Upload a drawing PDF</h2>
      <p>{message}</p>
      <label className="button primary">
        <Upload size={16} />
        Choose PDF
        <input type="file" accept="application/pdf" onChange={onUpload} />
      </label>
    </div>
  );
}
