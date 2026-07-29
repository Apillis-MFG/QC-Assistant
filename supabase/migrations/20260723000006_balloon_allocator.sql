-- Atomic, server-authoritative balloon number allocation. Replaces the
-- client-side max(balloonNo)+1 pattern (src/lib/autoBalloon.js nextBalloonNo)
-- for cloud/shared drawings, where two collaborators may add balloons
-- concurrently. The row lock on `drawings` serializes allocation; the
-- critical section is a single-row update, sub-millisecond in practice.
--
-- can_write_drawing() is defined in the RLS migration (which runs after this
-- one is superseded by 20260723000007_rls_helpers.sql defining it) -- to avoid
-- a forward reference, the permission check function is created there and
-- this function is replaced (CREATE OR REPLACE) once it exists. For clarity
-- and correct migration order, the authorization check is inlined here
-- directly against project_shares/organization_members instead of depending
-- on a helper defined in a later file.
create or replace function allocate_balloon_no(p_drawing_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
  v_project_id uuid;
  v_authorized boolean;
begin
  select project_id into v_project_id from drawings where id = p_drawing_id;
  if v_project_id is null then
    raise exception 'drawing % not found', p_drawing_id;
  end if;

  select exists (
    select 1 from projects p
    where p.id = v_project_id
      and exists (
        select 1 from organization_members m
        where m.organization_id = p.owner_org_id and m.user_id = auth.uid()
      )
  ) or exists (
    select 1 from project_shares ps
    where ps.project_id = v_project_id
      and ps.can_create_balloons
      and exists (
        select 1 from organization_members m
        where m.organization_id = ps.partner_org_id and m.user_id = auth.uid()
      )
  ) into v_authorized;

  if not v_authorized then
    raise exception 'not authorized to allocate a balloon number on drawing %', p_drawing_id;
  end if;

  update drawings
     set balloon_seq = balloon_seq + 1,
         updated_at = now()
   where id = p_drawing_id
   returning balloon_seq into v_next;

  return v_next;
end;
$$;

revoke execute on function allocate_balloon_no(uuid) from public;
grant execute on function allocate_balloon_no(uuid) to authenticated;
