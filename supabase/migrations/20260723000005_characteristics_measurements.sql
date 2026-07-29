-- Characteristics ("balloons"). tolerance stays jsonb since its shape varies
-- (linear +/-, angle, profile, etc.) and it's read/written wholesale, never
-- incrementally, so it doesn't need row-level realtime granularity.
create table characteristics (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null references drawings(id) on delete cascade,
  balloon_no integer not null,
  page integer not null default 1,
  x numeric not null,
  y numeric not null,
  target_x numeric,
  target_y numeric,
  type text,
  unit text,
  nominal text,
  tolerance jsonb,
  method text,
  notes text not null default '',
  created_by_org_id uuid references organizations(id),
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (drawing_id, balloon_no)
);

create index idx_characteristics_drawing on characteristics(drawing_id);

-- Measurements are normalized (one row per characteristic x sample index)
-- rather than a jsonb blob on characteristics, so that:
--  - Realtime emits a tight per-cell change event instead of rewriting/
--    rebroadcasting the whole characteristic row on every sample fill.
--  - "Which vendor edited which sample" is a native column, not an ad hoc
--    parallel audit map inside jsonb.
create table measurements (
  characteristic_id uuid not null references characteristics(id) on delete cascade,
  sample_index integer not null,
  value text,
  edited_by_org_id uuid references organizations(id),
  edited_by_user_id uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (characteristic_id, sample_index)
);

create index idx_measurements_characteristic on measurements(characteristic_id);
