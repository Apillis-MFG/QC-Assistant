import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ArrowUpDown,
  Circle,
  Download,
  Hand,
  HelpCircle,
  MousePointer2,
  PanelLeft,
  Plus,
  Ruler,
  Save,
  ScanSearch,
  Settings,
  Table2,
  TextSelect,
  Trash2,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { demoCharacteristics } from "./lib/sampleData.js";
import {
  exportBalloonedPdf,
  exportInspectionWorkbook,
  getStatus,
} from "./lib/exporters.js";
import {
  ACTIVE_PROJECT_KEY,
  PROJECT_LIMITS,
  deleteDrawing,
  deleteProject,
  getStorageEstimate,
  listProjects,
  loadDrawing,
  loadProject,
  requestPersistentStorage,
  saveDrawing,
  saveProject,
} from "./lib/projectStore.js";
import {
  methods, types, TYPE_DEFAULT_METHOD, CHARACTERISTIC_FIELDS, APP_VERSION,
  PANEL_STORAGE_KEY, RESIZE_HANDLE_SIZE,
  ZOOM_DEFAULT, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP,
  BALLOON_OFFSET, BALLOON_MARGIN,
  AUTO_BALLOON_EDGE_OFFSET, AUTO_BALLOON_LEADER_RATIO,
  AUTO_BALLOON_MIN_SPACING, AUTO_BALLOON_MIN_CONFIDENCE,
  AUTO_BALLOON_MAX_LABEL_LENGTH, DRAWING_NUMBER_PATTERN,
  defaultPanelSizes, emptyMetadata, emptyToleranceOverrides,
} from "./lib/constants.js";
import {
  buildDrawingSnapshot, updateDrawingSummary, getStorageWarning, getStorageErrorMessage,
  formatDate, setMetadataValue, mapTextItem, metadataLabel, fieldLabel,
  getNormalizedPoint, normalizeRect, getDefaultBalloonPosition, cropCanvasArea, clamp,
  parseDimension, findNearestTextDimension, findDimensionAtPoint, getTextItemBounds,
} from "./lib/utils.js";
import {
  getEmbeddedAutoBalloonCandidates, getOcrAutoBalloonCandidates, buildAutoBalloonCandidates,
  renumberAutoBalloonCandidates, nextBalloonNo, renumber,
} from "./lib/autoBalloon.js";
import {
  Field, ToolButton, ResizeHandle, TextLayer, LeaderLayer,
  AutoBalloonPreview, AutoBalloonReview, DrawingNavToolbar, PdfUploadPrompt,
  DimensionHighlights,
} from "./components/widgets.jsx";
import {
  ProjectDashboard, ProjectDetail, HelpDialog, MeasurementWorkspace, BalloonEditor, CharacteristicTable, SettingsDialog,
  ToleranceTableDialog,
} from "./components/panels.jsx";
import {
  loadBalloonSettings, saveBalloonSettings,
} from "./lib/balloonSettings.js";
import {
  parseGeneralTolerances, parseAngleTolerances, applyGeneralTolerance, getDecimalPlaces,
} from "./lib/dimensionExtractor.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function loadPanelSizes() {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    return {
      splitV: {
        inspectorWidth: Number.isFinite(saved?.splitV?.inspectorWidth)
          ? saved.splitV.inspectorWidth
          : defaultPanelSizes.splitV.inspectorWidth,
        tableHeight: Number.isFinite(saved?.splitV?.tableHeight)
          ? saved.splitV.tableHeight
          : defaultPanelSizes.splitV.tableHeight,
      },
      splitH: {
        drawingWidth: Number.isFinite(saved?.splitH?.drawingWidth)
          ? saved.splitH.drawingWidth
          : defaultPanelSizes.splitH.drawingWidth,
        inspectorHeight: Number.isFinite(saved?.splitH?.inspectorHeight)
          ? saved.splitH.inspectorHeight
          : defaultPanelSizes.splitH.inspectorHeight,
      },
    };
  } catch {
    return defaultPanelSizes;
  }
}

function createCharacteristic({ balloonNo, x = 0.5, y = 0.5, targetX = x, targetY = y, page = 1, seed = {} }) {
  return {
    id: crypto.randomUUID(),
    balloonNo,
    page,
    x,
    y,
    targetX: seed.targetX ?? targetX,
    targetY: seed.targetY ?? targetY,
    type: seed.type ?? "dimension",
    unit: seed.unit ?? "MM",
    nominal: seed.nominal ?? "",
    tolerance: seed.tolerance ?? "",
    method: seed.method ?? TYPE_DEFAULT_METHOD[seed.type ?? "dimension"] ?? "DC",
    notes: seed.notes ?? "",
    samples: seed.samples ?? {},
  };
}

function formatLocalSaveLog(drawingCount) {
  const count = drawingCount || 0;
  return `local: saved ${count} ${count === 1 ? "drawing" : "drawings"}`;
}

export default function App() {
  const [projectSummaries, setProjectSummaries] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [drawings, setDrawings] = useState([]);
  const [activeDrawingId, setActiveDrawingId] = useState(null);
  const [projectsReady, setProjectsReady] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [projectDialog, setProjectDialog] = useState({ open: false, mode: "create", projectId: null, name: "" });
  const [detailProjectId, setDetailProjectId] = useState(null);
  const [detailProject, setDetailProject] = useState(null);
  const [detailDrawings, setDetailDrawings] = useState([]);
  const [detailFields, setDetailFields] = useState({ name: "", code: "" });
  const [drawingDialog, setDrawingDialog] = useState({ open: false, drawingId: null, name: "" });
  const [saveState, setSaveState] = useState({ status: "idle", label: "local: not saved" });
  const [metadata, setMetadata] = useState(emptyMetadata);
  const [toleranceOverrides, setToleranceOverrides] = useState(emptyToleranceOverrides);
  const [sampleCount, setSampleCount] = useState(5);
  const [pdfBytes, setPdfBytes] = useState(null);
  const [pdfName, setPdfName] = useState("");
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [workspaceMode, setWorkspaceMode] = useState("edit");
  const [mode, setMode] = useState("select");
  const [characteristics, setCharacteristics] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editingBalloonId, setEditingBalloonId] = useState(null);
  const [pendingTarget, setPendingTarget] = useState(null);
  const [textItems, setTextItems] = useState([]);
  const [selectedText, setSelectedText] = useState("");
  const [ocrRect, setOcrRect] = useState(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [autoBalloonRect, setAutoBalloonRect] = useState(null);
  const [autoBalloonBusy, setAutoBalloonBusy] = useState(false);
  const [autoBalloonCandidates, setAutoBalloonCandidates] = useState([]);
  const [autoBalloonReviewOpen, setAutoBalloonReviewOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toleranceTableOpen, setToleranceTableOpen] = useState(false);
  const [balloonSettings, setBalloonSettings] = useState(loadBalloonSettings);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [layoutMode, setLayoutMode] = useState("split-v");
  const [panelSizes, setPanelSizes] = useState(loadPanelSizes);
  const [message, setMessage] = useState("Loading local projects...");
  const canvasRef = useRef(null);
  const contentAreaRef = useRef(null);
  const drawingPanelRef = useRef(null);
  const inspectorRef = useRef(null);
  const tablePanelRef = useRef(null);
  const scrollRef = useRef(null);
  const overlayRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const ocrRef = useRef(null);
  const autoBalloonRef = useRef(null);
  const panelResizeRef = useRef(null);
  const saveTimerRef = useRef(null);
  const applyingDrawingRef = useRef(false);
  const persistActiveDrawingRef = useRef(null);
  const drawingsRef = useRef([]);
  const activeDrawingRef = useRef(null);

  const selected = useMemo(
    () => characteristics.find((item) => item.id === selectedId) || null,
    [characteristics, selectedId],
  );

  const currentPageBalloons = useMemo(
    () => characteristics.filter((item) => item.page === pageNumber),
    [characteristics, pageNumber],
  );

  const projectStatus = useMemo(() => {
    if (!characteristics.length) return "OPEN";
    const statuses = characteristics.map((item) => getStatus(item, sampleCount));
    if (statuses.includes("NG")) return "FAIL";
    if (statuses.includes("OPEN")) return "OPEN";
    return "PASS";
  }, [characteristics, sampleCount]);

  const activeDrawing = useMemo(
    () => drawings.find((drawing) => drawing.id === activeDrawingId) || null,
    [activeDrawingId, drawings],
  );

  // Keyed by decimal-place count: { 1: "±0.1", 2: "±0.05", 3: "±0.005" }
  // Derived from whatever text the current page exposes (title block, notes, etc.)
  const generalTolerances = useMemo(() => parseGeneralTolerances(textItems), [textItems]);
  const autoAngleTolerances = useMemo(() => parseAngleTolerances(textItems), [textItems]);

  // Auto-detected tables above, with any per-drawing manual overrides layered on top.
  // This is the table the rest of the app should consult (auto-fill + bulk-apply UI).
  const resolvedTolerances = useMemo(() => ({
    linear: { ...generalTolerances, ...toleranceOverrides.linear },
    angle: { ...autoAngleTolerances, ...toleranceOverrides.angle },
  }), [generalTolerances, autoAngleTolerances, toleranceOverrides]);

  // All text items on the current page that parse as dimensions, with tolerance resolved.
  // Used to render highlight boxes in balloon mode and for accurate click-to-value snapping.
  const dimensionCandidates = useMemo(() => {
    if (!canvasSize.width || !canvasSize.height) return [];
    return textItems
      .map((item) => {
        const parsed = parseDimension(item.text);
        if (!parsed?.nominal) return null;
        const tolerance = applyGeneralTolerance(parsed.nominal, parsed.tolerance, resolvedTolerances.linear);
        // Keep only items that look like real dimensions: decimal point or resolvable tolerance.
        // Pure integers with no tolerance are likely drawing numbers or quantities.
        if (!tolerance && !/\./.test(parsed.nominal)) return null;
        const bounds = getTextItemBounds(item);
        return { ...item, ...bounds, nominal: parsed.nominal, tolerance };
      })
      .filter(Boolean);
  }, [textItems, canvasSize, resolvedTolerances]);

  useEffect(() => {
    drawingsRef.current = drawings;
  }, [drawings]);

  useEffect(() => {
    activeDrawingRef.current = activeDrawing;
  }, [activeDrawing]);

  const contentAreaStyle = useMemo(() => ({
    "--split-v-inspector-width": `${panelSizes.splitV.inspectorWidth}px`,
    "--split-v-table-height": `${panelSizes.splitV.tableHeight}px`,
    "--split-h-drawing-track": panelSizes.splitH.drawingWidth
      ? `${panelSizes.splitH.drawingWidth}px`
      : "calc((100% - var(--resize-handle-size)) / 2)",
    "--split-h-inspector-height": `${panelSizes.splitH.inspectorHeight}px`,
  }), [panelSizes]);

  const resetDrawingState = useCallback((nextMessage = "Upload a drawing PDF to begin.") => {
    setMetadata(emptyMetadata);
    setToleranceOverrides(emptyToleranceOverrides);
    setSampleCount(5);
    setPdfBytes(null);
    setPdfName("");
    setPdfDoc(null);
    setPageNumber(1);
    setPageCount(0);
    setZoom(ZOOM_DEFAULT);
    setCharacteristics([]);
    setSelectedId(null);
    setEditingBalloonId(null);
    setPendingTarget(null);
    setTextItems([]);
    setSelectedText("");
    setOcrRect(null);
    setAutoBalloonRect(null);
    setAutoBalloonBusy(false);
    setAutoBalloonCandidates([]);
    setAutoBalloonReviewOpen(false);
    setCanvasSize({ width: 0, height: 0 });
    setMessage(nextMessage);
  }, []);

  const refreshProjectList = useCallback(async () => {
    const summaries = await listProjects();
    setProjectSummaries(summaries);
    return summaries;
  }, []);

  const rememberActiveProject = useCallback((projectId, drawingId) => {
    try {
      localStorage.setItem(ACTIVE_PROJECT_KEY, JSON.stringify({ projectId, drawingId }));
    } catch {
      // Last-opened project is a convenience; IndexedDB remains the source of truth.
    }
  }, []);

  const applyDrawing = useCallback(async (drawingId, options = {}) => {
    if (!drawingId) {
      setActiveDrawingId(null);
      resetDrawingState(options.message || "Add a drawing PDF to this project.");
      return;
    }

    const drawing = await loadDrawing(drawingId);
    if (!drawing) {
      setMessage("Drawing could not be found in local project storage.");
      return;
    }

    applyingDrawingRef.current = true;
    try {
      const loadedPdf = drawing.pdfBytes
        ? await pdfjsLib.getDocument({ data: drawing.pdfBytes.slice(0) }).promise
        : null;

      setActiveDrawingId(drawing.id);
      setMetadata({ ...emptyMetadata, ...drawing.metadata });
      setToleranceOverrides({
        linear: { ...emptyToleranceOverrides.linear, ...drawing.toleranceOverrides?.linear },
        angle: { ...emptyToleranceOverrides.angle, ...drawing.toleranceOverrides?.angle },
      });
      setSampleCount(drawing.sampleCount || 5);
      setPdfBytes(drawing.pdfBytes || null);
      setPdfName(drawing.pdfName || "");
      setPdfDoc(loadedPdf);
      setPageCount(loadedPdf?.numPages || drawing.pageCount || 0);
      setPageNumber(clamp(drawing.pageNumber || 1, 1, loadedPdf?.numPages || drawing.pageCount || 1));
      setZoom(drawing.zoom || ZOOM_DEFAULT);
      setCharacteristics(
        (Array.isArray(drawing.characteristics) ? drawing.characteristics : [])
          .map((item) => ({ samples: {}, notes: "", ...item })),
      );
      setSelectedId(null);
      setEditingBalloonId(null);
      setPendingTarget(null);
      setTextItems([]);
      setSelectedText("");
      setOcrRect(null);
      setAutoBalloonRect(null);
      setAutoBalloonBusy(false);
      setAutoBalloonCandidates([]);
      setAutoBalloonReviewOpen(false);
      setCanvasSize({ width: 0, height: 0 });
      setSaveState({ status: "saved", label: "Saved locally" });
      setMessage(options.message || `Opened ${drawing.name || drawing.pdfName || "drawing"}.`);
      if (options.projectId) rememberActiveProject(options.projectId, drawing.id);
    } catch (error) {
      setMessage(`Could not open drawing: ${error.message}`);
    } finally {
      window.setTimeout(() => {
        applyingDrawingRef.current = false;
      }, 0);
    }
  }, [rememberActiveProject, resetDrawingState]);

  const openProjectWorkspace = useCallback(async (projectId, preferredDrawingId = null) => {
    const workspace = await loadProject(projectId);
    if (!workspace) {
      setMessage("Project could not be found in local storage.");
      return;
    }

    setActiveProject(workspace.project);
    setDrawings(workspace.drawings);
    const nextDrawingId = preferredDrawingId && workspace.drawings.some((drawing) => drawing.id === preferredDrawingId)
      ? preferredDrawingId
      : workspace.drawings[0]?.id || null;
    rememberActiveProject(workspace.project.id, nextDrawingId);
    await applyDrawing(nextDrawingId, {
      projectId: workspace.project.id,
      message: nextDrawingId
        ? `Opened ${workspace.project.name}.`
        : `Opened ${workspace.project.name}. Add a drawing PDF to begin.`,
    });
  }, [applyDrawing, rememberActiveProject]);

  useEffect(() => {
    let cancelled = false;

    async function restoreWorkspace() {
      try {
        await requestPersistentStorage();
        const summaries = await listProjects();
        if (cancelled) return;
        setProjectSummaries(summaries);

        setActiveProject(null);
        setDrawings([]);
        setActiveDrawingId(null);
        setPage("dashboard");
        resetDrawingState(
          summaries.length
            ? "Open a project from the dashboard to continue."
            : "Create a project to begin.",
        );
        setSaveState({ status: "idle", label: "Not saved" });
      } catch (error) {
        if (!cancelled) {
          setMessage(`Project storage could not load: ${error.message}`);
          setSaveState({ status: "error", label: "Storage unavailable" });
        }
      } finally {
        if (!cancelled) setProjectsReady(true);
      }
    }

    restoreWorkspace();
    return () => {
      cancelled = true;
    };
  }, [resetDrawingState]);

  useEffect(() => {
    let cancelled = false;
    async function renderPage() {
      if (!pdfDoc || !canvasRef.current) return;
      const page = await pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      const outputScale = window.devicePixelRatio || 1;
      const textContentPromise = workspaceMode !== "measurement" ? page.getTextContent() : null;

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
      context.clearRect(0, 0, viewport.width, viewport.height);

      await page.render({ canvasContext: context, viewport }).promise;
      const textContent = textContentPromise ? await textContentPromise : null;
      const nextTextItems = textContent
        ? textContent.items.map((item, index) => mapTextItem(item, index, viewport, zoom)).filter(Boolean)
        : [];

      if (!cancelled) {
        setCanvasSize({ width: viewport.width, height: viewport.height });
        setTextItems(nextTextItems);
      }
    }
    renderPage().catch((error) => setMessage(error.message));
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber, workspaceMode, zoom]);

  useEffect(() => {
    setPendingTarget(null);
  }, [mode, pageNumber]);

  useEffect(() => {
    autoBalloonRef.current = null;
    setAutoBalloonRect(null);
    setAutoBalloonCandidates([]);
    setAutoBalloonReviewOpen(false);
  }, [pageNumber]);

  useEffect(() => {
    if (mode !== "text") window.getSelection()?.removeAllRanges();
    if (mode !== "text") setOcrRect(null);
    if (mode !== "autoBalloon") {
      setAutoBalloonRect(null);
      autoBalloonRef.current = null;
    }
  }, [mode]);

  const switchMode = useCallback((nextMode) => {
    setMode(nextMode);
    setEditingBalloonId(null);
    const messages = {
      select: "Select balloons to inspect, drag, or press E to edit actions.",
      balloon: "Click a dimension target to place the next balloon. Drag later to adjust.",
      autoBalloon: "Drag around drawing numbers to review detected balloon candidates.",
      pan: "Drag the drawing to pan around the page.",
      text: "Click embedded PDF text or drag an OCR box, then send it to metadata or the selected QC row.",
    };
    setMessage(messages[nextMode] || "");
  }, []);

  const switchWorkspaceMode = useCallback((nextMode) => {
    setWorkspaceMode(nextMode);
    setEditingBalloonId(null);
    setPendingTarget(null);
    setOcrRect(null);
    setAutoBalloonRect(null);
    setAutoBalloonCandidates([]);
    setAutoBalloonReviewOpen(false);
    dragRef.current = null;
    ocrRef.current = null;
    autoBalloonRef.current = null;
    panRef.current = null;
    panelResizeRef.current = null;
    setSelectedText("");

    if (nextMode === "measurement") {
      setMode("select");
      window.getSelection()?.removeAllRanges();
      setMessage("Measurement mode: drawing is view-only. Enter QC/FAI values without moving balloons.");
      return;
    }

    setMode("select");
    setMessage("Edit mode: add balloons, capture drawing text, and refine requirement setup.");
  }, []);

  useEffect(() => {
    const handleShortcut = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      const isTyping =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.isContentEditable;
      if (isTyping) return;

      const key = event.key.toLowerCase();
      if (key === "escape") {
        if (settingsOpen || toleranceTableOpen) {
          event.preventDefault();
          setSettingsOpen(false);
          setToleranceTableOpen(false);
          return;
        }
        if (helpOpen || editingBalloonId || ocrRect || autoBalloonRect || autoBalloonReviewOpen || pendingTarget) {
          event.preventDefault();
          setHelpOpen(false);
          setEditingBalloonId(null);
          setPendingTarget(null);
          setOcrRect(null);
          setAutoBalloonRect(null);
          setAutoBalloonCandidates([]);
          setAutoBalloonReviewOpen(false);
        }
        return;
      }
      if (helpOpen || settingsOpen || toleranceTableOpen) return;
      if (workspaceMode === "measurement") return;

      const shortcutModes = {
        b: "balloon",
        v: "select",
        h: "pan",
        t: "text",
        a: "autoBalloon",
      };
      if (shortcutModes[key]) {
        event.preventDefault();
        switchMode(shortcutModes[key]);
        return;
      }

      if (key === "e" && selected?.page === pageNumber) {
        event.preventDefault();
        setEditingBalloonId(selected.id);
        setMessage(`Editing balloon ${selected.balloonNo}.`);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [autoBalloonRect, autoBalloonReviewOpen, editingBalloonId, helpOpen, settingsOpen, toleranceTableOpen, ocrRect, pageNumber, pendingTarget, selected, switchMode, workspaceMode]);

  const persistActiveDrawing = useCallback(async (reason = "auto") => {
    if (!projectsReady || !activeProject?.id || !activeDrawingId) return;

    const now = new Date().toISOString();
    const projectRecord = {
      id: activeProject.id,
      name: activeProject.name || "Untitled Project",
      createdAt: activeProject.createdAt,
      updatedAt: now,
    };
    const snapshot = buildDrawingSnapshot({
      drawing: activeDrawingRef.current,
      activeDrawingId,
      activeProjectId: activeProject.id,
      metadata,
      toleranceOverrides,
      sampleCount,
      pdfBytes,
      pdfName,
      pageCount,
      pageNumber,
      zoom,
      characteristics,
      status: projectStatus,
      now,
    });

    try {
      setSaveState({ status: "saving", label: reason === "manual" ? "local: saving..." : "local: autosaving..." });
      await saveProject(projectRecord);
      const savedDrawing = await saveDrawing(activeProject.id, snapshot);
      const summaries = await refreshProjectList();
      const estimate = await getStorageEstimate();
      const nextDrawings = updateDrawingSummary(drawingsRef.current, savedDrawing);
      setActiveProject(projectRecord);
      setDrawings(nextDrawings);
      rememberActiveProject(activeProject.id, activeDrawingId);

      const projectBytes = nextDrawings.reduce((sum, drawing) => sum + (drawing.pdfByteLength || 0), 0);
      const warning = getStorageWarning({
        drawingBytes: savedDrawing.pdfByteLength || 0,
        projectBytes,
        estimate,
      });
      const projectSummary = summaries.find((project) => project.id === activeProject.id);
      setSaveState({
        status: warning ? "warning" : "saved",
        label: warning || formatLocalSaveLog(projectSummary?.drawingCount || nextDrawings.length),
      });
    } catch (error) {
      setSaveState({ status: "error", label: getStorageErrorMessage(error) });
      setMessage(getStorageErrorMessage(error));
    }
  }, [
    activeDrawingId,
    activeProject?.createdAt,
    activeProject?.id,
    activeProject?.name,
    characteristics,
    metadata,
    toleranceOverrides,
    pageCount,
    pageNumber,
    pdfBytes,
    pdfName,
    projectStatus,
    projectsReady,
    refreshProjectList,
    rememberActiveProject,
    sampleCount,
    zoom,
  ]);

  useEffect(() => {
    persistActiveDrawingRef.current = persistActiveDrawing;
  }, [persistActiveDrawing]);

  useEffect(() => {
    if (!projectsReady || applyingDrawingRef.current || !activeProject?.id || !activeDrawingId) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      persistActiveDrawing("auto");
    }, 800);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [
    activeDrawingId,
    activeProject?.id,
    characteristics,
    metadata,
    pageCount,
    pageNumber,
    pdfBytes,
    pdfName,
    persistActiveDrawing,
    projectsReady,
    sampleCount,
    zoom,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(panelSizes));
    } catch {
      // panel sizing is a convenience; do not block the inspection workflow
    }
  }, [panelSizes]);

  useEffect(() => {
    document.documentElement.style.setProperty("--balloon-size", `${balloonSettings.diameter}px`);
    document.documentElement.style.setProperty("--balloon-font-size", `${balloonSettings.fontSize}px`);
    saveBalloonSettings(balloonSettings);
  }, [balloonSettings]);

  const getContentMetrics = useCallback(() => {
    const element = contentAreaRef.current;
    if (!element) return null;
    const styles = window.getComputedStyle(element);
    const width = element.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
    const height = element.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);
    return { width, height };
  }, []);

  const createProject = useCallback(async (name = "Untitled Project") => {
    const now = new Date().toISOString();
    const project = {
      id: crypto.randomUUID(),
      name: name.trim() || "Untitled Project",
      code: "",
      createdAt: now,
      updatedAt: now,
    };
    await saveProject(project);
    setActiveProject(project);
    setDrawings([]);
    setActiveDrawingId(null);
    rememberActiveProject(project.id, null);
    resetDrawingState(`Created ${project.name}. Add a drawing PDF to begin.`);
    await refreshProjectList();
    setSaveState({ status: "saved", label: "local: project created" });
    return project;
  }, [refreshProjectList, rememberActiveProject, resetDrawingState]);

  const handleNewProject = useCallback(() => {
    setProjectDialog({ open: true, mode: "create", projectId: null, name: "" });
  }, []);

  const handleOpenProjectDialog = useCallback((project) => {
    setProjectDialog({ open: true, mode: "rename", projectId: project.id, name: project.name || "" });
  }, []);

  const handleCloseProjectDialog = useCallback(() => {
    setProjectDialog((current) => ({ ...current, open: false }));
  }, []);

  const handleProjectDialogSubmit = useCallback(async (event) => {
    event.preventDefault();
    const name = projectDialog.name.trim();
    if (!name) {
      setMessage("Project name is required.");
      return;
    }

    try {
      if (projectDialog.mode === "create") {
        const project = await createProject(name);
        setProjectDialog({ open: false, mode: "create", projectId: null, name: "" });
        setPage("workspace");
        await openProjectWorkspace(project.id);
        return;
      }

      const currentProject = projectSummaries.find((project) => project.id === projectDialog.projectId);
      if (!currentProject) {
        setMessage("Project could not be found for rename.");
        return;
      }

      const updatedProject = {
        id: currentProject.id,
        name,
        code: currentProject.code,
        createdAt: currentProject.createdAt,
        updatedAt: new Date().toISOString(),
      };
      await saveProject(updatedProject);
      if (activeProject?.id === updatedProject.id) setActiveProject(updatedProject);
      if (detailProjectId === updatedProject.id) {
        setDetailProject(updatedProject);
        setDetailFields({ name: updatedProject.name, code: updatedProject.code || "" });
      }
      await refreshProjectList();
      setProjectDialog({ open: false, mode: "create", projectId: null, name: "" });
      setSaveState({ status: "saved", label: "local: project renamed" });
      setMessage(`Renamed project to ${name}.`);
    } catch (error) {
      setMessage(`Could not save project name: ${error.message}`);
    }
  }, [activeProject?.id, createProject, openProjectWorkspace, projectDialog, projectSummaries, refreshProjectList]);

  const handleOpenProject = useCallback(async (projectId) => {
    if (!projectId) return;
    try {
      await openProjectWorkspace(projectId);
      setPage("workspace");
      await refreshProjectList();
    } catch (error) {
      setMessage(`Could not open project: ${error.message}`);
    }
  }, [openProjectWorkspace, refreshProjectList]);

  const handleOpenDrawing = useCallback(async (drawingId) => {
    if (!drawingId || drawingId === activeDrawingId) return;
    window.clearTimeout(saveTimerRef.current);
    await persistActiveDrawingRef.current?.("manual");
    await applyDrawing(drawingId, { projectId: activeProject?.id });
  }, [activeDrawingId, activeProject?.id, applyDrawing]);

  const handlePdfUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (drawings.length >= PROJECT_LIMITS.maxDrawings) {
      setMessage(`This project already has ${PROJECT_LIMITS.maxDrawings} drawings. Create a new project for more drawings.`);
      event.target.value = "";
      return;
    }

    try {
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      const estimate = await getStorageEstimate();
      const storageFree = estimate?.quota && estimate?.usage ? estimate.quota - estimate.usage : null;
      if (storageFree !== null && storageFree < file.size) {
        setMessage("Browser storage looks low. This drawing may fail to save locally.");
      } else if (file.size > PROJECT_LIMITS.largePdfBytes) {
        setMessage("Large PDF warning: this drawing is over 25 MB and may consume local storage quickly.");
      }

      const project = activeProject || await createProject(baseName || "Untitled Project");
      const bytes = await file.arrayBuffer();
      const loadedPdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const now = new Date().toISOString();
      const nextProject = { ...project, updatedAt: now };
      const drawing = {
        id: crypto.randomUUID(),
        projectId: project.id,
        name: baseName || file.name,
        pdfName: file.name,
        pdfBytes: bytes,
        pdfByteLength: file.size || bytes.byteLength,
        pageCount: loadedPdf.numPages,
        metadata: { ...emptyMetadata, drawingNo: baseName },
        sampleCount: 5,
        characteristics: [],
        pageNumber: 1,
        zoom: ZOOM_DEFAULT,
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
      };
      await saveProject(nextProject);
      const savedDrawing = await saveDrawing(project.id, drawing);

      applyingDrawingRef.current = true;
      setActiveProject(nextProject);
      setDrawings((items) => updateDrawingSummary(items, savedDrawing));
      setActiveDrawingId(savedDrawing.id);
      setMetadata(drawing.metadata);
      setToleranceOverrides(emptyToleranceOverrides);
      setSampleCount(5);
      setPdfBytes(bytes);
      setPdfName(file.name);
      setPdfDoc(loadedPdf);
      setPageCount(loadedPdf.numPages);
      setPageNumber(1);
      setZoom(ZOOM_DEFAULT);
      setCharacteristics([]);
      setSelectedId(null);
      setEditingBalloonId(null);
      setPendingTarget(null);
      setSelectedText("");
      setOcrRect(null);
      setAutoBalloonRect(null);
      setAutoBalloonBusy(false);
      setAutoBalloonCandidates([]);
      setAutoBalloonReviewOpen(false);
      setCanvasSize({ width: 0, height: 0 });
      rememberActiveProject(project.id, savedDrawing.id);
      await refreshProjectList();
      setSaveState({ status: "saved", label: "local: drawing saved" });
      setMessage(`Added ${file.name} to ${nextProject.name}.`);
    } catch (error) {
      const messageText = getStorageErrorMessage(error);
      setSaveState({ status: "error", label: messageText });
      setMessage(messageText);
    } finally {
      applyingDrawingRef.current = false;
      event.target.value = "";
    }
  }, [activeProject, createProject, drawings.length, refreshProjectList, rememberActiveProject]);

  const handleCanvasClick = useCallback(
    (event) => {
      if (!overlayRef.current || !pdfDoc) return;
      const point = getNormalizedPoint(event, overlayRef.current);

      if (mode === "balloon") {
        // Prefer a highlighted dimension rect over fuzzy nearest-text search.
        const hit = findDimensionAtPoint(point, dimensionCandidates, canvasSize);

        // Snap target to the center of the highlight so the leader points exactly at the text.
        const target = hit
          ? {
              x: clamp((hit.left + hit.width / 2) / canvasSize.width, 0, 1),
              y: clamp((hit.top + hit.height / 2) / canvasSize.height, 0, 1),
            }
          : point;

        const resolvedSeed = hit
          ? { nominal: hit.nominal, tolerance: hit.tolerance }
          : (() => {
              const dim = findNearestTextDimension(point, textItems, canvasSize);
              return dim
                ? { ...dim, tolerance: applyGeneralTolerance(dim.nominal, dim.tolerance, resolvedTolerances.linear) }
                : {};
            })();

        const position = getDefaultBalloonPosition(target, balloonSettings.leaderScale);
        const next = createCharacteristic({
          balloonNo: nextBalloonNo(characteristics),
          x: position.x,
          y: position.y,
          targetX: target.x,
          targetY: target.y,
          page: pageNumber,
          seed: resolvedSeed,
        });
        setCharacteristics((items) => [...items, next]);
        setSelectedId(next.id);
        setEditingBalloonId(null);
        setPendingTarget(null);
        setMessage(`Added balloon ${next.balloonNo}. Drag the balloon or target to adjust; double-click or press E to edit.`);
      } else if (mode === "select") {
        setEditingBalloonId(null);
      }
    },
    [characteristics, mode, pageNumber, pdfDoc],
  );

  const selectCharacteristic = useCallback((id) => {
    setSelectedId(id);
    setEditingBalloonId(null);
  }, []);

  const zoomOut = useCallback(() => setZoom((v) => Math.max(ZOOM_MIN, v - ZOOM_STEP)), []);
  const zoomIn = useCallback(() => setZoom((v) => Math.min(ZOOM_MAX, v + ZOOM_STEP)), []);
  const prevPage = useCallback(() => setPageNumber((v) => v - 1), []);
  const nextPage = useCallback(() => setPageNumber((v) => v + 1), []);

  const updateCharacteristic = useCallback((id, patch) => {
    setCharacteristics((items) =>
      items.map((item) => {
        if (item.id !== id) return item;
        const nextType = patch.type ?? item.type;
        const nextPatch = patch.type && !("method" in patch)
          ? { ...patch, method: TYPE_DEFAULT_METHOD[nextType] ?? item.method }
          : patch;
        return { ...item, ...nextPatch };
      }),
    );
  }, []);

  const isAngleUnit = useCallback((unit) => /°|deg/i.test(String(unit || "").trim()), []);

  // Live count of dimension rows a given tolerance-table bucket would fill in
  // (blank tolerance, matching decimal-place count and linear/angle kind).
  const countToleranceMatches = useCallback((kind, places) => {
    return characteristics.filter((item) =>
      item.type === "dimension" &&
      !item.tolerance &&
      isAngleUnit(item.unit) === (kind === "angle") &&
      getDecimalPlaces(item.nominal) === places,
    ).length;
  }, [characteristics, isAngleUnit]);

  // Fills the tolerance on every matching-but-blank dimension. Never overwrites
  // an existing tolerance, so it's safe to run repeatedly without confirmation.
  const applyToleranceToMatching = useCallback((kind, places, value) => {
    if (!value) return;
    setCharacteristics((items) =>
      items.map((item) => {
        if (item.type !== "dimension" || item.tolerance) return item;
        if (isAngleUnit(item.unit) !== (kind === "angle")) return item;
        if (getDecimalPlaces(item.nominal) !== places) return item;
        return { ...item, tolerance: value };
      }),
    );
  }, [isAngleUnit]);

  const applyToleranceOverride = useCallback((kind, places, value) => {
    setToleranceOverrides((current) => ({
      ...current,
      [kind]: { ...current[kind], [places]: value },
    }));
  }, []);

  const resetToleranceOverride = useCallback((kind, places) => {
    setToleranceOverrides((current) => {
      const next = { ...current[kind] };
      delete next[places];
      return { ...current, [kind]: next };
    });
  }, []);

  const reassignBalloonNo = useCallback((id, rawValue) => {
    const nextNo = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(nextNo) || nextNo < 1) {
      setMessage("Balloon number must be a positive whole number.");
      return;
    }

    setCharacteristics((items) => {
      const current = items.find((item) => item.id === id);
      if (!current || current.balloonNo === nextNo) return items;

      const currentNo = current.balloonNo;
      return items.map((item) => {
        if (item.id === id) return { ...item, balloonNo: nextNo };
        if (item.balloonNo === nextNo) return { ...item, balloonNo: currentNo };
        return item;
      });
    });
    setMessage(`Reassigned balloon to ${nextNo}.`);
  }, []);

  const updateSample = useCallback((id, sampleIndex, value) => {
    setCharacteristics((items) =>
      items.map((item) =>
        item.id === id
          ? { ...item, samples: { ...item.samples, [sampleIndex]: value } }
          : item,
      ),
    );
  }, []);

  const updatePosition = useCallback((id, clientX, clientY, point = "balloon") => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clamp((clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((clientY - rect.top) / rect.height, 0, 1);
    const patch = point === "target" ? { targetX: x, targetY: y } : { x, y };
    updateCharacteristic(id, patch);
  }, [updateCharacteristic]);

  const beginBalloonDrag = useCallback((event, item) => {
    event.stopPropagation();
    setSelectedId(item.id);
    setEditingBalloonId(null);
    dragRef.current = { id: item.id, pointerId: event.pointerId, point: "balloon" };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const beginTargetDrag = useCallback((event, item) => {
    event.stopPropagation();
    setSelectedId(item.id);
    setEditingBalloonId(null);
    dragRef.current = { id: item.id, pointerId: event.pointerId, point: "target" };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const moveBalloonDrag = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    updatePosition(drag.id, event.clientX, event.clientY, drag.point);
  }, [updatePosition]);

  const endBalloonDrag = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;

    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);

    if (drag.point === "target") {
      const detected = findNearestTextDimension({ x, y }, textItems, canvasSize);
      if (detected?.nominal) {
        const resolvedTol = applyGeneralTolerance(detected.nominal, detected.tolerance, resolvedTolerances.linear);
        updateCharacteristic(drag.id, {
          targetX: x,
          targetY: y,
          nominal: detected.nominal,
          ...(resolvedTol ? { tolerance: resolvedTol } : {}),
        });
      } else {
        updateCharacteristic(drag.id, { targetX: x, targetY: y });
      }
    } else {
      updateCharacteristic(drag.id, { x, y });
    }
  }, [canvasSize, resolvedTolerances, textItems, updateCharacteristic]);

  const beginPan = useCallback((event) => {
    if (mode !== "pan" || !scrollRef.current) return;
    event.preventDefault();
    panRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: scrollRef.current.scrollLeft,
      scrollTop: scrollRef.current.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [mode]);

  const movePan = useCallback((event) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId || !scrollRef.current) return;
    scrollRef.current.scrollLeft = pan.scrollLeft - (event.clientX - pan.clientX);
    scrollRef.current.scrollTop = pan.scrollTop - (event.clientY - pan.clientY);
  }, []);

  const endPan = useCallback((event) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    panRef.current = null;
  }, []);

  const captureTextSelection = useCallback((fallback = "") => {
    const selection = window.getSelection()?.toString().replace(/\s+/g, " ").trim() || "";
    const text = (selection || fallback).replace(/\s+/g, " ").trim();
    if (!text) return;
    setSelectedText(text);
    setMessage(`Captured text: ${text}`);
  }, []);

  const recognizeSelectedArea = useCallback(async (rect) => {
    if (!canvasRef.current) return;

    try {
      setOcrBusy(true);
      setMessage("Reading selected drawing area...");
      const { dataUrl } = cropCanvasArea(canvasRef.current, rect);
      const { recognize } = await import("tesseract.js");
      const result = await recognize(dataUrl, "eng");
      const text = result.data.text.replace(/\s+/g, " ").trim();
      setSelectedText(text);
      setMessage(text ? `OCR captured: ${text}` : "No readable text found in selected area.");
    } catch (error) {
      setMessage(`OCR failed: ${error.message}`);
    } finally {
      setOcrBusy(false);
      setOcrRect(null);
    }
  }, []);

  const detectAutoBalloonCandidates = useCallback(async (rect) => {
    if (!canvasRef.current || !canvasSize.width || !canvasSize.height) return;

    try {
      setAutoBalloonBusy(true);
      setAutoBalloonCandidates([]);
      setAutoBalloonReviewOpen(false);
      setMessage("Reviewing selected area for balloon candidates...");

      let rawCandidates = getEmbeddedAutoBalloonCandidates({ textItems, canvasSize, selectionRect: rect });
      let sourceLabel = "PDF text";

      if (!rawCandidates.length) {
        const crop = cropCanvasArea(canvasRef.current, rect);
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng");

        try {
          await worker.setParameters({
            preserve_interword_spaces: "1",
            tessedit_pageseg_mode: "11",
          });
          const result = await worker.recognize(crop.dataUrl, {}, { blocks: true });
          rawCandidates = getOcrAutoBalloonCandidates({
            blocks: result.data.blocks,
            selectionRect: rect,
            imageWidth: crop.width,
            imageHeight: crop.height,
          });
          sourceLabel = "OCR";
        } finally {
          await worker.terminate();
        }
      }

      const startNo = nextBalloonNo(characteristics);
      const candidates = buildAutoBalloonCandidates({
        rawCandidates,
        selectionRect: rect,
        startNo,
        pageCount,
        pageAspectRatio: canvasSize.width / canvasSize.height,
      });

      setAutoBalloonCandidates(candidates);
      setAutoBalloonReviewOpen(candidates.length > 0);
      setMessage(
        candidates.length
          ? `Review ${candidates.length} ${sourceLabel} candidate${candidates.length === 1 ? "" : "s"} before adding balloons.`
          : "No numeric balloon candidates found in the selected area.",
      );
    } catch (error) {
      setMessage(`Candidate review failed: ${error.message}`);
    } finally {
      setAutoBalloonBusy(false);
      setAutoBalloonRect(null);
    }
  }, [canvasSize, characteristics, pageCount, textItems]);

  const beginTextAreaSelection = useCallback((event) => {
    const isTextMode = mode === "text";
    const isAutoBalloonMode = mode === "autoBalloon";
    if ((!isTextMode && !isAutoBalloonMode) || !overlayRef.current) return;
    if (event.button !== 0) return;
    if (isTextMode && event.target.closest(".pdf-text-item")) return;

    const point = getNormalizedPoint(event, overlayRef.current);
    const selection = { pointerId: event.pointerId, startX: point.x, startY: point.y };
    if (isAutoBalloonMode) {
      autoBalloonRef.current = selection;
      setAutoBalloonCandidates([]);
      setAutoBalloonReviewOpen(false);
      setAutoBalloonRect({ x: point.x, y: point.y, width: 0, height: 0 });
    } else {
      ocrRef.current = selection;
      setOcrRect({ x: point.x, y: point.y, width: 0, height: 0 });
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [mode]);

  const moveTextAreaSelection = useCallback((event) => {
    const autoSelection = autoBalloonRef.current;
    if (autoSelection?.pointerId === event.pointerId && overlayRef.current) {
      const point = getNormalizedPoint(event, overlayRef.current);
      setAutoBalloonRect(normalizeRect(autoSelection.startX, autoSelection.startY, point.x, point.y));
      return;
    }

    const selection = ocrRef.current;
    if (!selection || selection.pointerId !== event.pointerId || !overlayRef.current) return;

    const point = getNormalizedPoint(event, overlayRef.current);
    setOcrRect(normalizeRect(selection.startX, selection.startY, point.x, point.y));
  }, []);

  const endTextAreaSelection = useCallback(async (event) => {
    const autoSelection = autoBalloonRef.current;
    if (autoSelection?.pointerId === event.pointerId && overlayRef.current) {
      const point = getNormalizedPoint(event, overlayRef.current);
      const rect = normalizeRect(autoSelection.startX, autoSelection.startY, point.x, point.y);
      autoBalloonRef.current = null;

      if (rect.width < 0.012 || rect.height < 0.012) {
        setAutoBalloonRect(null);
        return;
      }

      await detectAutoBalloonCandidates(rect);
      return;
    }

    const selection = ocrRef.current;
    if (!selection || selection.pointerId !== event.pointerId || !overlayRef.current) return;

    const point = getNormalizedPoint(event, overlayRef.current);
    const rect = normalizeRect(selection.startX, selection.startY, point.x, point.y);
    ocrRef.current = null;

    if (rect.width < 0.012 || rect.height < 0.012) {
      setOcrRect(null);
      return;
    }

    await recognizeSelectedArea(rect);
  }, [detectAutoBalloonCandidates, recognizeSelectedArea]);

  const applyCapturedText = useCallback((destination) => {
    const text = selectedText.trim();
    if (!text) return;

    if (["drawingNo", "revision", "supplier", "description"].includes(destination)) {
      setMetadata((current) => ({ ...current, [destination]: text }));
      setMessage(`Filled ${metadataLabel(destination)} from selected PDF text.`);
      return;
    }

    if (!selectedId) {
      setMessage("Select a balloon row before filling QC fields.");
      return;
    }

    if (!CHARACTERISTIC_FIELDS.includes(destination)) return;
    updateCharacteristic(selectedId, { [destination]: text });
    setMessage(`Filled selected row ${fieldLabel(destination)} from PDF text.`);
  }, [selectedId, selectedText, updateCharacteristic]);

  const addManualRow = useCallback(() => {
    const next = createCharacteristic({ balloonNo: nextBalloonNo(characteristics), page: pageNumber });
    setCharacteristics((items) => [...items, next]);
    setSelectedId(next.id);
    setEditingBalloonId(null);
    setMessage(`Added row ${next.balloonNo}. Click the drawing to place its balloon later.`);
  }, [characteristics, pageNumber]);

  const cancelAutoBalloonReview = useCallback(() => {
    setAutoBalloonRect(null);
    setAutoBalloonCandidates([]);
    setAutoBalloonReviewOpen(false);
    setMessage("Canceled candidate review.");
  }, []);

  const removeAutoBalloonCandidate = useCallback((id) => {
    setAutoBalloonCandidates((items) =>
      renumberAutoBalloonCandidates(
        items.filter((item) => item.id !== id),
        nextBalloonNo(characteristics),
      ),
    );
  }, [characteristics]);

  const commitAutoBalloonCandidates = useCallback(() => {
    if (!autoBalloonCandidates.length) return;

    const startNo = nextBalloonNo(characteristics);
    const rows = autoBalloonCandidates.map((candidate, index) =>
      createCharacteristic({
        balloonNo: startNo + index,
        x: candidate.x,
        y: candidate.y,
        targetX: candidate.targetX,
        targetY: candidate.targetY,
        page: pageNumber,
        seed: (() => {
          const parsed = parseDimension(candidate.label);
          if (!parsed) return {};
          return {
            ...parsed,
            tolerance: applyGeneralTolerance(parsed.nominal, parsed.tolerance, resolvedTolerances.linear),
          };
        })(),
      }),
    );

    setCharacteristics((items) => [...items, ...rows]);
    setSelectedId(rows[0]?.id || null);
    setEditingBalloonId(null);
    setAutoBalloonRect(null);
    setAutoBalloonCandidates([]);
    setAutoBalloonReviewOpen(false);
    setMessage(`Added ${rows.length} reviewed balloon${rows.length === 1 ? "" : "s"}. Drag any balloon or target to refine placement.`);
  }, [autoBalloonCandidates, characteristics, resolvedTolerances, pageNumber]);

  const loadDemoRows = useCallback(() => {
    const positions = [
      [0.53, 0.72],
      [0.24, 0.7],
      [0.22, 0.58],
      [0.31, 0.52],
      [0.38, 0.52],
      [0.55, 0.44],
      [0.84, 0.48],
    ];
    const targets = [
      [0.53, 0.68],
      [0.25, 0.69],
      [0.22, 0.57],
      [0.31, 0.48],
      [0.38, 0.48],
      [0.55, 0.40],
      [0.80, 0.45],
    ];
    const rows = demoCharacteristics.map((seed, index) =>
      createCharacteristic({
        balloonNo: index + 1,
        page: 1,
        x: positions[index][0],
        y: positions[index][1],
        targetX: targets[index][0],
        targetY: targets[index][1],
        seed,
      }),
    );
    setCharacteristics(rows);
    setSelectedId(rows[0]?.id || null);
    setEditingBalloonId(null);
    setMessage("Loaded demo QC characteristics. Adjust positions and values for your drawing.");
  }, []);

  const clearAllBalloons = useCallback(() => {
    if (!characteristics.length) return;
    const confirmed = window.confirm(
      `Clear all ${characteristics.length} balloon${characteristics.length === 1 ? "" : "s"} from this drawing and table?`,
    );
    if (!confirmed) return;
    setCharacteristics([]);
    setSelectedId(null);
    setEditingBalloonId(null);
    setMessage("Cleared all balloons from the drawing and table.");
  }, [characteristics.length]);

  const clearDrawingData = useCallback(() => {
    setMetadata(emptyMetadata);
    setToleranceOverrides(emptyToleranceOverrides);
    setSampleCount(5);
    setCharacteristics([]);
    setSelectedId(null);
    setEditingBalloonId(null);
    setPendingTarget(null);
    setSelectedText("");
    setOcrRect(null);
    setAutoBalloonRect(null);
    setAutoBalloonBusy(false);
    setAutoBalloonCandidates([]);
    setAutoBalloonReviewOpen(false);
    setMessage("Cleared inspection data for the active drawing.");
  }, []);

  const handleDeleteProjectFromDashboard = useCallback(async (project) => {
    const confirmed = window.confirm(`Delete project "${project.name}" and all local drawings?`);
    if (!confirmed) return;

    try {
      await deleteProject(project.id);
      if (activeProject?.id === project.id) {
        setActiveProject(null);
        setDrawings([]);
        setActiveDrawingId(null);
        resetDrawingState("Project deleted. Open or create another project.");
      }
      await refreshProjectList();
      setSaveState({ status: "saved", label: "local: project deleted" });
      setMessage(`Deleted ${project.name}.`);
    } catch (error) {
      setMessage(`Could not delete project: ${error.message}`);
    }
  }, [activeProject?.id, refreshProjectList, resetDrawingState]);

  const handleManageProject = useCallback(async (projectId) => {
    const workspace = await loadProject(projectId);
    if (!workspace) {
      setMessage("Project could not be found in local storage.");
      return;
    }
    setDetailProjectId(projectId);
    setDetailProject(workspace.project);
    setDetailDrawings(workspace.drawings);
    setDetailFields({ name: workspace.project.name, code: workspace.project.code || "" });
    setPage("detail");
  }, []);

  const handleBackFromDetail = useCallback(async () => {
    setPage("dashboard");
    setDetailProjectId(null);
    setDetailProject(null);
    setDetailDrawings([]);
    await refreshProjectList();
  }, [refreshProjectList]);

  const handleDetailFieldChange = useCallback((field, value) => {
    setDetailFields((current) => ({ ...current, [field]: value }));
  }, []);

  const handleSaveDetailFields = useCallback(async () => {
    const name = detailFields.name.trim();
    if (!name || !detailProject) return;

    const updatedProject = {
      ...detailProject,
      name,
      code: detailFields.code.trim(),
      updatedAt: new Date().toISOString(),
    };
    await saveProject(updatedProject);
    setDetailProject(updatedProject);
    if (activeProject?.id === updatedProject.id) setActiveProject(updatedProject);
    await refreshProjectList();
    setMessage(`Saved ${updatedProject.name}.`);
  }, [activeProject?.id, detailFields, detailProject, refreshProjectList]);

  const handleDetailAddDrawing = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file || !detailProjectId) return;

    if (detailDrawings.length >= PROJECT_LIMITS.maxDrawings) {
      setMessage(`This project already has ${PROJECT_LIMITS.maxDrawings} drawings. Create a new project for more drawings.`);
      event.target.value = "";
      return;
    }

    try {
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      const bytes = await file.arrayBuffer();
      const loadedPdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const now = new Date().toISOString();
      const drawing = {
        id: crypto.randomUUID(),
        projectId: detailProjectId,
        name: baseName || file.name,
        pdfName: file.name,
        pdfBytes: bytes,
        pdfByteLength: file.size || bytes.byteLength,
        pageCount: loadedPdf.numPages,
        metadata: { ...emptyMetadata, drawingNo: baseName },
        sampleCount: 5,
        characteristics: [],
        pageNumber: 1,
        zoom: ZOOM_DEFAULT,
        status: "OPEN",
        createdAt: now,
        updatedAt: now,
      };
      await saveDrawing(detailProjectId, drawing);
      const workspace = await loadProject(detailProjectId);
      setDetailDrawings(workspace?.drawings || []);
      await refreshProjectList();
      setMessage(`Added ${file.name}.`);
    } catch (error) {
      setMessage(getStorageErrorMessage(error));
    } finally {
      event.target.value = "";
    }
  }, [detailDrawings.length, detailProjectId, refreshProjectList]);

  const handleDetailOpenDrawing = useCallback(async (drawingId) => {
    if (!detailProjectId) return;
    setPage("workspace");
    await openProjectWorkspace(detailProjectId, drawingId);
  }, [detailProjectId, openProjectWorkspace]);

  const handleOpenDrawingDialog = useCallback((drawing) => {
    setDrawingDialog({ open: true, drawingId: drawing.id, name: drawing.name || "" });
  }, []);

  const handleDrawingDialogChange = useCallback((name) => {
    setDrawingDialog((current) => ({ ...current, name }));
  }, []);

  const handleDrawingDialogClose = useCallback(() => {
    setDrawingDialog((current) => ({ ...current, open: false }));
  }, []);

  const handleDrawingDialogSubmit = useCallback(async (event) => {
    event.preventDefault();
    const name = drawingDialog.name.trim();
    if (!name || !detailProjectId) return;

    try {
      const drawing = await loadDrawing(drawingDialog.drawingId);
      if (!drawing) {
        setMessage("Drawing could not be found for rename.");
        return;
      }
      const updatedDrawing = { ...drawing, name, updatedAt: new Date().toISOString() };
      await saveDrawing(detailProjectId, updatedDrawing);
      setDrawingDialog({ open: false, drawingId: null, name: "" });
      const workspace = await loadProject(detailProjectId);
      setDetailDrawings(workspace?.drawings || []);
      if (activeDrawingId === drawing.id) setDrawings((items) => updateDrawingSummary(items, updatedDrawing));
    } catch (error) {
      setMessage(`Could not rename drawing: ${error.message}`);
    }
  }, [activeDrawingId, detailProjectId, drawingDialog]);

  const handleDetailDeleteDrawing = useCallback(async (drawing) => {
    const confirmed = window.confirm(`Delete drawing "${drawing.name}" and its local PDF, balloons, table, and measurements?`);
    if (!confirmed || !detailProjectId) return;

    try {
      await deleteDrawing(drawing.id);
      const workspace = await loadProject(detailProjectId);
      setDetailDrawings(workspace?.drawings || []);
      await refreshProjectList();

      if (activeProject?.id === detailProjectId && activeDrawingId === drawing.id) {
        const remaining = drawings.filter((item) => item.id !== drawing.id);
        setDrawings(remaining);
        const nextDrawingId = remaining[0]?.id || null;
        rememberActiveProject(detailProjectId, nextDrawingId);
        if (nextDrawingId) {
          await applyDrawing(nextDrawingId, { projectId: detailProjectId, message: "Deleted drawing. Opened the next drawing." });
        } else {
          setActiveDrawingId(null);
          resetDrawingState("Deleted drawing. Add another drawing PDF to this project.");
        }
      }
    } catch (error) {
      setMessage(`Could not delete drawing: ${error.message}`);
    }
  }, [activeDrawingId, activeProject?.id, applyDrawing, detailProjectId, drawings, refreshProjectList, rememberActiveProject, resetDrawingState]);

  const deleteCharacteristic = useCallback((id) => {
    if (!id) return;
    setCharacteristics((items) => renumber(items.filter((item) => item.id !== id)));
    setSelectedId((current) => (current === id ? null : current));
    setEditingBalloonId((current) => (current === id ? null : current));
    setMessage("Deleted selected balloon and renumbered the table.");
  }, []);

  const deleteSelected = useCallback(() => {
    deleteCharacteristic(selectedId);
  }, [deleteCharacteristic, selectedId]);

  const exportPdf = useCallback(async () => {
    try {
      await exportBalloonedPdf({ pdfBytes, characteristics, fileName: pdfName });
      setMessage("Exported ballooned PDF.");
    } catch (error) {
      setMessage(error.message);
    }
  }, [characteristics, pdfBytes, pdfName]);

  const exportExcel = useCallback(() => {
    try {
      exportInspectionWorkbook({ metadata, characteristics, sampleCount });
      setMessage("Exported QC/FAI Excel workbook.");
    } catch (error) {
      setMessage(error.message);
    }
  }, [characteristics, metadata, sampleCount]);

  const beginPanelResize = useCallback((event, axis) => {
    if (layoutMode !== "split-v" && layoutMode !== "split-h") return;
    const metrics = getContentMetrics();
    if (!metrics) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panelResizeRef.current = {
      axis,
      layoutMode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      metrics,
      drawingWidth: drawingPanelRef.current?.getBoundingClientRect().width ?? defaultPanelSizes.splitH.drawingWidth,
      inspectorWidth: inspectorRef.current?.getBoundingClientRect().width ?? panelSizes.splitV.inspectorWidth,
      tableHeight: tablePanelRef.current?.getBoundingClientRect().height ?? panelSizes.splitV.tableHeight,
      inspectorHeight: inspectorRef.current?.getBoundingClientRect().height ?? panelSizes.splitH.inspectorHeight,
    };
  }, [getContentMetrics, layoutMode, panelSizes]);

  const resizePanelsBy = useCallback((axis, deltaX, deltaY, baseline = null) => {
    const metrics = baseline?.metrics ?? getContentMetrics();
    if (!metrics) return;
    const activeLayout = baseline?.layoutMode ?? layoutMode;
    const drawingWidth = baseline?.drawingWidth ?? drawingPanelRef.current?.getBoundingClientRect().width ?? panelSizes.splitH.drawingWidth ?? 520;
    const inspectorWidth = baseline?.inspectorWidth ?? inspectorRef.current?.getBoundingClientRect().width ?? panelSizes.splitV.inspectorWidth;
    const tableHeight = baseline?.tableHeight ?? tablePanelRef.current?.getBoundingClientRect().height ?? panelSizes.splitV.tableHeight;
    const inspectorHeight = baseline?.inspectorHeight ?? inspectorRef.current?.getBoundingClientRect().height ?? panelSizes.splitH.inspectorHeight;

    setPanelSizes((current) => {
      if (activeLayout === "split-v" && axis === "column") {
        const maxInspectorWidth = Math.max(280, Math.min(460, metrics.width - 520 - RESIZE_HANDLE_SIZE));
        return {
          ...current,
          splitV: {
            ...current.splitV,
            inspectorWidth: clamp(inspectorWidth - deltaX, 280, maxInspectorWidth),
          },
        };
      }

      if (activeLayout === "split-v" && axis === "row") {
        const maxTableHeight = Math.max(220, Math.min(metrics.height * 0.6, metrics.height - 260 - RESIZE_HANDLE_SIZE));
        return {
          ...current,
          splitV: {
            ...current.splitV,
            tableHeight: clamp(tableHeight - deltaY, 220, maxTableHeight),
          },
        };
      }

      if (activeLayout === "split-h" && axis === "column") {
        const maxDrawingWidth = Math.max(520, metrics.width - 360 - RESIZE_HANDLE_SIZE);
        return {
          ...current,
          splitH: {
            ...current.splitH,
            drawingWidth: clamp(drawingWidth + deltaX, 520, maxDrawingWidth),
          },
        };
      }

      if (activeLayout === "split-h" && axis === "row") {
        const maxInspectorHeight = Math.max(180, Math.min(420, metrics.height - 260 - RESIZE_HANDLE_SIZE));
        return {
          ...current,
          splitH: {
            ...current.splitH,
            inspectorHeight: clamp(inspectorHeight - deltaY, 180, maxInspectorHeight),
          },
        };
      }

      return current;
    });
  }, [getContentMetrics, layoutMode, panelSizes]);

  const movePanelResize = useCallback((event) => {
    const resize = panelResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    resizePanelsBy(resize.axis, event.clientX - resize.startX, event.clientY - resize.startY, resize);
  }, [resizePanelsBy]);

  const endPanelResize = useCallback((event) => {
    const resize = panelResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    panelResizeRef.current = null;
  }, []);

  const handlePanelResizeKey = useCallback((event, axis) => {
    const horizontalKey = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const verticalKey = event.key === "ArrowUp" || event.key === "ArrowDown";
    if ((axis === "column" && !horizontalKey) || (axis === "row" && !verticalKey)) return;

    event.preventDefault();
    const step = event.shiftKey ? 80 : 24;
    const deltaX = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
    const deltaY = event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0;
    resizePanelsBy(axis, deltaX, deltaY);
  }, [resizePanelsBy]);

  const resetPanelResize = useCallback((axis) => {
    setPanelSizes((current) => {
      if (layoutMode === "split-v" && axis === "column") {
        return { ...current, splitV: { ...current.splitV, inspectorWidth: defaultPanelSizes.splitV.inspectorWidth } };
      }
      if (layoutMode === "split-v" && axis === "row") {
        return { ...current, splitV: { ...current.splitV, tableHeight: defaultPanelSizes.splitV.tableHeight } };
      }
      if (layoutMode === "split-h" && axis === "column") {
        return { ...current, splitH: { ...current.splitH, drawingWidth: defaultPanelSizes.splitH.drawingWidth } };
      }
      if (layoutMode === "split-h" && axis === "row") {
        return { ...current, splitH: { ...current.splitH, inspectorHeight: defaultPanelSizes.splitH.inspectorHeight } };
      }
      return current;
    });
  }, [layoutMode]);

  if (page === "dashboard") {
    return (
      <ProjectDashboard
        projectsReady={projectsReady}
        projects={projectSummaries}
        projectDialog={projectDialog}
        onNewProject={handleNewProject}
        onOpenProject={handleOpenProject}
        onManageProject={handleManageProject}
        onRenameProject={handleOpenProjectDialog}
        onDeleteProject={handleDeleteProjectFromDashboard}
        onDialogChange={(name) => setProjectDialog((current) => ({ ...current, name }))}
        onDialogSubmit={handleProjectDialogSubmit}
        onDialogClose={handleCloseProjectDialog}
        onOpenHelp={() => setHelpOpen(true)}
        helpOpen={helpOpen}
        onCloseHelp={() => setHelpOpen(false)}
      />
    );
  }

  if (page === "detail") {
    return (
      <ProjectDetail
        project={detailProject}
        drawings={detailDrawings}
        ready={Boolean(detailProject)}
        fieldDraft={detailFields}
        onFieldChange={handleDetailFieldChange}
        onSaveFields={handleSaveDetailFields}
        onBack={handleBackFromDetail}
        onOpenProjectWorkspace={handleDetailOpenDrawing}
        onAddDrawing={handleDetailAddDrawing}
        onRenameDrawing={handleOpenDrawingDialog}
        onDeleteDrawing={handleDetailDeleteDrawing}
        drawingDialog={drawingDialog}
        onDrawingDialogChange={handleDrawingDialogChange}
        onDrawingDialogSubmit={handleDrawingDialogSubmit}
        onDrawingDialogClose={handleDrawingDialogClose}
        onOpenHelp={() => setHelpOpen(true)}
        helpOpen={helpOpen}
        onCloseHelp={() => setHelpOpen(false)}
      />
    );
  }

  return (
    <div className="app-shell" data-layout={layoutMode}>
      <header className="topbar">
        <div className="brand">
          <img className="brand-mark" src="/logo-mark.svg" alt="" aria-hidden="true" />
          <div>
            <div className="brand-title-row">
              <h1>QC Assistant</h1>
              <span className="version-badge">{APP_VERSION}</span>
              <div className="brand-actions">
                <button className="icon-button brand-help" onClick={() => setHelpOpen(true)} title="Help and shortcuts" aria-label="Help and shortcuts">
                  <HelpCircle size={17} />
                </button>
                <button className="icon-button brand-help" onClick={() => setSettingsOpen(true)} title="Balloon settings" aria-label="Balloon settings">
                  <Settings size={17} />
                </button>
              </div>
            </div>
            <p>Drawing ballooning and inspection report builder</p>
          </div>
        </div>

        <div className="actions">
          <div className="action-group export-actions">
            <button className="button secondary" onClick={exportPdf} disabled={!pdfBytes || !characteristics.length}>
              <Download size={16} />
              PDF
            </button>
            <button className="button primary" onClick={exportExcel} disabled={!characteristics.length}>
              <Save size={16} />
              Excel
            </button>
          </div>
        </div>
      </header>

      <div className="layout-bar">
        <div className="project-controls">
          <div className="toolbar-cluster project-cluster" aria-label="Project controls">
            <span className="toolbar-cluster-label">Project</span>
            <div className="toolbar-cluster-controls">
              <button className="small-button project-action dashboard-link" onClick={() => setPage("dashboard")}>Projects</button>
              <label className="project-field project-select-field">
                <select value={activeProject?.id || ""} onChange={(event) => handleOpenProject(event.target.value)} disabled={!projectSummaries.length} aria-label="Active project">
                  {!projectSummaries.length ? <option value="">No local projects</option> : null}
                  {projectSummaries.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} ({project.drawingCount})
                    </option>
                  ))}
                </select>
              </label>
              <label className="project-field drawing-field">
                <select value={activeDrawingId || ""} onChange={(event) => handleOpenDrawing(event.target.value)} disabled={!drawings.length} aria-label="Active drawing">
                  {!drawings.length ? <option value="">No drawings</option> : null}
                  {drawings.map((drawing) => (
                    <option key={drawing.id} value={drawing.id}>
                      {drawing.name} · {drawing.status}
                    </option>
                  ))}
                </select>
              </label>
              <button className="icon-button" onClick={() => setToleranceTableOpen(true)} title="Tolerance table" aria-label="Tolerance table">
                <Ruler size={17} />
              </button>
            </div>
          </div>

          <div className="layout-bar-row">
            <div className="toolbar-cluster view-mode-cluster">
              <span className="toolbar-cluster-label">Mode</span>
              <div className="workspace-tabs" aria-label="Project mode">
                <button className={`workspace-tab ${workspaceMode === "edit" ? "active" : ""}`} onClick={() => switchWorkspaceMode("edit")}>
                  <Circle size={14} />
                  Edit
                </button>
                <button className={`workspace-tab ${workspaceMode === "measurement" ? "active" : ""}`} onClick={() => switchWorkspaceMode("measurement")}>
                  <Table2 size={14} />
                  Measurement
                </button>
              </div>
            </div>
            {workspaceMode === "edit" ? (
              <div className="toolbar-cluster layout-mode-cluster">
                <span className="toolbar-cluster-label">Layout</span>
                <div className="layout-tabs" aria-label="Drawing layout">
                  <button className={`layout-tab ${layoutMode === "drawing" ? "active" : ""}`} onClick={() => setLayoutMode("drawing")} title="Drawing canvas only">
                    <PanelLeft size={14} />
                    Drawing
                  </button>
                  <button className={`layout-tab ${layoutMode === "table" ? "active" : ""}`} onClick={() => setLayoutMode("table")} title="QC table only">
                    <Table2 size={14} />
                    Table
                  </button>
                  <div className="layout-tab-divider" />
                  <button className={`layout-tab ${layoutMode === "split-h" ? "active" : ""}`} onClick={() => setLayoutMode("split-h")} title="Side by side">
                    <ArrowLeftRight size={14} />
                    Side by Side
                  </button>
                  <button className={`layout-tab ${layoutMode === "split-v" ? "active" : ""}`} onClick={() => setLayoutMode("split-v")} title="Stacked">
                    <ArrowUpDown size={14} />
                    Stacked
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {workspaceMode === "measurement" ? (
        <MeasurementWorkspace
          pdfDoc={pdfDoc}
          canvasRef={canvasRef}
          overlayRef={overlayRef}
          scrollRef={scrollRef}
          canvasSize={canvasSize}
          pageNumber={pageNumber}
          pageCount={pageCount}
          zoom={zoom}
          onZoomOut={zoomOut}
          onZoomIn={zoomIn}
          onPrevPage={prevPage}
          onNextPage={nextPage}
          currentPageBalloons={currentPageBalloons}
          characteristics={characteristics}
          selectedId={selectedId}
          sampleCount={sampleCount}
          projectStatus={projectStatus}
          message={message}
          activeDrawingId={activeDrawingId}
          onPdfUpload={handlePdfUpload}
          onSelect={selectCharacteristic}
          onChange={updateCharacteristic}
          onSampleChange={updateSample}
          onSampleCountChange={setSampleCount}
          balloonDiameter={balloonSettings.diameter}
        />
      ) : (
      <div ref={contentAreaRef} className="content-area" style={contentAreaStyle}>

        <section ref={drawingPanelRef} className="drawing-panel">
          <div className="panel-toolbar">
            <div className="tool-group">
              <ToolButton active={mode === "select"} title="Select (V)" onClick={() => switchMode("select")} icon={<MousePointer2 size={17} />} />
              <ToolButton
                active={mode === "balloon"}
                title="Add balloon (B)"
                onClick={() => switchMode("balloon")}
                icon={<Circle size={17} />}
              />
              <ToolButton
                active={mode === "autoBalloon"}
                title="Review balloon candidates (A)"
                onClick={() => switchMode("autoBalloon")}
                icon={<ScanSearch size={17} />}
              />
              <ToolButton
                active={mode === "text"}
                title="Text select (T)"
                onClick={() => switchMode("text")}
                icon={<TextSelect size={17} />}
              />
              <ToolButton title="Pan mode (H)" onClick={() => switchMode("pan")} active={mode === "pan"} icon={<Hand size={17} />} />
            </div>
            <DrawingNavToolbar
              zoom={zoom}
              pageNumber={pageNumber}
              pageCount={pageCount}
              onZoomOut={zoomOut}
              onZoomIn={zoomIn}
              onPrevPage={prevPage}
              onNextPage={nextPage}
            />
          </div>

          <div
            ref={scrollRef}
            className={`canvas-scroll ${mode === "pan" ? "panning" : ""}`}
            onPointerDown={beginPan}
            onPointerMove={movePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
          >
            {!pdfDoc ? (
              <PdfUploadPrompt
                message="Then choose Balloon, click each dimension target, and drag balloons later to adjust leader placement."
                onUpload={handlePdfUpload}
              />
            ) : (
              <div
                ref={overlayRef}
                className={`pdf-stage ${mode === "balloon" || mode === "autoBalloon" ? "placing" : ""}`}
                style={{ width: canvasSize.width, height: canvasSize.height }}
                onClick={handleCanvasClick}
                onPointerDown={beginTextAreaSelection}
                onPointerMove={moveTextAreaSelection}
                onPointerUp={endTextAreaSelection}
                onPointerCancel={endTextAreaSelection}
              >
                <canvas ref={canvasRef} />
                <DimensionHighlights
                  candidates={dimensionCandidates}
                  active={mode === "balloon"}
                />
                <TextLayer
                  active={mode === "text"}
                  items={textItems}
                  onCapture={captureTextSelection}
                />
                <LeaderLayer
                  balloons={currentPageBalloons}
                  selectedId={selectedId}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  balloonDiameter={balloonSettings.diameter}
                />
                {ocrRect ? (
                  <div
                    className="ocr-selection"
                    style={{
                      left: `${ocrRect.x * 100}%`,
                      top: `${ocrRect.y * 100}%`,
                      width: `${ocrRect.width * 100}%`,
                      height: `${ocrRect.height * 100}%`,
                    }}
                  />
                ) : null}
                {autoBalloonRect ? (
                  <div
                    className="auto-balloon-selection"
                    style={{
                      left: `${autoBalloonRect.x * 100}%`,
                      top: `${autoBalloonRect.y * 100}%`,
                      width: `${autoBalloonRect.width * 100}%`,
                      height: `${autoBalloonRect.height * 100}%`,
                    }}
                  />
                ) : null}
                <AutoBalloonPreview
                  candidates={autoBalloonCandidates}
                  width={canvasSize.width}
                  height={canvasSize.height}
                />
                {selected?.page === pageNumber ? (
                  <button
                    className="target-handle"
                    style={{
                      left: `${(selected.targetX ?? selected.x) * 100}%`,
                      top: `${(selected.targetY ?? selected.y) * 100}%`,
                    }}
                    onPointerDown={(event) => beginTargetDrag(event, selected)}
                    onPointerMove={moveBalloonDrag}
                    onPointerUp={endBalloonDrag}
                    onPointerCancel={endBalloonDrag}
                    onClick={(event) => event.stopPropagation()}
                    title={`Move target for balloon ${selected.balloonNo}`}
                  />
                ) : null}
                {currentPageBalloons.map((item) => (
                  <button
                    key={item.id}
                    className={`balloon ${selectedId === item.id ? "selected" : ""}`}
                    style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%` }}
                    onPointerDown={(event) => beginBalloonDrag(event, item)}
                    onPointerMove={moveBalloonDrag}
                    onPointerUp={endBalloonDrag}
                    onPointerCancel={endBalloonDrag}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedId(item.id);
                      setEditingBalloonId(null);
                    }}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      setSelectedId(item.id);
                      setEditingBalloonId(item.id);
                      setMessage(`Editing balloon ${item.balloonNo}.`);
                    }}
                    title={`Balloon ${item.balloonNo}`}
                  >
                    {item.balloonNo}
                  </button>
                ))}
                {selected?.page === pageNumber && editingBalloonId === selected.id ? (
                  <div
                    className="balloon-actions"
                    style={{
                      left: `${selected.x * 100}%`,
                      top: `${selected.y * 100}%`,
                    }}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <input
                      type="number"
                      min="1"
                      value={selected.balloonNo}
                      aria-label="Reassign balloon number"
                      onChange={(event) => reassignBalloonNo(selected.id, event.target.value)}
                    />
                    <button className="icon-button danger" onClick={deleteSelected} title="Delete selected balloon">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>

        <ResizeHandle
          axis="column"
          onPointerDown={beginPanelResize}
          onPointerMove={movePanelResize}
          onPointerUp={endPanelResize}
          onPointerCancel={endPanelResize}
          onKeyDown={handlePanelResizeKey}
          onDoubleClick={resetPanelResize}
        />

        <aside ref={inspectorRef} className="inspector">
          <div className="inspector-section drawing-info-section">
            <div className="section-title">
              <h2>Drawing Info</h2>
            </div>
            <div className="drawing-info-fields">
              <div className="drawing-info-field drawing-info-field-no">
                <Field label="Drawing No" value={metadata.drawingNo} onChange={(value) => setMetadataValue(setMetadata, "drawingNo", value)} />
              </div>
              <div className="drawing-info-field drawing-info-field-rev">
                <Field label="Rev" value={metadata.revision} onChange={(value) => setMetadataValue(setMetadata, "revision", value)} compact />
              </div>
              <div className="drawing-info-field drawing-info-field-desc">
                <Field label="Description" value={metadata.description} onChange={(value) => setMetadataValue(setMetadata, "description", value)} wide />
              </div>
            </div>
          </div>

          <div className="inspector-section">
            <div className="section-title">
              <h2>Selected PDF Text</h2>
            </div>
            <div className="capture-panel">
              <textarea
                value={selectedText}
                onChange={(event) => setSelectedText(event.target.value)}
                placeholder="Use Text Select, then click embedded text or drag a box around visible text for OCR."
              />
              <div className="capture-actions">
                <button className="small-button" disabled={!selectedText || ocrBusy} onClick={() => applyCapturedText("description")}>Description</button>
                <button className="small-button" disabled={!selectedText || ocrBusy} onClick={() => applyCapturedText("drawingNo")}>Drawing No</button>
                <button className="small-button" disabled={!selectedText || ocrBusy} onClick={() => applyCapturedText("revision")}>Rev</button>
                <button className="small-button" disabled={!selectedText || ocrBusy} onClick={() => applyCapturedText("nominal")}>Requirement</button>
                <button className="small-button" disabled={!selectedText || ocrBusy} onClick={() => applyCapturedText("tolerance")}>Tolerance</button>
                <button className="small-button" disabled={!selectedText || ocrBusy} onClick={() => applyCapturedText("notes")}>Notes</button>
              </div>
              {ocrBusy ? <p className="muted compact-note">OCR is reading the selected area...</p> : null}
            </div>
          </div>

          <div className="inspector-section">
            <div className="section-title">
              <h2>Review Candidates</h2>
              {autoBalloonCandidates.length ? <span className="candidate-count">{autoBalloonCandidates.length}</span> : null}
            </div>
            <AutoBalloonReview
              busy={autoBalloonBusy}
              open={autoBalloonReviewOpen}
              candidates={autoBalloonCandidates}
              onRemove={removeAutoBalloonCandidate}
              onCancel={cancelAutoBalloonReview}
              onCommit={commitAutoBalloonCandidates}
            />
          </div>

          <div className="inspector-section">
            <div className="section-title">
              <h2>Selected Balloon</h2>
              <button className="icon-button danger" disabled={!selectedId} onClick={deleteSelected} title="Delete selected">
                <Trash2 size={16} />
              </button>
            </div>
            {selected ? (
              <BalloonEditor
                item={selected}
                sampleCount={sampleCount}
                onChange={(patch) => updateCharacteristic(selected.id, patch)}
                onReassign={(value) => reassignBalloonNo(selected.id, value)}
                onSampleChange={(index, value) => updateSample(selected.id, index, value)}
              />
            ) : (
              <p className="muted">Select a balloon or add a new one to edit its inspection requirement.</p>
            )}
          </div>

          <div className="inspector-section">
            <div className="section-title">
              <h2>Build Controls</h2>
            </div>
            <label className="stacked-label">
              Samples
              <select value={sampleCount} onChange={(event) => setSampleCount(Number(event.target.value))}>
                {[1, 3, 5, 10].map((count) => (
                  <option key={count} value={count}>{count}</option>
                ))}
              </select>
            </label>
            <div className="split-actions">
              <button className="button secondary" onClick={addManualRow} disabled={!activeDrawingId}>
                <Plus size={16} />
                Add Row
              </button>
              <button className="button secondary" onClick={loadDemoRows} disabled={!activeDrawingId}>
                Demo Rows
              </button>
            </div>
            <button
              className="button secondary"
              onClick={clearDrawingData}
              disabled={!activeDrawingId || (!characteristics.length && !metadata.drawingNo)}
            >
              Clear Drawing Data
            </button>
          </div>

          <div className="message">{message}</div>
        </aside>

        <ResizeHandle
          axis="row"
          onPointerDown={beginPanelResize}
          onPointerMove={movePanelResize}
          onPointerUp={endPanelResize}
          onPointerCancel={endPanelResize}
          onKeyDown={handlePanelResizeKey}
          onDoubleClick={resetPanelResize}
        />

        <section ref={tablePanelRef} className="table-panel">
        <div className="table-header">
          <div>
            <h2>QC / FAI Characteristics</h2>
            <p>{characteristics.length} linked requirements</p>
          </div>
          <button
            className="button secondary"
            onClick={clearAllBalloons}
            disabled={!characteristics.length}
            title="Clear all balloons from drawing and table"
          >
            <Trash2 size={16} />
            Clear All Balloons
          </button>
        </div>
        <CharacteristicTable
          characteristics={characteristics}
          selectedId={selectedId}
          sampleCount={sampleCount}
          onSelect={selectCharacteristic}
          onChange={updateCharacteristic}
          onReassign={reassignBalloonNo}
          onSampleChange={updateSample}
          onDelete={deleteCharacteristic}
        />
      </section>

      </div>
      )}
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <SettingsDialog
        open={settingsOpen}
        settings={balloonSettings}
        onClose={() => setSettingsOpen(false)}
        onChange={setBalloonSettings}
      />
      <ToleranceTableDialog
        open={toleranceTableOpen}
        onClose={() => setToleranceTableOpen(false)}
        autoTolerances={{ linear: generalTolerances, angle: autoAngleTolerances }}
        toleranceOverrides={toleranceOverrides}
        onOverrideChange={applyToleranceOverride}
        onResetOverride={resetToleranceOverride}
        onApply={applyToleranceToMatching}
        countMatches={countToleranceMatches}
      />
    </div>
  );
}
