alter table public.drawings
  add column unit_system text not null default 'metric'
  check (unit_system in ('metric', 'inch'));
