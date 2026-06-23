import {
  AUTO_BALLOON_EDGE_OFFSET,
  AUTO_BALLOON_LEADER_RATIO,
  AUTO_BALLOON_MIN_SPACING,
  AUTO_BALLOON_MIN_CONFIDENCE,
  AUTO_BALLOON_MAX_LABEL_LENGTH,
  DRAWING_NUMBER_PATTERN,
  BALLOON_MARGIN,
} from "./constants.js";
import { clamp } from "./utils.js";

export function getEmbeddedAutoBalloonCandidates({ textItems, canvasSize, selectionRect }) {
  return textItems
    .map((item) => {
      const bounds = {
        x: item.left / canvasSize.width,
        y: item.top / canvasSize.height,
        width: item.width / canvasSize.width,
        height: item.height / canvasSize.height,
      };
      if (!rectsIntersect(bounds, selectionRect)) return null;
      const label = getAutoBalloonLabel(item.text);
      if (!label) return null;
      return {
        label,
        confidence: 100,
        source: "text",
        targetX: clamp(bounds.x + bounds.width / 2, 0, 1),
        targetY: clamp(bounds.y + bounds.height / 2, 0, 1),
        bounds,
      };
    })
    .filter(Boolean);
}

export function getOcrAutoBalloonCandidates({ blocks, selectionRect, imageWidth, imageHeight }) {
  if (!Array.isArray(blocks) || !imageWidth || !imageHeight) return [];

  return blocks.flatMap((block) =>
    (block.paragraphs || []).flatMap((paragraph) =>
      (paragraph.lines || []).flatMap((line) =>
        (line.words || []).map((word) => {
          const label = getAutoBalloonLabel(word.text);
          if (!label || word.confidence < AUTO_BALLOON_MIN_CONFIDENCE) return null;
          const width = Math.max(1, word.bbox.x1 - word.bbox.x0) / imageWidth * selectionRect.width;
          const height = Math.max(1, word.bbox.y1 - word.bbox.y0) / imageHeight * selectionRect.height;
          const x = selectionRect.x + (word.bbox.x0 / imageWidth) * selectionRect.width;
          const y = selectionRect.y + (word.bbox.y0 / imageHeight) * selectionRect.height;
          return {
            label,
            confidence: word.confidence,
            source: "ocr",
            targetX: clamp(x + width / 2, 0, 1),
            targetY: clamp(y + height / 2, 0, 1),
            bounds: { x, y, width, height },
          };
        }).filter(Boolean),
      ),
    ),
  );
}

export function buildAutoBalloonCandidates({ rawCandidates, selectionRect, startNo, pageCount, pageAspectRatio = 1 }) {
  const filtered = dedupeAutoBalloonCandidates(
    rawCandidates
      .filter((candidate) => !isLikelyPageNoise(candidate, pageCount))
      .sort((a, b) => (a.targetY - b.targetY) || (a.targetX - b.targetX)),
  );

  return positionAutoBalloonCandidates(filtered, selectionRect, startNo, pageAspectRatio);
}

export function renumberAutoBalloonCandidates(candidates, startNo) {
  return candidates.map((candidate, index) => ({ ...candidate, balloonNo: startNo + index }));
}

function getAutoBalloonLabel(value) {
  const label = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[,;:]+|[,;:]+$/g, "")
    .trim();

  if (!label || label.length > AUTO_BALLOON_MAX_LABEL_LENGTH) return "";
  if (!DRAWING_NUMBER_PATTERN.test(label)) return "";
  return label;
}

function isLikelyPageNoise(candidate, pageCount) {
  if (!/^\d+$/.test(candidate.label)) return false;
  const pageNumberValue = Number(candidate.label);
  if (!Number.isFinite(pageNumberValue) || pageNumberValue > Math.max(pageCount, 20)) return false;

  const nearVerticalEdge = candidate.targetY < 0.07 || candidate.targetY > 0.93;
  const nearHorizontalEdge = candidate.targetX < 0.16 || candidate.targetX > 0.84;
  const nearFooterCenter = candidate.targetY > 0.93 && candidate.targetX > 0.38 && candidate.targetX < 0.62;
  return nearVerticalEdge && (nearHorizontalEdge || nearFooterCenter);
}

function dedupeAutoBalloonCandidates(candidates) {
  const accepted = [];
  candidates.forEach((candidate) => {
    const duplicate = accepted.some((item) => {
      const sameLabel = item.label.toUpperCase() === candidate.label.toUpperCase();
      const close = Math.hypot(item.targetX - candidate.targetX, item.targetY - candidate.targetY) < 0.025;
      return sameLabel && close;
    });
    if (!duplicate) accepted.push(candidate);
  });
  return accepted;
}

function positionAutoBalloonCandidates(candidates, selectionRect, startNo, pageAspectRatio) {
  const candidatesWithEdges = candidates.map((candidate) => ({
    ...candidate,
    edge: getNearestAutoBalloonEdge(candidate, selectionRect, pageAspectRatio),
  }));
  const positionsByCandidate = new Map();

  ["top", "right", "bottom", "left"].forEach((edge) => {
    const group = candidatesWithEdges
      .filter((candidate) => candidate.edge === edge)
      .sort((a, b) =>
        edge === "left" || edge === "right"
          ? (a.targetY - b.targetY) || (a.targetX - b.targetX)
          : (a.targetX - b.targetX) || (a.targetY - b.targetY),
      );
    const axisPositions = spreadAutoBalloonEdgePositions(group, selectionRect, edge);

    group.forEach((candidate, index) => {
      positionsByCandidate.set(candidate, getAutoBalloonPosition({
        candidate,
        selectionRect,
        edge,
        axisPosition: axisPositions[index],
      }));
    });
  });

  return candidatesWithEdges
    .map((candidate) => ({
      ...candidate,
      id: crypto.randomUUID(),
      ...positionsByCandidate.get(candidate),
    }))
    .sort(compareAutoBalloonClockwise)
    .map((candidate, index) => {
      const { edge, ...candidateWithoutEdge } = candidate;
      return {
        ...candidateWithoutEdge,
        balloonNo: startNo + index,
      };
    });
}

function getNearestAutoBalloonEdge(candidate, rect, pageAspectRatio) {
  const xScale = Number.isFinite(pageAspectRatio) && pageAspectRatio > 0 ? pageAspectRatio : 1;
  const distances = {
    left: Math.abs(candidate.targetX - rect.x) * xScale,
    right: Math.abs(rect.x + rect.width - candidate.targetX) * xScale,
    top: Math.abs(candidate.targetY - rect.y),
    bottom: Math.abs(rect.y + rect.height - candidate.targetY),
  };
  const edgePriority = ["top", "bottom", "left", "right"];
  return edgePriority.reduce((nearest, edge) =>
    distances[edge] < distances[nearest] ? edge : nearest,
  );
}

function spreadAutoBalloonEdgePositions(group, rect, edge) {
  if (!group.length) return [];
  const vertical = edge === "left" || edge === "right";
  const min = vertical ? rect.y : rect.x;
  const max = vertical ? rect.y + rect.height : rect.x + rect.width;
  const desired = group.map((candidate) => vertical ? candidate.targetY : candidate.targetX);
  const spacing = AUTO_BALLOON_MIN_SPACING;
  const positions = desired.map((value) => clamp(value, min, max));

  for (let index = 1; index < positions.length; index += 1) {
    positions[index] = Math.max(positions[index], positions[index - 1] + spacing);
  }

  const overflow = positions[positions.length - 1] - max;
  if (overflow > 0) {
    positions[positions.length - 1] -= overflow;
    for (let index = positions.length - 2; index >= 0; index -= 1) {
      positions[index] = Math.min(positions[index], positions[index + 1] - spacing);
    }
  }

  const underflow = min - positions[0];
  if (underflow > 0) {
    positions[0] += underflow;
    for (let index = 1; index < positions.length; index += 1) {
      positions[index] = Math.max(positions[index], positions[index - 1] + spacing);
    }
  }

  return positions.map((value) => clamp(value, BALLOON_MARGIN, 1 - BALLOON_MARGIN));
}

function getAutoBalloonPosition({ candidate, selectionRect, edge, axisPosition }) {
  const offset = AUTO_BALLOON_EDGE_OFFSET;
  const shorten = (target, edgeValue) =>
    clamp(target + (edgeValue - target) * AUTO_BALLOON_LEADER_RATIO, BALLOON_MARGIN, 1 - BALLOON_MARGIN);

  if (edge === "left") {
    const edgeX = selectionRect.x - offset;
    return {
      x: shorten(candidate.targetX, edgeX),
      y: clamp(axisPosition, BALLOON_MARGIN, 1 - BALLOON_MARGIN),
    };
  }

  if (edge === "right") {
    const edgeX = selectionRect.x + selectionRect.width + offset;
    return {
      x: shorten(candidate.targetX, edgeX),
      y: clamp(axisPosition, BALLOON_MARGIN, 1 - BALLOON_MARGIN),
    };
  }

  const edgeY = edge === "top" ? selectionRect.y - offset : selectionRect.y + selectionRect.height + offset;
  return {
    x: clamp(axisPosition, BALLOON_MARGIN, 1 - BALLOON_MARGIN),
    y: shorten(candidate.targetY, edgeY),
  };
}

function compareAutoBalloonClockwise(a, b) {
  const edgeOrder = { top: 0, right: 1, bottom: 2, left: 3 };
  const edgeDelta = edgeOrder[a.edge] - edgeOrder[b.edge];
  if (edgeDelta !== 0) return edgeDelta;

  if (a.edge === "top") return (a.x - b.x) || (a.targetX - b.targetX);
  if (a.edge === "right") return (a.y - b.y) || (a.targetY - b.targetY);
  if (a.edge === "bottom") return (b.x - a.x) || (b.targetX - a.targetX);
  if (a.edge === "left") return (b.y - a.y) || (b.targetY - a.targetY);
  return (a.y - b.y) || (a.x - b.x);
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;
}
