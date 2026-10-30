-- Onboarding a new company creates an organization and its first owner
-- membership in one atomic step. A plain client-side insert() can't do this:
-- the org_select RLS policy checks is_org_member() on the RETURNING row, but
-- membership doesn't exist until the second insert, so the returning insert
-- gets rejected as an RLS violation even though the row was created.
create or replace function create_company_organization(org_name text)
returns organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org organizations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated';
  end if;

  insert into organizations (name, kind)
  values (org_name, 'company')
  returning * into v_org;

  insert into organization_members (organization_id, user_id, role)
  values (v_org.id, auth.uid(), 'owner');

  return v_org;
end;
$$;

grant execute on function create_company_organization(text) to authenticated;
