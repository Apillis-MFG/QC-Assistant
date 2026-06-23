export default function ResizeHandle({
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
