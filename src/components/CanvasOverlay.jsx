function getLeaderLine({ x, y, targetX, targetY }) {
  const radius = 13;
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

export function LeaderLayer({ balloons, selectedId, width, height }) {
  if (!width || !height) return null;
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
