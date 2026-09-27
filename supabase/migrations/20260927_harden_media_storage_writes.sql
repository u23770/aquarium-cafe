-- Aquarium Cafe & Restaurant — harden media storage writes
-- 2026-09-27
--
-- Keep the media bucket publicly readable because customer pages use public URLs,
-- but restrict object mutation to authenticated admin staff.

drop policy if exists "media: public delete" on storage.objects;
drop policy if exists "media: public insert" on storage.objects;
drop policy if exists "media: public update" on storage.objects;
drop policy if exists "media: public read" on storage.objects;

create policy "media: public read"
on storage.objects for select
to public
using (bucket_id = 'media');

create policy "media: admin insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'media' and (select public.is_admin()));

create policy "media: admin update"
on storage.objects for update
to authenticated
using (bucket_id = 'media' and (select public.is_admin()))
with check (bucket_id = 'media' and (select public.is_admin()));

create policy "media: admin delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'media' and (select public.is_admin()));
