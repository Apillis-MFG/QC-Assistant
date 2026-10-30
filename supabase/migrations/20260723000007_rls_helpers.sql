-- Shared helper functions used by every RLS policy below. security definer so
-- a policy on one table can check membership/shares without those tables
-- needing to be independently readable by every caller (avoids circular RLS).
create or replace function is_org_member(p_org_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from organization_members
    where organization_id = p_org_id and user_id = p_user_id
  );
$$;

create or replace function has_project_access(p_project_id uuid, p_user_id uuid, p_need text default null)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from projects p
    where p.id = p_project_id and is_org_member(p.owner_org_id, p_user_id)
  )
  or exists (
    select 1 from project_shares ps
    where ps.project_id = p_project_id
      and is_org_member(ps.partner_org_id, p_user_id)
      and (
        p_need is null
        or (p_need = 'balloons' and ps.can_create_balloons)
        or (p_need = 'measurements' and ps.can_edit_measurements)
        or (p_need = 'drawing_meta' and ps.can_edit_drawing_meta)
      )
  );
$$;

create or replace function can_write_drawing(p_drawing_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer
as $$
  select has_project_access(
    (select project_id from drawings where id = p_drawing_id), p_user_id, 'balloons'
  );
$$;
