-- On first login after an invite, give the vendor their OWN organization
-- (never membership in the inviting company's org) and grant them access to
-- the specific invited project via project_shares. A vendor who is invited by
-- several different client companies accumulates one project_shares row per
-- project, all against this same vendor org.
create or replace function handle_new_vendor_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite pending_invites%rowtype;
  v_vendor_org_id uuid;
begin
  select * into v_invite from pending_invites
   where email = new.email and status = 'pending'
   order by created_at desc
   limit 1;

  if v_invite.id is null then
    return new; -- not a vendor invite signup (e.g. a direct company signup); nothing to do here
  end if;

  select organization_id into v_vendor_org_id
    from organization_members om
    join organizations o on o.id = om.organization_id and o.kind = 'vendor'
   where om.user_id = new.id
   limit 1;

  if v_vendor_org_id is null then
    insert into organizations (name, kind)
    values (split_part(new.email, '@', 1) || '''s org', 'vendor')
    returning id into v_vendor_org_id;

    insert into organization_members (organization_id, user_id, role)
    values (v_vendor_org_id, new.id, 'owner');
  end if;

  if v_invite.project_id is not null then
    insert into project_shares (project_id, partner_org_id, can_create_balloons, can_edit_measurements, invited_by_user_id)
    values (
      v_invite.project_id,
      v_vendor_org_id,
      coalesce((v_invite.role_grants ->> 'can_create_balloons')::boolean, true),
      coalesce((v_invite.role_grants ->> 'can_edit_measurements')::boolean, true),
      v_invite.invited_by_user_id
    )
    on conflict (project_id, partner_org_id) do nothing;
  end if;

  update pending_invites set status = 'accepted' where id = v_invite.id;

  return new;
end;
$$;

create trigger on_auth_user_created_vendor
  after insert on auth.users
  for each row execute function handle_new_vendor_signup();
