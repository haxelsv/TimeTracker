-- Ejecutar una vez en el proyecto Supabase. Los datos de la app siguen protegidos por workspace.
insert into storage.buckets (id, name, public)
values ('client-logos', 'client-logos', true)
on conflict (id) do update set public = true;

drop policy if exists "Admins upload client logos" on storage.objects;
create policy "Admins upload client logos" on storage.objects
for insert to authenticated
with check (bucket_id = 'client-logos' and public.is_admin());

drop policy if exists "Admins update client logos" on storage.objects;
create policy "Admins update client logos" on storage.objects
for update to authenticated
using (bucket_id = 'client-logos' and public.is_admin())
with check (bucket_id = 'client-logos' and public.is_admin());

drop policy if exists "Admins delete client logos" on storage.objects;
create policy "Admins delete client logos" on storage.objects
for delete to authenticated
using (bucket_id = 'client-logos' and public.is_admin());
