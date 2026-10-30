-- Private bucket for cloud-project PDFs. Objects are stored at
-- '{project_id}/{drawing_id}.pdf' so access can be checked by parsing the
-- project_id out of the object path and reusing has_project_access().
insert into storage.buckets (id, name, public)
values ('drawings', 'drawings', false)
on conflict (id) do nothing;

create or replace function storage_path_project_id(p_object_name text)
returns uuid
language sql immutable
as $$
  select nullif(split_part(p_object_name, '/', 1), '')::uuid;
$$;

create policy drawings_bucket_select on storage.objects for select
  using (
    bucket_id = 'drawings'
    and has_project_access(storage_path_project_id(name), auth.uid())
  );

create policy drawings_bucket_insert on storage.objects for insert
  with check (
    bucket_id = 'drawings'
    and has_project_access(storage_path_project_id(name), auth.uid(), 'drawing_meta')
  );

create policy drawings_bucket_update on storage.objects for update
  using (
    bucket_id = 'drawings'
    and has_project_access(storage_path_project_id(name), auth.uid(), 'drawing_meta')
  );

create policy drawings_bucket_delete on storage.objects for delete
  using (
    bucket_id = 'drawings'
    and has_project_access(storage_path_project_id(name), auth.uid(), 'drawing_meta')
  );
