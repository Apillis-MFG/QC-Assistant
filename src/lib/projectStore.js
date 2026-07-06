import { ZOOM_DEFAULT } from "./constants.js";

const DB_NAME = "qca_projects_v1";
const DB_VERSION = 1;
const PROJECT_STORE = "projects";
const DRAWING_STORE = "drawings";
const PDF_STORE = "pdfs";

export const ACTIVE_PROJECT_KEY = "qca_active_project_v1";

export const PROJECT_LIMITS = {
  maxDrawings: 25,
  largePdfBytes: 25 * 1024 * 1024,
  projectWarningBytes: 500 * 1024 * 1024,
};

export async function listProjects() {
  const db = await openDb();
  const [projects, drawings] = await Promise.all([
    getAll(db, PROJECT_STORE),
    getAll(db, DRAWING_STORE),
  ]);
  const drawingsByProject = drawings.reduce((map, drawing) => {
    const items = map.get(drawing.projectId) || [];
    items.push(drawing);
    map.set(drawing.projectId, items);
    return map;
  }, new Map());

  return projects
    .map((project) => {
      const projectDrawings = drawingsByProject.get(project.id) || [];
      return {
        ...project,
        drawingCount: projectDrawings.length,
        totalBytes: projectDrawings.reduce((sum, drawing) => sum + (drawing.pdfByteLength || 0), 0),
        status: summarizeProjectStatus(projectDrawings),
      };
    })
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

export async function loadProject(projectId) {
  const db = await openDb();
  const project = await getOne(db, PROJECT_STORE, projectId);
  if (!project) return null;
  const drawings = await getByIndex(db, DRAWING_STORE, "projectId", projectId);
  return {
    project,
    drawings: drawings.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))),
  };
}

export async function saveProject(project) {
  const db = await openDb();
  await putOne(db, PROJECT_STORE, normalizeProject(project));
}

export async function deleteProject(projectId) {
  const db = await openDb();
  const drawings = await getByIndex(db, DRAWING_STORE, "projectId", projectId);
  await transact(db, [PROJECT_STORE, DRAWING_STORE, PDF_STORE], "readwrite", (stores) => {
    stores[PROJECT_STORE].delete(projectId);
    drawings.forEach((drawing) => {
      stores[DRAWING_STORE].delete(drawing.id);
      stores[PDF_STORE].delete(drawing.id);
    });
  });
}

export async function loadDrawing(drawingId) {
  const db = await openDb();
  const [drawing, pdf] = await Promise.all([
    getOne(db, DRAWING_STORE, drawingId),
    getOne(db, PDF_STORE, drawingId),
  ]);
  if (!drawing) return null;
  return {
    ...drawing,
    pdfBytes: pdf?.pdfBytes || null,
  };
}

export async function saveDrawing(projectId, drawing) {
  const db = await openDb();
  const normalized = normalizeDrawing(projectId, drawing);
  await transact(db, [DRAWING_STORE, PDF_STORE], "readwrite", (stores) => {
    stores[DRAWING_STORE].put(withoutPdfBytes(normalized));
    if (normalized.pdfBytes) {
      stores[PDF_STORE].put({ drawingId: normalized.id, pdfBytes: normalized.pdfBytes });
    }
  });
  return withoutPdfBytes(normalized);
}

export async function deleteDrawing(drawingId) {
  const db = await openDb();
  await transact(db, [DRAWING_STORE, PDF_STORE], "readwrite", (stores) => {
    stores[DRAWING_STORE].delete(drawingId);
    stores[PDF_STORE].delete(drawingId);
  });
}

export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try {
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        const projects = db.createObjectStore(PROJECT_STORE, { keyPath: "id" });
        projects.createIndex("updatedAt", "updatedAt");
      }

      if (!db.objectStoreNames.contains(DRAWING_STORE)) {
        const drawings = db.createObjectStore(DRAWING_STORE, { keyPath: "id" });
        drawings.createIndex("projectId", "projectId");
        drawings.createIndex("updatedAt", "updatedAt");
      }

      if (!db.objectStoreNames.contains(PDF_STORE)) {
        db.createObjectStore(PDF_STORE, { keyPath: "drawingId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transact(db, storeNames, mode, run) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)]));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
    try {
      run(stores);
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

function getOne(db, storeName, key) {
  return requestToPromise(db.transaction(storeName, "readonly").objectStore(storeName).get(key));
}

function getAll(db, storeName) {
  return requestToPromise(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
}

function getByIndex(db, storeName, indexName, key) {
  return requestToPromise(db.transaction(storeName, "readonly").objectStore(storeName).index(indexName).getAll(key));
}

function putOne(db, storeName, value) {
  return requestToPromise(db.transaction(storeName, "readwrite").objectStore(storeName).put(value));
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function normalizeProject(project) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: project.id,
    name: project.name?.trim() || "Untitled Project",
    code: project.code?.trim() || "",
    createdAt: project.createdAt || now,
    updatedAt: project.updatedAt || now,
  };
}

function normalizeDrawing(projectId, drawing) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: drawing.id,
    projectId,
    name: drawing.name?.trim() || drawing.pdfName?.replace(/\.[^/.]+$/, "") || "Untitled Drawing",
    pdfName: drawing.pdfName || "",
    pdfByteLength: drawing.pdfByteLength || drawing.pdfBytes?.byteLength || 0,
    pageCount: drawing.pageCount || 0,
    metadata: drawing.metadata || {},
    toleranceOverrides: {
      linear: drawing.toleranceOverrides?.linear || {},
      angle: drawing.toleranceOverrides?.angle || {},
    },
    sampleCount: drawing.sampleCount || 5,
    characteristics: Array.isArray(drawing.characteristics) ? drawing.characteristics : [],
    pageNumber: drawing.pageNumber || 1,
    zoom: drawing.zoom || ZOOM_DEFAULT,
    status: drawing.status || "OPEN",
    createdAt: drawing.createdAt || now,
    updatedAt: drawing.updatedAt || now,
    pdfBytes: drawing.pdfBytes || null,
  };
}

function withoutPdfBytes(drawing) {
  const { pdfBytes, ...summary } = drawing;
  return summary;
}

function summarizeProjectStatus(drawings) {
  if (!drawings.length) return "OPEN";
  if (drawings.some((drawing) => drawing.status === "FAIL")) return "FAIL";
  if (drawings.some((drawing) => drawing.status === "OPEN")) return "OPEN";
  return "PASS";
}
