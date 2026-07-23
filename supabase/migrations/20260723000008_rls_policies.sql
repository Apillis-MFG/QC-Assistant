alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table projects enable row level security;
alter table project_shares enable row level security;
alter table drawings enable row level security;
alter table characteristics enable row level security;
alter table measurements enable row level security;
alter table pending_invites enable row level security;

-- organizations: visible to members, plus any org partnered with via a share
create policy org_select on organizations for select
  using (
    is_org_member(id, auth.uid())
    or exists (
      select 1 from project_shares ps join projects p on p.id = ps.project_id
      where (ps.partner_org_id = organizations.id and is_org_member(p.owner_org_id, auth.uid()))
         or (p.owner_org_id = organizations.id and is_org_member(ps.partner_org_id, auth.uid()))
    )
  );

create policy org_insert on organizations for insert
  with check (true); -- any authenticated user may create a new org (e.g. first-time company signup)

create policy org_update on organizations for update
  using (is_org_member(id, auth.uid()));

-- organization_members: only visible/manageable by members of that same org
create policy org_members_select on organization_members for select
  using (is_org_member(organization_id, auth.uid()));

create policy org_members_self_insert on organization_members for insert
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from organization_members m
      where m.organization_id = organization_members.organization_id
        and m.user_id = auth.uid() and m.role in ('owner', 'admin')
    )
  );

create policy org_members_admin_delete on organization_members for delete
  using (
    exists (
      select 1 from organization_members m
      where m.organization_id = organization_members.organization_id
        and m.user_id = auth.uid() and m.role in ('owner', 'admin')
    )
  );

-- projects: owner org has full CRUD; partner orgs get read via the share
create policy projects_select on projects for select
  using (is_org_member(owner_org_id, auth.uid()) or has_project_access(id, auth.uid()));

create policy projects_insert on projects for insert
  with check (is_org_member(owner_org_id, auth.uid()));

create policy projects_update on projects for update
  using (is_org_member(owner_org_id, auth.uid()))
  with check (is_org_member(owner_org_id, auth.uid()));

create policy projects_delete on projects for delete
  using (is_org_member(owner_org_id, auth.uid()));

-- project_shares: only the owning org manages shares; both sides can read the grant
create policy project_shares_select on project_shares for select
  using (
    is_org_member(partner_org_id, auth.uid())
    or exists (select 1 from projects p where p.id = project_id and is_org_member(p.owner_org_id, auth.uid()))
  );

create policy project_shares_insert on project_shares for insert
  with check (exists (select 1 from projects p where p.id = project_id and is_org_member(p.owner_org_id, auth.uid())));

create policy project_shares_update on project_shares for update
  using (exists (select 1 from projects p where p.id = project_id and is_org_member(p.owner_org_id, auth.uid())));

create policy project_shares_delete on project_shares for delete
  using (exists (select 1 from projects p where p.id = project_id and is_org_member(p.owner_org_id, auth.uid())));

-- drawings: readable by anyone with project access; writable by owner org,
-- or a partner org granted drawing_meta edit rights
create policy drawings_select on drawings for select
  using (has_project_access(project_id, auth.uid()));

create policy drawings_insert on drawings for insert
  with check (
    has_project_access(project_id, auth.uid(), 'drawing_meta')
    or exists (select 1 from projects p where p.id = drawings.project_id and is_org_member(p.owner_org_id, auth.uid()))
  );

create policy drawings_update on drawings for update
  using (
    has_project_access(project_id, auth.uid(), 'drawing_meta')
    or exists (select 1 from projects p where p.id = drawings.project_id and is_org_member(p.owner_org_id, auth.uid()))
  );

create policy drawings_delete on drawings for delete
  using (exists (select 1 from projects p where p.id = drawings.project_id and is_org_member(p.owner_org_id, auth.uid())));

-- characteristics: readable by project access; insert/update gated on 'balloons' permission
create policy characteristics_select on characteristics for select
  using (has_project_access((select project_id from drawings where id = drawing_id), auth.uid()));

create policy characteristics_insert on characteristics for insert
  with check (can_write_drawing(drawing_id, auth.uid()));

create policy characteristics_update on characteristics for update
  using (can_write_drawing(drawing_id, auth.uid()))
  with check (can_write_drawing(drawing_id, auth.uid()));

-- deletion stays owner-org-only by default; loosen later if vendors need delete rights
create policy characteristics_delete on characteristics for delete
  using (
    exists (
      select 1 from drawings d join projects p on p.id = d.project_id
      where d.id = drawing_id and is_org_member(p.owner_org_id, auth.uid())
    )
  );

-- measurements: gated on 'measurements' permission specifically (separate from balloon creation)
create policy measurements_select on measurements for select
  using (
    has_project_access(
      (select d.project_id from characteristics c join drawings d on d.id = c.drawing_id where c.id = characteristic_id),
      auth.uid()
    )
  );

create policy measurements_insert on measurements for insert
  with check (
    has_project_access(
      (select d.project_id from characteristics c join drawings d on d.id = c.drawing_id where c.id = characteristic_id),
      auth.uid(), 'measurements'
    )
  );

create policy measurements_update on measurements for update
  using (
    has_project_access(
      (select d.project_id from characteristics c join drawings d on d.id = c.drawing_id where c.id = characteristic_id),
      auth.uid(), 'measurements'
    )
  );

-- pending_invites: only visible/manageable by the inviting org's members
create policy pending_invites_select on pending_invites for select
  using (is_org_member(invited_org_id, auth.uid()));

create policy pending_invites_insert on pending_invites for insert
  with check (is_org_member(invited_org_id, auth.uid()));
