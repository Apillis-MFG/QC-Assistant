// Edge Function: invite-vendor
// Invites a vendor by email to a specific shared project. Requires the
// service_role key, so this call must never happen from the browser --
// the frontend calls this function's URL (with the user's anon-key session
// JWT in the Authorization header), and this function alone holds
// SUPABASE_SERVICE_ROLE_KEY to perform the privileged admin invite.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") ?? "http://127.0.0.1:5173";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await callerClient.auth.getUser();
  if (authError || !user) {
    return json({ error: "Not authenticated" }, 401);
  }

  const { email, projectId, canCreateBalloons = true, canEditMeasurements = true } = await req.json();
  if (!email || !projectId) {
    return json({ error: "email and projectId are required" }, 400);
  }

  // Confirm the caller belongs to the owning org of this project (RLS also
  // enforces this on the underlying tables, this is a fast explicit check).
  const { data: project, error: projectError } = await callerClient
    .from("projects")
    .select("id, owner_org_id")
    .eq("id", projectId)
    .single();
  if (projectError || !project) {
    return json({ error: "Project not found or not accessible" }, 404);
  }

  const { data: membership } = await callerClient
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", project.owner_org_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return json({ error: "Not a member of the owning organization" }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { error: inviteRowError } = await admin.from("pending_invites").insert({
    email,
    invited_org_id: project.owner_org_id,
    project_id: projectId,
    role_grants: { can_create_balloons: canCreateBalloons, can_edit_measurements: canEditMeasurements },
    invited_by_user_id: user.id,
  });
  if (inviteRowError) {
    return json({ error: inviteRowError.message }, 500);
  }

  const { error: sendError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { invited_org_role: "vendor", invited_to_project_id: projectId },
    redirectTo: `${APP_URL}/accept-invite`,
  });
  if (sendError) {
    return json({ error: sendError.message }, 500);
  }

  return json({ ok: true }, 200);
});
