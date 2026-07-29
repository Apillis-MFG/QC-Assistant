-- Project shares: the core org-to-org sharing primitive. A vendor org gets one
-- row per client project it has been invited into -- it never becomes a member
-- of the owning company's organization.
create table project_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  partner_org_id uuid not null references organizations(id) on delete cascade,
  can_create_balloons boolean not null default true,
  can_edit_measurements boolean not null default true,
  can_edit_drawing_meta boolean not null default false,
  invited_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (project_id, partner_org_id)
);

create index idx_project_shares_partner_org on project_shares(partner_org_id);
create index idx_project_shares_project on project_shares(project_id);

-- Records an invite intent before the invited user has an auth.users row yet,
-- so acceptance doesn't depend solely on parsing JWT metadata.
create table pending_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invited_org_id uuid not null references organizations(id),
  project_id uuid references projects(id),
  role_grants jsonb not null default '{"can_create_balloons":true,"can_edit_measurements":true}'::jsonb,
  invited_by_user_id uuid references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  created_at timestamptz not null default now()
);

create index idx_pending_invites_email on pending_invites(email);
