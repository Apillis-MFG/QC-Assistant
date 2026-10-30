-- Organizations: both "company" and "vendor" accounts are organizations.
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('company', 'vendor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')) default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index idx_org_members_user on organization_members(user_id);
