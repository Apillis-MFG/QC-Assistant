import { supabase } from "./supabaseClient.js";
import { ZOOM_DEFAULT } from "./constants.js";

const DRAWINGS_BUCKET = "drawings";

export async function createOrganization(name) {
  const { data, error } = await supabase.rpc("create_company_organization", { org_name: name });
  if (error) throw error;
  return data;
}

export async function listProjects(orgIds) {
  if (!orgIds?.length) return [];
  const { data: owned, error: ownedError } = await supabase
    .from("projects")
    .select("*, drawings(id, pdf_byte_length, status)")
    .in("owner_org_id", orgIds);
  if (ownedError) throw ownedError;

  const { data: sharedRows, error: sharedError } = await supabase
    .from("project_shares")
    .select("project:projects(*, drawings(id, pdf_byte_length, status))")
    .in("partner_org_id", orgIds);
  if (sharedError) throw sharedError;

  const shared = (sharedRows || []).map((row) => row.project).filter(Boolean);
  const byId = new Map();
  [...(owned || []), ...shared].forEach((row) => byId.set(row.id, row));

  return Array.from(byId.values())
    .map(fromProjectRow)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

export async function loadProject(projectId) {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!project) return null;

  const { data: drawings, error: drawingsError } = await supabase
    .from("drawings")
    .select("*")
    .eq("project_id", projectId);
  if (drawingsError) throw drawingsError;

  return {
    project: fromProjectRow(project),
    drawings: (drawings || [])
      .map(fromDrawingRow)
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))),
  };
}

export async function saveProject(project) {
  const { data, error } = await supabase
    .from("projects")
    .upsert(toProjectRow(project))
    .select()
    .single();
  if (error) throw error;
  return fromProjectRow(data);
}

export async function deleteProject(projectId) {
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw error;
}

export async function loadDrawing(drawingId) {
  const { data: drawing, error: drawingError } = await supabase
    .from("drawings")
    .select("*")
    .eq("id", drawingId)
    .maybeSingle();
  if (drawingError) throw drawingError;
  if (!drawing) return null;

  const { data: characteristics, error: charError } = await supabase
    .from("characteristics")
    .select("*, measurements(sample_index, value)")
    .eq("drawing_id", drawingId)
    .order("balloon_no", { ascending: true });
  if (charError) throw charError;

  let pdfBytes = null;
  if (drawing.pdf_storage_path) {
    const { data: file, error: downloadError } = await supabase.storage
      .from(DRAWINGS_BUCKET)
      .download(drawing.pdf_storage_path);
    if (downloadError) throw downloadError;
    pdfBytes = await file.arrayBuffer();
  }

  return {
    ...fromDrawingRow(drawing),
    characteristics: (characteristics || []).map(fromCharacteristicRow),
    pdfBytes,
  };
}

export async function saveDrawing(projectId, drawing) {
  const row = toDrawingRow(projectId, drawing);
  const { data: savedDrawing, error: drawingError } = await supabase
    .from("drawings")
    .upsert(row)
    .select()
    .single();
  if (drawingError) throw drawingError;

  if (drawing.pdfBytes) {
    const path = `${projectId}/${savedDrawing.id}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from(DRAWINGS_BUCKET)
      .upload(path, drawing.pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw uploadError;
    const { error: pathError } = await supabase
      .from("drawings")
      .update({ pdf_storage_path: path, pdf_byte_length: drawing.pdfBytes.byteLength })
      .eq("id", savedDrawing.id);
    if (pathError) throw pathError;
  }

  const savedCharacteristics = await saveCharacteristics(savedDrawing.id, drawing.characteristics || []);

  return { ...fromDrawingRow(savedDrawing), characteristics: savedCharacteristics };
}

export async function deleteDrawing(drawingId) {
  const { error } = await supabase.from("drawings").delete().eq("id", drawingId);
  if (error) throw error;
}

// Balloon numbers are only ever assigned by the server. A characteristic the
// client hasn't saved before gets an authoritative number allocated here
// (allocate_balloon_no); its client-side `balloonNo` (computed locally via
// nextBalloonNo/renumber for instant UI feedback) is discarded. Already-saved
// characteristics keep their existing DB balloon_no -- the client never
// overwrites it, so a local dense renumber-on-delete never reaches the DB.
// The caller (App.jsx persistActiveDrawing) reconciles local state against
// the corrected numbers this function returns.
async function saveCharacteristics(drawingId, characteristics) {
  const { data: existingRows, error: existingError } = await supabase
    .from("characteristics")
    .select("id, balloon_no")
    .eq("drawing_id", drawingId);
  if (existingError) throw existingError;
  const existingBalloonNoById = new Map((existingRows || []).map((row) => [row.id, row.balloon_no]));

  const incomingIds = new Set(characteristics.map((c) => c.id));
  const removedIds = (existingRows || []).map((row) => row.id).filter((id) => !incomingIds.has(id));
  if (removedIds.length) {
    const { error: deleteError } = await supabase.from("characteristics").delete().in("id", removedIds);
    if (deleteError) throw deleteError;
  }

  if (!characteristics.length) return [];

  const rows = [];
  for (const characteristic of characteristics) {
    const existingBalloonNo = existingBalloonNoById.get(characteristic.id);
    const balloonNo = existingBalloonNo ?? (await allocateBalloonNo(drawingId));
    rows.push({ ...toCharacteristicRow(drawingId, characteristic), balloon_no: balloonNo });
  }

  const { data: savedRows, error } = await supabase.from("characteristics").upsert(rows).select();
  if (error) throw error;

  const measurementRows = characteristics.flatMap((c) =>
    Object.entries(c.samples || {}).map(([sampleIndex, value]) => ({
      characteristic_id: c.id,
      sample_index: Number(sampleIndex),
      value: value == null ? null : String(value),
    }))
  );
  if (measurementRows.length) {
    const { error: measurementError } = await supabase.from("measurements").upsert(measurementRows);
    if (measurementError) throw measurementError;
  }

  const samplesById = new Map(characteristics.map((c) => [c.id, c.samples || {}]));
  return (savedRows || [])
    .map((row) => ({ ...fromCharacteristicRow(row), samples: samplesById.get(row.id) || {} }))
    .sort((a, b) => a.balloonNo - b.balloonNo);
}

// Server-authoritative balloon numbering (see allocate_balloon_no RPC,
// supabase/migrations/20260723000006_balloon_allocator.sql). Replaces the
// client-side nextBalloonNo() max+1 pattern for cloud drawings, since two
// collaborators may add balloons concurrently.
export async function allocateBalloonNo(drawingId) {
  const { data, error } = await supabase.rpc("allocate_balloon_no", { p_drawing_id: drawingId });
  if (error) throw error;
  return data;
}

export function subscribeToDrawing(drawingId, { onCharacteristicChange, onMeasurementChange, onDrawingChange } = {}) {
  let channel = supabase
    .channel(`drawing:${drawingId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "characteristics", filter: `drawing_id=eq.${drawingId}` },
      (payload) => onCharacteristicChange?.(payload)
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "drawings", filter: `id=eq.${drawingId}` },
      (payload) => onDrawingChange?.(payload)
    );

  if (onMeasurementChange) {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "measurements" },
      (payload) => onMeasurementChange(payload)
    );
  }

  return channel.subscribe();
}

export async function shareProject(projectId, email, { canCreateBalloons = true, canEditMeasurements = true } = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  const { data, error } = await supabase.functions.invoke("invite-vendor", {
    body: { email, projectId, canCreateBalloons, canEditMeasurements },
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (error) throw error;
  return data;
}

export async function listShares(projectId) {
  const { data, error } = await supabase
    .from("project_shares")
    .select("*, partner_org:organizations(id, name, kind)")
    .eq("project_id", projectId);
  if (error) throw error;
  return data || [];
}

export async function revokeShare(shareId) {
  const { error } = await supabase.from("project_shares").delete().eq("id", shareId);
  if (error) throw error;
}

// Uploads a fully-formed local project (with drawings, PDFs, and
// characteristics already loaded from IndexedDB) into Supabase, letting the
// server assign authoritative balloon numbers in the local sort order.
export async function migrateLocalProjectToCloud(orgId, localProject, localDrawings) {
  const { data: cloudProject, error: projectError } = await supabase
    .from("projects")
    .insert({
      owner_org_id: orgId,
      name: localProject.name,
      code: localProject.code,
      owner: localProject.owner,
      estimated_delivery_date: localProject.estimatedDeliveryDate || null,
      notes: localProject.notes,
    })
    .select()
    .single();
  if (projectError) throw projectError;

  for (const drawing of localDrawings) {
    const { data: cloudDrawing, error: drawingError } = await supabase
      .from("drawings")
      .insert({
        project_id: cloudProject.id,
        name: drawing.name,
        pdf_name: drawing.pdfName,
        page_count: drawing.pageCount,
        metadata: drawing.metadata,
        tolerance_overrides: drawing.toleranceOverrides,
        sample_count: drawing.sampleCount,
        page_number: drawing.pageNumber,
        zoom: drawing.zoom,
        status: drawing.status,
      })
      .select()
      .single();
    if (drawingError) throw drawingError;

    if (drawing.pdfBytes) {
      const path = `${cloudProject.id}/${cloudDrawing.id}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from(DRAWINGS_BUCKET)
        .upload(path, drawing.pdfBytes, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw uploadError;
      await supabase
        .from("drawings")
        .update({ pdf_storage_path: path, pdf_byte_length: drawing.pdfBytes.byteLength })
        .eq("id", cloudDrawing.id);
    }

    const sorted = [...(drawing.characteristics || [])].sort((a, b) => a.balloonNo - b.balloonNo);
    for (const characteristic of sorted) {
      const balloonNo = await allocateBalloonNo(cloudDrawing.id);
      const { data: cloudCharacteristic, error: charError } = await supabase
        .from("characteristics")
        .insert({ ...toCharacteristicRow(cloudDrawing.id, characteristic), balloon_no: balloonNo })
        .select()
        .single();
      if (charError) throw charError;

      const measurementRows = Object.entries(characteristic.samples || {}).map(([sampleIndex, value]) => ({
        characteristic_id: cloudCharacteristic.id,
        sample_index: Number(sampleIndex),
        value: value == null ? null : String(value),
      }));
      if (measurementRows.length) {
        await supabase.from("measurements").insert(measurementRows);
      }
    }
  }

  return fromProjectRow(cloudProject);
}

function fromProjectRow(row) {
  const drawings = row.drawings || [];
  return {
    kind: "cloud",
    id: row.id,
    ownerOrgId: row.owner_org_id,
    name: row.name,
    code: row.code,
    owner: row.owner,
    estimatedDeliveryDate: row.estimated_delivery_date || "",
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    drawingCount: drawings.length,
    totalBytes: drawings.reduce((sum, d) => sum + (d.pdf_byte_length || 0), 0),
    status: summarizeProjectStatus(drawings.map((d) => ({ status: d.status }))),
  };
}

function toProjectRow(project) {
  return {
    id: project.id,
    owner_org_id: project.ownerOrgId,
    name: project.name?.trim() || "Untitled Project",
    code: project.code?.trim() || "",
    owner: project.owner?.trim() || "",
    estimated_delivery_date: project.estimatedDeliveryDate || null,
    notes: project.notes || "",
  };
}

function fromDrawingRow(row) {
  return {
    kind: "cloud",
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    pdfName: row.pdf_name,
    pdfByteLength: row.pdf_byte_length,
    pdfStoragePath: row.pdf_storage_path,
    pageCount: row.page_count,
    metadata: row.metadata || {},
    toleranceOverrides: row.tolerance_overrides || { linear: {}, angle: {} },
    sampleCount: row.sample_count || 5,
    characteristics: [],
    pageNumber: row.page_number || 1,
    zoom: Number(row.zoom) || ZOOM_DEFAULT,
    status: row.status || "OPEN",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDrawingRow(projectId, drawing) {
  return {
    id: drawing.id,
    project_id: projectId,
    name: drawing.name?.trim() || drawing.pdfName?.replace(/\.[^/.]+$/, "") || "Untitled Drawing",
    pdf_name: drawing.pdfName || "",
    page_count: drawing.pageCount || 0,
    metadata: drawing.metadata || {},
    tolerance_overrides: drawing.toleranceOverrides || { linear: {}, angle: {} },
    sample_count: drawing.sampleCount || 5,
    page_number: drawing.pageNumber || 1,
    zoom: drawing.zoom || ZOOM_DEFAULT,
    status: drawing.status || "OPEN",
  };
}

function fromCharacteristicRow(row) {
  const samples = {};
  (row.measurements || []).forEach((m) => {
    samples[m.sample_index] = m.value;
  });
  return {
    id: row.id,
    balloonNo: row.balloon_no,
    page: row.page,
    x: Number(row.x),
    y: Number(row.y),
    targetX: row.target_x == null ? null : Number(row.target_x),
    targetY: row.target_y == null ? null : Number(row.target_y),
    type: row.type,
    unit: row.unit,
    nominal: row.nominal,
    tolerance: row.tolerance,
    method: row.method,
    notes: row.notes || "",
    samples,
  };
}

function toCharacteristicRow(drawingId, characteristic) {
  return {
    id: characteristic.id,
    drawing_id: drawingId,
    balloon_no: characteristic.balloonNo,
    page: characteristic.page,
    x: characteristic.x,
    y: characteristic.y,
    target_x: characteristic.targetX ?? null,
    target_y: characteristic.targetY ?? null,
    type: characteristic.type,
    unit: characteristic.unit,
    nominal: characteristic.nominal,
    tolerance: characteristic.tolerance,
    method: characteristic.method,
    notes: characteristic.notes || "",
  };
}

function summarizeProjectStatus(drawings) {
  if (!drawings.length) return "OPEN";
  if (drawings.some((drawing) => drawing.status === "FAIL")) return "FAIL";
  if (drawings.some((drawing) => drawing.status === "OPEN")) return "OPEN";
  return "PASS";
}

// Signature-parity no-ops, since cloud storage isn't quota-tracked client-side
// the way IndexedDB/Origin Private File System is.
export async function getStorageEstimate() {
  return null;
}

export async function requestPersistentStorage() {
  return false;
}
