import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ArrowUpDown,
  Circle,
  Download,
  FilePlus2,
  Hand,
  MousePointer2,
  PanelLeft,
  Plus,
  Save,
  Table2,
  TextSelect,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { demoCharacteristics } from "./sampleData.js";
import {
  exportBalloonedPdf,
  exportInspectionWorkbook,
  getLimits,
  getStatus,
} from "./exporters.js";
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
} from "./projectStore.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const methods = ["DC", "CMM", "VS", "VMS", "HG", "MIC", "CG", "PP", "TG", "PG"];
const types = ["dimension", "gdt", "note", "visual"];
const CHARACTERISTIC_FIELDS = ["nominal", "tolerance", "notes"];
const APP_VERSION = "v0.1.2";

const PANEL_STORAGE_KEY = "qca_panel_sizes_v1";
const RESIZE_HANDLE_SIZE = 14;

const defaultPanelSizes = {
  splitV: {
    inspectorWidth: 330,
    tableHeight: 290,
  },
  splitH: {
    drawingWidth: null,
    inspectorHeight: 260,
  },
};

const emptyMetadata = {
  drawingNo: "",
  revision: "",
  supplier: "",
  description: "",
};

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
    method: seed.method ?? "DC",
    notes: seed.notes ?? "",
    samples: seed.samples ?? {},
  };
}

export default function App() {
  const [projectSummaries, setProjectSummaries] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [drawings, setDrawings] = useState([]);
  const [activeDrawingId, setActiveDrawingId] = useState(null);
  const [projectsReady, setProjectsReady] = useState(false);
  const [dashboardVisible, setDashboardVisible] = useState(true);
  const [projectDialog, setProjectDialog] = useState({ open: false, mode: "create", projectId: null, name: "" });
  const [saveState, setSaveState] = useState({ status: "idle", label: "Not saved" });
  const [metadata, setMetadata] = useState(emptyMetadata);
  const [sampleCount, setSampleCount] = useState(5);
  const [pdfBytes, setPdfBytes] = useState(null);
  const [pdfName, setPdfName] = useState("");
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1.15);
  const [mode, setMode] = useState("select");
  const [characteristics, setCharacteristics] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [pendingTarget, setPendingTarget] = useState(null);
  const [textItems, setTextItems] = useState([]);
  const [selectedText, setSelectedText] = useState("");
  const [ocrRect, setOcrRect] = useState(null);
  const [ocrBusy, setOcrBusy] = useState(false);
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

  useEffect(() => {
    drawingsRef.current = drawings;
  }, [drawings]);

  useEffect(() => {
    activeDrawingRef.current = activeDrawing;
  }, [activeDrawing]);

  const projectStorageBytes = useMemo(
    () => drawings.reduce((sum, drawing) => sum + (drawing.pdfByteLength || 0), 0),
    [drawings],
  );

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
    setSampleCount(5);
    setPdfBytes(null);
    setPdfName("");
    setPdfDoc(null);
    setPageNumber(1);
    setPageCount(0);
    setZoom(1.15);
    setCharacteristics([]);
    setSelectedId(null);
    setPendingTarget(null);
    setTextItems([]);
    setSelectedText("");
    setOcrRect(null);
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
      setSampleCount(drawing.sampleCount || 5);
      setPdfBytes(drawing.pdfBytes || null);
      setPdfName(drawing.pdfName || "");
      setPdfDoc(loadedPdf);
      setPageCount(loadedPdf?.numPages || drawing.pageCount || 0);
      setPageNumber(clamp(drawing.pageNumber || 1, 1, loadedPdf?.numPages || drawing.pageCount || 1));
      setZoom(drawing.zoom || 1.15);
      setCharacteristics(Array.isArray(drawing.characteristics) ? drawing.characteristics : []);
      setSelectedId(null);
      setPendingTarget(null);
      setTextItems([]);
      setSelectedText("");
      setOcrRect(null);
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
        setDashboardVisible(true);
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
      const textContentPromise = page.getTextContent();

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
      context.clearRect(0, 0, viewport.width, viewport.height);

      await page.render({ canvasContext: context, viewport }).promise;
      const textContent = await textContentPromise;
      const nextTextItems = textContent.items
        .map((item, index) => mapTextItem(item, index, viewport, zoom))
        .filter(Boolean);

      if (!cancelled) {
        setCanvasSize({ width: viewport.width, height: viewport.height });
        setTextItems(nextTextItems);
      }
    }
    renderPage().catch((error) => setMessage(error.message));
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber, zoom]);

  useEffect(() => {
    setPendingTarget(null);
  }, [mode, pageNumber]);

  useEffect(() => {
    if (mode !== "text") window.getSelection()?.removeAllRanges();
    if (mode !== "text") setOcrRect(null);
  }, [mode]);

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
      setSaveState({ status: "saving", label: reason === "manual" ? "Saving..." : "Autosaving..." });
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
        label: warning || `${projectSummary?.drawingCount || nextDrawings.length} drawings saved locally`,
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

  const handleManualSave = useCallback(async () => {
    if (activeDrawingId) {
      await persistActiveDrawingRef.current?.("manual");
      setMessage("Saved active drawing to the local project.");
      return;
    }

    if (activeProject?.id) {
      const projectRecord = { ...activeProject, updatedAt: new Date().toISOString() };
      await saveProject(projectRecord);
      setActiveProject(projectRecord);
      await refreshProjectList();
      setSaveState({ status: "saved", label: "Project saved locally" });
      setMessage("Saved project locally.");
    }
  }, [activeDrawingId, activeProject, refreshProjectList]);

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
    setSaveState({ status: "saved", label: "Project created locally" });
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
        setDashboardVisible(false);
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
        createdAt: currentProject.createdAt,
        updatedAt: new Date().toISOString(),
      };
      await saveProject(updatedProject);
      if (activeProject?.id === updatedProject.id) setActiveProject(updatedProject);
      await refreshProjectList();
      setProjectDialog({ open: false, mode: "create", projectId: null, name: "" });
      setSaveState({ status: "saved", label: "Project renamed locally" });
      setMessage(`Renamed project to ${name}.`);
    } catch (error) {
      setMessage(`Could not save project name: ${error.message}`);
    }
  }, [activeProject?.id, createProject, openProjectWorkspace, projectDialog, projectSummaries, refreshProjectList]);

  const handleOpenProject = useCallback(async (projectId) => {
    if (!projectId) return;
    try {
      await openProjectWorkspace(projectId);
      setDashboardVisible(false);
      await refreshProjectList();
    } catch (error) {
      setMessage(`Could not open project: ${error.message}`);
    }
  }, [openProjectWorkspace, refreshProjectList]);

  const handleProjectNameChange = useCallback((name) => {
    setActiveProject((current) => (current ? { ...current, name } : current));
  }, []);

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
        zoom: 1.15,
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
      setSampleCount(5);
      setPdfBytes(bytes);
      setPdfName(file.name);
      setPdfDoc(loadedPdf);
      setPageCount(loadedPdf.numPages);
      setPageNumber(1);
      setZoom(1.15);
      setCharacteristics([]);
      setSelectedId(null);
      setPendingTarget(null);
      setSelectedText("");
      setOcrRect(null);
      setCanvasSize({ width: 0, height: 0 });
      rememberActiveProject(project.id, savedDrawing.id);
      await refreshProjectList();
      setSaveState({ status: "saved", label: `${Math.min(drawings.length + 1, PROJECT_LIMITS.maxDrawings)} drawings saved locally` });
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
      const rect = overlayRef.current.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;

      if (mode === "balloon") {
        if (!pendingTarget || pendingTarget.page !== pageNumber) {
          setPendingTarget({ x, y, page: pageNumber });
          setMessage("Target selected. Click where the balloon number should sit.");
          return;
        }

        const next = createCharacteristic({
          balloonNo: nextBalloonNo(characteristics),
          x,
          y,
          targetX: pendingTarget.x,
          targetY: pendingTarget.y,
          page: pageNumber,
        });
        setCharacteristics((items) => [...items, next]);
        setSelectedId(next.id);
        setPendingTarget(null);
        setMessage(`Added balloon ${next.balloonNo} with leader line. Balloon tool is still active.`);
      }
    },
    [characteristics, mode, pageNumber, pdfDoc, pendingTarget],
  );

  const updateCharacteristic = useCallback((id, patch) => {
    setCharacteristics((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
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
    dragRef.current = { id: item.id, pointerId: event.pointerId, point: "balloon" };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const beginTargetDrag = useCallback((event, item) => {
    event.stopPropagation();
    setSelectedId(item.id);
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
    updatePosition(drag.id, event.clientX, event.clientY, drag.point);
    dragRef.current = null;
  }, [updatePosition]);

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

  const beginTextAreaSelection = useCallback((event) => {
    if (mode !== "text" || !overlayRef.current) return;
    if (event.button !== 0) return;
    if (event.target.closest(".pdf-text-item")) return;

    const point = getNormalizedPoint(event, overlayRef.current);
    ocrRef.current = { pointerId: event.pointerId, startX: point.x, startY: point.y };
    setOcrRect({ x: point.x, y: point.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [mode]);

  const moveTextAreaSelection = useCallback((event) => {
    const selection = ocrRef.current;
    if (!selection || selection.pointerId !== event.pointerId || !overlayRef.current) return;

    const point = getNormalizedPoint(event, overlayRef.current);
    setOcrRect(normalizeRect(selection.startX, selection.startY, point.x, point.y));
  }, []);

  const endTextAreaSelection = useCallback(async (event) => {
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
  }, []);

  const recognizeSelectedArea = useCallback(async (rect) => {
    if (!canvasRef.current) return;

    try {
      setOcrBusy(true);
      setMessage("Reading selected drawing area...");
      const dataUrl = cropCanvasArea(canvasRef.current, rect);
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
    setMessage(`Added row ${next.balloonNo}. Click the drawing to place its balloon later.`);
  }, [characteristics, pageNumber]);

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
    setMessage("Loaded demo QC characteristics. Adjust positions and values for your drawing.");
  }, []);

  const clearDrawingData = useCallback(() => {
    setMetadata(emptyMetadata);
    setSampleCount(5);
    setCharacteristics([]);
    setSelectedId(null);
    setPendingTarget(null);
    setSelectedText("");
    setOcrRect(null);
    setMessage("Cleared inspection data for the active drawing.");
  }, []);

  const handleDeleteActiveDrawing = useCallback(async () => {
    if (!activeDrawingId || !activeProject?.id) return;
    const confirmed = window.confirm("Delete this drawing and its local PDF, balloons, table, and measurements?");
    if (!confirmed) return;

    try {
      await deleteDrawing(activeDrawingId);
      const remaining = drawings.filter((drawing) => drawing.id !== activeDrawingId);
      setDrawings(remaining);
      await refreshProjectList();
      const nextDrawingId = remaining[0]?.id || null;
      rememberActiveProject(activeProject.id, nextDrawingId);
      if (nextDrawingId) {
        await applyDrawing(nextDrawingId, { projectId: activeProject.id, message: "Deleted drawing. Opened the next drawing." });
      } else {
        setActiveDrawingId(null);
        resetDrawingState("Deleted drawing. Add another drawing PDF to this project.");
      }
    } catch (error) {
      setMessage(`Could not delete drawing: ${error.message}`);
    }
  }, [activeDrawingId, activeProject?.id, applyDrawing, drawings, refreshProjectList, rememberActiveProject, resetDrawingState]);

  const handleDeleteProject = useCallback(async () => {
    if (!activeProject?.id) return;
    const confirmed = window.confirm(`Delete project "${activeProject.name}" and all local drawings?`);
    if (!confirmed) return;

    try {
      await deleteProject(activeProject.id);
      const summaries = await refreshProjectList();
      const nextProject = summaries.find((project) => project.id !== activeProject.id) || null;
      if (nextProject) {
        await openProjectWorkspace(nextProject.id);
      } else {
        setActiveProject(null);
        setDrawings([]);
        setActiveDrawingId(null);
        rememberActiveProject(null, null);
        resetDrawingState("Deleted project. Create a project or upload a drawing PDF to begin.");
        setSaveState({ status: "idle", label: "Not saved" });
      }
    } catch (error) {
      setMessage(`Could not delete project: ${error.message}`);
    }
  }, [activeProject, openProjectWorkspace, refreshProjectList, rememberActiveProject, resetDrawingState]);

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
      setSaveState({ status: "saved", label: "Project deleted locally" });
      setMessage(`Deleted ${project.name}.`);
    } catch (error) {
      setMessage(`Could not delete project: ${error.message}`);
    }
  }, [activeProject?.id, refreshProjectList, resetDrawingState]);

  const deleteCharacteristic = useCallback((id) => {
    if (!id) return;
    setCharacteristics((items) => renumber(items.filter((item) => item.id !== id)));
    setSelectedId((current) => (current === id ? null : current));
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

  if (dashboardVisible) {
    return (
      <ProjectDashboard
        projectsReady={projectsReady}
        projects={projectSummaries}
        projectDialog={projectDialog}
        onNewProject={handleNewProject}
        onOpenProject={handleOpenProject}
        onRenameProject={handleOpenProjectDialog}
        onDeleteProject={handleDeleteProjectFromDashboard}
        onDialogChange={(name) => setProjectDialog((current) => ({ ...current, name }))}
        onDialogSubmit={handleProjectDialogSubmit}
        onDialogClose={handleCloseProjectDialog}
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
            </div>
            <p>Drawing ballooning and inspection report builder</p>
          </div>
        </div>

        <div className="metadata-grid">
          <Field label="Drawing No" value={metadata.drawingNo} onChange={(value) => setMetadataValue(setMetadata, "drawingNo", value)} />
          <Field label="Rev" value={metadata.revision} onChange={(value) => setMetadataValue(setMetadata, "revision", value)} compact />
          <Field label="Supplier" value={metadata.supplier} onChange={(value) => setMetadataValue(setMetadata, "supplier", value)} />
          <Field label="Description" value={metadata.description} onChange={(value) => setMetadataValue(setMetadata, "description", value)} wide />
        </div>

        <div className="actions">
          <div className="action-group upload-action">
            <label className="button secondary">
              <Upload size={16} />
              Upload PDF
              <input type="file" accept="application/pdf" onChange={handlePdfUpload} />
            </label>
          </div>
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
          <button className="small-button project-action dashboard-link" onClick={() => setDashboardVisible(true)}>Projects</button>
          <label className="project-field">
            <span>Project</span>
            <select value={activeProject?.id || ""} onChange={(event) => handleOpenProject(event.target.value)} disabled={!projectSummaries.length}>
              {!projectSummaries.length ? <option value="">No local projects</option> : null}
              {projectSummaries.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.drawingCount})
                </option>
              ))}
            </select>
          </label>
          <input
            className="project-name-input"
            value={activeProject?.name || ""}
            onChange={(event) => handleProjectNameChange(event.target.value)}
            placeholder="Untitled Project"
            disabled={!activeProject}
            aria-label="Project name"
          />
          <label className="project-field drawing-field">
            <span>Drawing</span>
            <select value={activeDrawingId || ""} onChange={(event) => handleOpenDrawing(event.target.value)} disabled={!drawings.length}>
              {!drawings.length ? <option value="">No drawings</option> : null}
              {drawings.map((drawing) => (
                <option key={drawing.id} value={drawing.id}>
                  {drawing.name} · {drawing.status}
                </option>
              ))}
            </select>
          </label>
          <button className="small-button project-action create" onClick={handleNewProject}>New Project</button>
          <label className="small-button project-action add file-button">
            Add Drawing
            <input type="file" accept="application/pdf" onChange={handlePdfUpload} />
          </label>
          <button className="small-button project-action save" onClick={handleManualSave} disabled={!activeProject}>Save</button>
          <button className="icon-button project-action delete-drawing" onClick={handleDeleteActiveDrawing} disabled={!activeDrawingId} title="Delete active drawing">
            <Trash2 size={15} />
          </button>
          <button className="small-button project-action delete-project" onClick={handleDeleteProject} disabled={!activeProject}>Delete Project</button>
          <span className={`save-state ${saveState.status}`} title={`${formatBytes(projectStorageBytes)} in this project`}>
            {saveState.label}
          </span>
        </div>
        <div className="layout-tabs">
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

      <div ref={contentAreaRef} className="content-area" style={contentAreaStyle}>

        <section ref={drawingPanelRef} className="drawing-panel">
          <div className="panel-toolbar">
            <div className="tool-group">
              <ToolButton active={mode === "select"} title="Select" onClick={() => setMode("select")} icon={<MousePointer2 size={17} />} />
              <ToolButton
                active={mode === "balloon"}
                title="Add balloon"
                onClick={() => {
                  setMode("balloon");
                  setMessage("Click the dimension or note target, then click where the balloon should sit.");
                }}
                icon={<Circle size={17} />}
              />
              <ToolButton
                active={mode === "text"}
                title="Text select"
                onClick={() => {
                  setMode("text");
                  setMessage("Drag or click drawing text, then send it to metadata or the selected QC row.");
                }}
                icon={<TextSelect size={17} />}
              />
              <ToolButton title="Pan mode" onClick={() => setMode("pan")} active={mode === "pan"} icon={<Hand size={17} />} />
            </div>
            <div className="tool-group">
              <button className="icon-button" onClick={() => setZoom((value) => Math.max(0.65, value - 0.1))} title="Zoom out">
                <ZoomOut size={17} />
              </button>
              <span className="zoom-label">{Math.round(zoom * 100)}%</span>
              <button className="icon-button" onClick={() => setZoom((value) => Math.min(2.2, value + 0.1))} title="Zoom in">
                <ZoomIn size={17} />
              </button>
            </div>
            <div className="page-control">
              <button className="small-button" disabled={pageNumber <= 1} onClick={() => setPageNumber((value) => value - 1)}>Prev</button>
              <span>Page {pageNumber} / {pageCount || 1}</span>
              <button className="small-button" disabled={!pageCount || pageNumber >= pageCount} onClick={() => setPageNumber((value) => value + 1)}>Next</button>
            </div>
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
              <div className="upload-empty">
                <FilePlus2 size={44} />
                <h2>Upload a drawing PDF</h2>
                <p>Then choose the red balloon tool, click the dimension or note target, and click where the balloon should sit.</p>
                <label className="button primary">
                  <Upload size={16} />
                  Choose PDF
                  <input type="file" accept="application/pdf" onChange={handlePdfUpload} />
                </label>
              </div>
            ) : (
              <div
                ref={overlayRef}
                className={`pdf-stage ${mode === "balloon" ? "placing" : ""} ${pendingTarget ? "placing-balloon" : ""}`}
                style={{ width: canvasSize.width, height: canvasSize.height }}
                onClick={handleCanvasClick}
                onPointerDown={beginTextAreaSelection}
                onPointerMove={moveTextAreaSelection}
                onPointerUp={endTextAreaSelection}
                onPointerCancel={endTextAreaSelection}
              >
                <canvas ref={canvasRef} />
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
                />
                {pendingTarget?.page === pageNumber ? (
                  <div
                    className="pending-target"
                    style={{ left: `${pendingTarget.x * 100}%`, top: `${pendingTarget.y * 100}%` }}
                  />
                ) : null}
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
                    }}
                    title={`Balloon ${item.balloonNo}`}
                  >
                    {item.balloonNo}
                  </button>
                ))}
                {selected?.page === pageNumber ? (
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
          <div className="status-card">
            <span>Package Status</span>
            <strong className={`status ${projectStatus.toLowerCase()}`}>{projectStatus}</strong>
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
        </div>
        <CharacteristicTable
          characteristics={characteristics}
          selectedId={selectedId}
          sampleCount={sampleCount}
          onSelect={setSelectedId}
          onChange={updateCharacteristic}
          onReassign={reassignBalloonNo}
          onSampleChange={updateSample}
          onDelete={deleteCharacteristic}
        />
      </section>

      </div>
    </div>
  );
}

function ProjectDashboard({
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
    </div>
  );
}

function Field({ label, value, onChange, compact = false, wide = false }) {
  return (
    <label className={`field ${compact ? "compact" : ""} ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ToolButton({ active, title, onClick, icon }) {
  return (
    <button className={`icon-button ${active ? "active" : ""}`} onClick={onClick} title={title}>
      {icon}
    </button>
  );
}

function ResizeHandle({
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

function TextLayer({ active, items, onCapture }) {
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

function LeaderLayer({ balloons, selectedId, width, height }) {
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

function BalloonEditor({ item, sampleCount, onChange, onReassign, onSampleChange }) {
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

function CharacteristicTable({
  characteristics,
  selectedId,
  sampleCount,
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

  if (!characteristics.length) {
    return (
      <div className="table-empty">
        <Circle size={26} />
        <p>No characteristics yet. Add a balloon on the drawing or create a row manually.</p>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table>
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
            <th>Status</th>
            <th aria-label="Row actions"></th>
          </tr>
        </thead>
        <tbody>
          {sorted
            .map((item) => {
              const { usl, lsl } = getLimits(item);
              const status = getStatus(item, sampleCount);
              return (
                <tr
                  key={item.id}
                  className={selectedId === item.id ? "row-selected" : ""}
                  onClick={() => onSelect(item.id)}
                >
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
                      <input value={item.samples[index] ?? ""} onChange={(event) => onSampleChange(item.id, index, event.target.value)} />
                    </td>
                  ))}
                  <td>
                    <select value={item.method} onChange={(event) => onChange(item.id, { method: event.target.value })}>
                      {methods.map((method) => <option key={method} value={method}>{method}</option>)}
                    </select>
                  </td>
                  <td><span className={`status mini ${status.toLowerCase()}`}>{status}</span></td>
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
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

function buildDrawingSnapshot({
  drawing,
  activeDrawingId,
  activeProjectId,
  metadata,
  sampleCount,
  pdfBytes,
  pdfName,
  pageCount,
  pageNumber,
  zoom,
  characteristics,
  status,
  now,
}) {
  const baseName = pdfName ? pdfName.replace(/\.[^/.]+$/, "") : "Untitled Drawing";
  return {
    id: activeDrawingId,
    projectId: activeProjectId,
    name: drawing?.name || metadata.drawingNo || baseName,
    pdfName,
    pdfBytes,
    pdfByteLength: pdfBytes?.byteLength || drawing?.pdfByteLength || 0,
    pageCount,
    metadata,
    sampleCount,
    characteristics,
    pageNumber,
    zoom,
    status,
    createdAt: drawing?.createdAt || now,
    updatedAt: now,
  };
}

function updateDrawingSummary(drawings, drawing) {
  const summary = {
    ...drawing,
    pdfBytes: undefined,
  };
  const existing = drawings.some((item) => item.id === drawing.id);
  const next = existing
    ? drawings.map((item) => (item.id === drawing.id ? summary : item))
    : [summary, ...drawings];
  return next.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

function getStorageWarning({ drawingBytes, projectBytes, estimate }) {
  if (projectBytes > PROJECT_LIMITS.projectWarningBytes) {
    return `Storage warning: project is ${formatBytes(projectBytes)}`;
  }
  if (drawingBytes > PROJECT_LIMITS.largePdfBytes) {
    return `Large PDF saved: ${formatBytes(drawingBytes)}`;
  }
  if (estimate?.quota && estimate?.usage) {
    const freeBytes = estimate.quota - estimate.usage;
    if (freeBytes < PROJECT_LIMITS.largePdfBytes) {
      return `Storage low: ${formatBytes(freeBytes)} free`;
    }
  }
  return "";
}

function getStorageErrorMessage(error) {
  if (error?.name === "QuotaExceededError") {
    return "Local storage quota exceeded. Delete drawings or use a smaller PDF before saving.";
  }
  return `Local project save failed: ${error?.message || "unknown storage error"}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function setMetadataValue(setMetadata, key, value) {
  setMetadata((current) => ({ ...current, [key]: value }));
}

function mapTextItem(item, index, viewport, zoom) {
  const text = item.str?.trim();
  if (!text) return null;

  const [left, baselineY] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
  const rawHeight = Math.abs(item.height || item.transform[3] || 8) * zoom;
  const height = Math.max(7, rawHeight);
  const width = item.width
    ? Math.max(4, Math.abs(item.width) * zoom)
    : Math.max(4, text.length * height * 0.45);
  const fontSize = Math.max(6, height * 0.94);
  const angle = Math.atan2(item.transform[1] || 0, item.transform[0] || 1);

  return {
    id: `${index}-${text}-${Math.round(left)}-${Math.round(baselineY)}`,
    text,
    left,
    top: baselineY - height,
    width,
    height,
    fontSize,
    angle,
  };
}

function metadataLabel(key) {
  const labels = {
    drawingNo: "Drawing No",
    revision: "Rev",
    supplier: "Supplier",
    description: "Description",
  };
  return labels[key] || key;
}

function fieldLabel(key) {
  const labels = {
    nominal: "Requirement",
    tolerance: "Tolerance",
    notes: "Notes",
  };
  return labels[key] || key;
}

function getNormalizedPoint(event, element) {
  const rect = element.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  };
}

function normalizeRect(startX, startY, endX, endY) {
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

function cropCanvasArea(canvas, rect) {
  const sourceX = Math.floor(rect.x * canvas.width);
  const sourceY = Math.floor(rect.y * canvas.height);
  const sourceWidth = Math.max(1, Math.floor(rect.width * canvas.width));
  const sourceHeight = Math.max(1, Math.floor(rect.height * canvas.height));
  const scale = 2;
  const output = document.createElement("canvas");
  output.width = sourceWidth * scale;
  output.height = sourceHeight * scale;
  const context = output.getContext("2d");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, output.width, output.height);
  context.imageSmoothingEnabled = true;
  context.drawImage(
    canvas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    output.width,
    output.height,
  );

  return output.toDataURL("image/png");
}

function nextBalloonNo(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.balloonNo) || 0), 0) + 1;
}

function renumber(items) {
  return items
    .slice()
    .sort((a, b) => a.balloonNo - b.balloonNo)
    .map((item, index) => ({ ...item, balloonNo: index + 1 }));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
