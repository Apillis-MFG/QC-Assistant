import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  Download,
  FilePlus2,
  Hand,
  MousePointer2,
  Plus,
  Save,
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

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const methods = ["DC", "CMM", "VS", "VMS", "HG", "MIC", "CG", "PP", "TG", "PG"];
const types = ["dimension", "gdt", "note", "visual"];
const CHARACTERISTIC_FIELDS = ["nominal", "tolerance", "notes"];

const STORAGE_KEY = "qca_v1";

const emptyMetadata = {
  drawingNo: "",
  revision: "",
  supplier: "",
  description: "",
};

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
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
  const [metadata, setMetadata] = useState(() => loadSession()?.metadata ?? emptyMetadata);
  const [sampleCount, setSampleCount] = useState(() => loadSession()?.sampleCount ?? 5);
  const [pdfBytes, setPdfBytes] = useState(null);
  const [pdfName, setPdfName] = useState("");
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1.15);
  const [mode, setMode] = useState("select");
  const [characteristics, setCharacteristics] = useState(() => loadSession()?.characteristics ?? []);
  const [selectedId, setSelectedId] = useState(null);
  const [pendingTarget, setPendingTarget] = useState(null);
  const [textItems, setTextItems] = useState([]);
  const [selectedText, setSelectedText] = useState("");
  const [ocrRect, setOcrRect] = useState(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [message, setMessage] = useState(() =>
    loadSession() !== null ? "Restored previous session. Upload your PDF to continue." : "Upload a drawing PDF to begin.",
  );
  const canvasRef = useRef(null);
  const scrollRef = useRef(null);
  const overlayRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const ocrRef = useRef(null);

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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ metadata, characteristics, sampleCount }));
    } catch {
      // storage quota exceeded or private browsing — fail silently
    }
  }, [metadata, characteristics, sampleCount]);

  const handlePdfUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const bytes = await file.arrayBuffer();
    const loadedPdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    setPdfBytes(bytes);
    setPdfName(file.name);
    setPdfDoc(loadedPdf);
    setPageCount(loadedPdf.numPages);
    setPageNumber(1);
    setMessage(`Loaded ${file.name}`);

    const baseName = file.name.replace(/\.[^/.]+$/, "");
    setMetadata((current) => ({
      ...current,
      drawingNo: current.drawingNo || baseName,
    }));
  }, []);

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

  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setMetadata(emptyMetadata);
    setSampleCount(5);
    setCharacteristics([]);
    setSelectedId(null);
    setMessage("Session cleared. Upload a drawing PDF to begin.");
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setCharacteristics((items) => renumber(items.filter((item) => item.id !== selectedId)));
    setSelectedId(null);
    setMessage("Deleted selected balloon and renumbered the table.");
  }, [selectedId]);

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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">QC</div>
          <div>
            <h1>QC Assistant</h1>
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
          <label className="button secondary">
            <Upload size={16} />
            Upload PDF
            <input type="file" accept="application/pdf" onChange={handlePdfUpload} />
          </label>
          <button className="button secondary" onClick={exportPdf} disabled={!pdfBytes || !characteristics.length}>
            <Download size={16} />
            PDF
          </button>
          <button className="button primary" onClick={exportExcel} disabled={!characteristics.length}>
            <Save size={16} />
            Excel
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="drawing-panel">
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
              </div>
            )}
          </div>
        </section>

        <aside className="inspector">
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
              <button className="button secondary" onClick={addManualRow}>
                <Plus size={16} />
                Add Row
              </button>
              <button className="button secondary" onClick={loadDemoRows}>
                Demo Rows
              </button>
            </div>
            <button
              className="button secondary"
              onClick={clearSession}
              disabled={!characteristics.length && !metadata.drawingNo}
            >
              Clear Session
            </button>
          </div>

          <div className="message">{message}</div>
        </aside>
      </main>

      <section className="table-panel">
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
          onSampleChange={updateSample}
        />
      </section>
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

function BalloonEditor({ item, sampleCount, onChange, onSampleChange }) {
  const { usl, lsl } = getLimits(item);
  return (
    <div className="editor-grid">
      <label>
        ID
        <input value={item.balloonNo} onChange={(event) => onChange({ balloonNo: Number(event.target.value) || item.balloonNo })} />
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

function CharacteristicTable({ characteristics, selectedId, sampleCount, onSelect, onChange, onSampleChange }) {
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
                  <td className="id-cell">{item.balloonNo}</td>
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
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
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
