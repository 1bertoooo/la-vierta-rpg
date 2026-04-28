-- Migration 0008: Bucket de retratos gerados (gpt-image-1)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portraits', 'portraits', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

drop policy if exists "portraits_select" on storage.objects;
drop policy if exists "portraits_insert" on storage.objects;
drop policy if exists "portraits_update" on storage.objects;

create policy "portraits_select" on storage.objects for select
  to anon, authenticated using (bucket_id = 'portraits');
create policy "portraits_insert" on storage.objects for insert
  to anon, authenticated with check (bucket_id = 'portraits');
create policy "portraits_update" on storage.objects for update
  to anon, authenticated using (bucket_id = 'portraits') with check (bucket_id = 'portraits');
