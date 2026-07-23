-- Dev fixture: a sample company + vendor org, a shared project/drawing/
-- balloon, so the frontend can be built against a ready-made "shared project"
-- without running the real auth invite flow every time.
--
-- Auth users must exist before organization_members can reference them; when
-- running against `supabase start`, create these two users first via the
-- Studio (http://127.0.0.1:54323) or the Auth Admin API, then substitute
-- their real UUIDs below before running `supabase db reset`.

do $$
declare
  v_company_org_id uuid := '00000000-0000-0000-0000-000000000001';
  v_vendor_org_id uuid := '00000000-0000-0000-0000-000000000002';
  v_project_id uuid := '00000000-0000-0000-0000-000000000010';
  v_drawing_id uuid := '00000000-0000-0000-0000-000000000020';
begin
  insert into organizations (id, name, kind) values
    (v_company_org_id, 'Acme Manufacturing', 'company'),
    (v_vendor_org_id, 'Precision Vendor Co', 'vendor')
  on conflict (id) do nothing;

  insert into projects (id, owner_org_id, name, code, owner) values
    (v_project_id, v_company_org_id, 'Sample Shared Project', 'ACME-001', 'Jane Doe')
  on conflict (id) do nothing;

  insert into project_shares (project_id, partner_org_id, can_create_balloons, can_edit_measurements) values
    (v_project_id, v_vendor_org_id, true, true)
  on conflict (project_id, partner_org_id) do nothing;

  insert into drawings (id, project_id, name, metadata, sample_count) values
    (v_drawing_id, v_project_id, 'Sample Drawing Rev A',
     '{"drawingNo":"DWG-1001","revision":"A","supplier":"Precision Vendor Co","description":"Sample bracket"}'::jsonb,
     5)
  on conflict (id) do nothing;

  insert into characteristics (drawing_id, balloon_no, page, x, y, type, unit, nominal, tolerance, method) values
    (v_drawing_id, 1, 1, 0.25, 0.30, 'dimension', 'MM', '12.5', '{"kind":"symmetric","value":"0.1"}'::jsonb, 'CMM')
  on conflict (drawing_id, balloon_no) do nothing;

  update drawings set balloon_seq = 1 where id = v_drawing_id;
end $$;
