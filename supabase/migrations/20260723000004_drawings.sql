-- Drawings mirror the local IndexedDB drawing shape (src/lib/projectStore.js
-- normalizeDrawing). PDF bytes live in Supabase Storage, not in this table --
-- pdf_storage_path points at the object (bucket 'drawings', path
-- '{project_id}/{drawing_id}.pdf').
create table drawings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null default 'Untitled Drawing',
  pdf_name text not null default '',
  pdf_byte_length bigint not null default 0,
  pdf_storage_path text,
  page_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  tolerance_overrides jsonb not null default '{"linear":{},"angle":{}}'::jsonb,
  sample_count integer not null default 5,
  page_number integer not null default 1,
  zoom numeric not null default 1,
  status text not null default 'OPEN' check (status in ('OPEN', 'PASS', 'FAIL')),
  -- Server-authoritative balloon numbering counter (see allocate_balloon_no RPC).
  balloon_seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_drawings_project on drawings(project_id);
