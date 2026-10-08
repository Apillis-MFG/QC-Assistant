import assert from "node:assert/strict";
import { chromium } from "playwright";
import { expect } from "playwright/test";
import { PDFDocument } from "pdf-lib";

const baseUrl = process.env.QCA_BASE_URL || "http://127.0.0.1:5173";
const pdf = await PDFDocument.create();
pdf.addPage([600, 800]);
const bytes = [...await pdf.save()];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

// Exercise the actual cloud adapter and app without creating manufacturing
// records in a production database. This client models storage and row writes.
await context.route("**/src/lib/supabaseClient.js", (route) => route.fulfill({
  contentType: "application/javascript",
  body: `
    export const supabaseEnabled = true;
    const user = { id: "test-user" };
    const db = globalThis.__unitCloud = JSON.parse(sessionStorage.getItem("unit-cloud-fixture")) || { tables: { projects: [], drawings: [], characteristics: [], measurements: [], project_shares: [],
      organization_members: [{ user_id: user.id, organization_id: "test-org", role: "owner", organization: {id:"test-org",name:"Test",kind:"company"} }] },
      files: {}, denied: false, writes: [], delay: 0 };
    const persist = () => sessionStorage.setItem("unit-cloud-fixture", JSON.stringify(db));
    function from(table) {
      let operation = "select", values, filters = [], one = false, selection = "";
      const query = {
        select(s = "") { selection = s; return query; },
        eq(k,v) { filters.push(r => r[k] === v); return query; },
        in(k,v) { filters.push(r => v.includes(r[k])); return query; },
        order() { return query; },
        upsert(v) { operation = "upsert"; values = Array.isArray(v) ? v : [v]; return query; },
        insert(v) { operation = "insert"; values = Array.isArray(v) ? v : [v]; return query; },
        update(v) { operation = "update"; values = v; return query; },
        delete() { operation = "delete"; return query; },
        single() { one = true; return query; }, maybeSingle() { one = true; return query; },
        async then(resolve, reject) {
          try {
            if (operation !== "select" && db.denied) return resolve({data:null,error:{message:"Test drawing permission denied"}});
            if (operation !== "select" && db.delay) await new Promise(r => setTimeout(r, db.delay));
            const rows = db.tables[table] ||= [];
            const matches = r => filters.every(f => f(r));
            let result;
            if (operation === "upsert" || operation === "insert") {
              result = values.map(value => {
                const key = table === "measurements" ? r => r.characteristic_id === value.characteristic_id && r.sample_index === value.sample_index : r => r.id === value.id;
                let row = operation === "upsert" ? rows.find(key) : null;
                if (!row) { row = {id:crypto.randomUUID(),created_at:new Date().toISOString(),updated_at:new Date().toISOString()}; rows.push(row); }
                Object.assign(row, structuredClone(value)); return row;
              });
            } else if (operation === "update") { result = rows.filter(matches); result.forEach(r => Object.assign(r, structuredClone(values))); }
            else if (operation === "delete") { db.tables[table] = rows.filter(r => !matches(r)); result = []; }
            else result = rows.filter(matches);
            if (operation !== "select") db.writes.push({table,operation,values:structuredClone(values)});
            if (operation !== "select") persist();
            result = result.map(r => ({...r}));
            if (table === "projects" && selection.includes("drawings")) result.forEach(r => r.drawings = db.tables.drawings.filter(d => d.project_id === r.id));
            if (table === "characteristics" && selection.includes("measurements")) result.forEach(r => r.measurements = db.tables.measurements.filter(m => m.characteristic_id === r.id));
            resolve({data:one ? result[0] || null : result,error:null});
          } catch(e) { reject(e); }
        }
      }; return query;
    }
    export const supabase = {
      from,
      auth: { async getSession(){return {data:{session:{user}}};}, onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};} },
      storage: { from(){return {
        async upload(path,b){db.files[path]=Array.from(new Uint8Array(b));persist();return {error:null};},
        async download(path){return {data:new Blob([new Uint8Array(db.files[path])]),error:null};}
      };} },
      async rpc(name, args){ const drawing=db.tables.drawings.find(d=>d.id===args.p_drawing_id); drawing.balloon_seq=(drawing.balloon_seq||0)+1;return {data:drawing.balloon_seq,error:null}; },
      channel(){const c={on(){return c;},subscribe(){return c;},unsubscribe(){}};return c;}
    };
  `,
}));

const page = await context.newPage();
page.on("pageerror", (error) => { throw error; });
try {
  await page.goto(baseUrl);
  await page.locator(".dashboard-shell").waitFor();
  const ids = await page.evaluate(async (pdfBytes) => {
    const local = await import("/src/lib/projectStore.js");
    const cloud = await import("/src/lib/supabaseStore.js");
    const projectId = crypto.randomUUID(), drawingId = crypto.randomUUID();
    const project = { id:projectId, name:"Shared unit regression" };
    const drawing = { id:drawingId, name:"Inch drawing", pdfName:"inch.pdf", pdfBytes:new Uint8Array(pdfBytes).buffer,
      pageCount:1, unitSystem:"inch", toleranceOverrides:{linear:{3:"±0.005"},angle:{},linearUnitSystem:"inch"},
      metadata:{drawingNo:"INCH"}, sampleCount:1, characteristics:[{
        id:crypto.randomUUID(),balloonNo:1,type:"dimension",unit:"IN",nominal:"0.125",tolerance:"±0.005",samples:{0:"0.125"},
        page:1,x:0.5,y:0.5,targetX:0.4,targetY:0.4,method:"DC",notes:""
      }] };
    await local.saveProject(project);
    await local.saveDrawing(projectId,drawing);
    const shared = await cloud.migrateLocalProjectToCloud("test-org", project, [await local.loadDrawing(drawingId)]);
    const workspace = await cloud.loadProject(shared.id);
    const sharedDrawingId = workspace.drawings[0].id;
    const loaded = await cloud.loadDrawing(sharedDrawingId);
    return {projectId:shared.id,drawingId:sharedDrawingId,loaded};
  }, bytes);
  assert.equal(ids.loaded.unitSystem, "inch");
  assert.equal(ids.loaded.toleranceOverrides.linearUnitSystem, "inch");
  assert.equal(ids.loaded.characteristics[0].unit, "IN");
  assert.equal(ids.loaded.characteristics[0].samples[0], "0.125");
  await page.goto(`${baseUrl}/projects/${ids.projectId}/drawings/${ids.drawingId}`);
  const units = page.getByRole("combobox", { name: "Drawing unit system" });
  await expect(units).toHaveValue("inch");
  await expect(units).toBeEnabled();
  await page.evaluate(() => { __unitCloud.delay = 50; });
  await units.selectOption("metric");
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.locator(".dashboard-shell").waitFor();
  assert.equal(await page.evaluate((id) => __unitCloud.tables.drawings.find(d => d.id === id).unit_system, ids.drawingId), "metric");
  await page.goto(`${baseUrl}/projects/${ids.projectId}/drawings/${ids.drawingId}`);
  await expect(units).toHaveValue("metric");
  await expect(units).toBeEnabled();
  await units.selectOption("inch");
  await expect.poll(() => page.evaluate((id) => __unitCloud.tables.drawings.find(d => d.id === id).unit_system, ids.drawingId)).toBe("inch");
  const emptyProjectId = await page.evaluate(async () => {
    const id = crypto.randomUUID();
    await (await import("/src/lib/supabaseStore.js")).saveProject({id,ownerOrgId:"test-org",name:"Empty shared project"});
    return id;
  });
  // The workspace upload prompt is available when the project has no drawing.
  await page.goto(`${baseUrl}/projects/${emptyProjectId}/drawings`);
  await expect(page.getByRole("combobox", { name: "Active project" })).toHaveValue(emptyProjectId);
  await expect(units).toBeDisabled();
  await page.locator('input[type="file"]').first().setInputFiles({ name:"new-cloud-drawing.pdf", mimeType:"application/pdf", buffer:Buffer.from(bytes) });
  await expect.poll(() => page.evaluate(() => __unitCloud.tables.drawings.length)).toBe(2);
  await expect(units).toHaveValue("metric");
  const cloudRows = await page.evaluate(() => __unitCloud.tables.drawings);
  assert.equal(cloudRows.find(d => d.id === ids.drawingId).unit_system, "inch");
  const newId = cloudRows.find(d => d.id !== ids.drawingId).id;
  assert.equal(cloudRows.find(d => d.id === newId).unit_system, "metric");
  assert.equal(await page.evaluate(async (id) => (await import("/src/lib/projectStore.js")).loadDrawing(id), newId), null);
  await page.getByRole("combobox", { name: "Active project" }).selectOption(ids.projectId);
  await expect(units).toHaveValue("inch");
  await expect(units).toBeEnabled();
  const originalUrl = page.url();
  await page.evaluate(() => { __unitCloud.denied = true; });
  await units.selectOption("metric");
  await page.getByRole("combobox", { name: "Active project" }).selectOption(emptyProjectId);
  await expect(page.locator(".message").last()).toContainText("permission denied");
  await expect(page.getByRole("combobox", { name: "Active drawing" })).toHaveValue(ids.drawingId);
  assert.equal(page.url(), originalUrl);
  assert.equal(await page.evaluate((id) => __unitCloud.tables.drawings.find(d => d.id === id).unit_system, ids.drawingId), "inch");
  await page.evaluate(() => { __unitCloud.denied = false; __unitCloud.delay = 0; });
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.locator(".dashboard-shell").waitFor();
  await page.evaluate((id) => {
    history.pushState(null, "", `/projects/${id}`);
    dispatchEvent(new PopStateEvent("popstate"));
  }, emptyProjectId);
  await page.locator(".project-detail-form").first().waitFor();
  await page.locator('input[type="file"]').first().setInputFiles({ name:"detail-cloud-drawing.pdf", mimeType:"application/pdf", buffer:Buffer.from(bytes) });
  await expect.poll(() => page.evaluate(() => __unitCloud.tables.drawings.length)).toBe(3);
  const detailDrawing = await page.evaluate(() => __unitCloud.tables.drawings.find(d => d.pdf_name === "detail-cloud-drawing.pdf"));
  assert.equal(detailDrawing.unit_system, "metric");
  assert.equal(await page.evaluate(async (id) => (await import("/src/lib/projectStore.js")).loadDrawing(id), detailDrawing.id), null);
  const legacyUnit = await page.evaluate(async (id) => {
    delete __unitCloud.tables.drawings.find(d => d.id === id).unit_system;
    return (await (await import("/src/lib/supabaseStore.js")).loadDrawing(id)).unitSystem;
  }, detailDrawing.id);
  assert.equal(legacyUnit, "metric");
  console.log("PASS: shared mappings, local-to-shared migration, reopen, workspace upload, and permission failures (controlled client)");
} finally {
  await browser.close();
}
