-- Projects: owned by an organization (the company that created it).
-- Field names mirror the local IndexedDB project shape (src/lib/projectStore.js)
-- so the frontend sync layer needs minimal remapping.
create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_org_id uuid not null references organizations(id) on delete cascade,
  name text not null default 'Untitled Project',
  code text not null default '',
  owner text not null default '',
  estimated_delivery_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_projects_owner_org on projects(owner_org_id);
