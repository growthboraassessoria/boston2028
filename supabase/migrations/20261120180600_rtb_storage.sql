-- BORA Road to Boston 2028 · 7/8 · Storage
-- rtb-public: mídia aprovada (fotos licenciadas, logos autorizados, imagens de benefícios). Leitura pública.
-- rtb-private: comprovantes, avatares e documentos de parceiros. Caminho escopado: users/<uid>/...
-- O app sobe arquivos pelo servidor (depois de validar tipo real e tamanho); as políticas abaixo são a segunda trava.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('rtb-public', 'rtb-public', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']),
  ('rtb-private', 'rtb-private', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists rtb_public_read on storage.objects;
create policy rtb_public_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'rtb-public');

drop policy if exists rtb_public_write on storage.objects;
create policy rtb_public_write on storage.objects for insert to authenticated
  with check (bucket_id = 'rtb-public' and (storage.foldername(name))[1] in ('media', 'partners', 'benefits')
    and rtb.has_any_role(array['super_admin', 'growth']));

drop policy if exists rtb_public_delete on storage.objects;
create policy rtb_public_delete on storage.objects for delete to authenticated
  using (bucket_id = 'rtb-public' and rtb.has_any_role(array['super_admin', 'growth']));

drop policy if exists rtb_private_owner_read on storage.objects;
create policy rtb_private_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'rtb-private' and (storage.foldername(name))[1] = 'users'
    and ((storage.foldername(name))[2] = (select auth.uid())::text
         or rtb.has_role('technical_director')
         or case when (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
                 then rtb.is_assigned_coach(((storage.foldername(name))[2])::uuid) else false end));

drop policy if exists rtb_private_owner_write on storage.objects;
create policy rtb_private_owner_write on storage.objects for insert to authenticated
  with check (bucket_id = 'rtb-private' and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (storage.foldername(name))[3] in ('docs', 'avatar'));

drop policy if exists rtb_private_partner_docs on storage.objects;
create policy rtb_private_partner_docs on storage.objects for all to authenticated
  using (bucket_id = 'rtb-private' and (storage.foldername(name))[1] in ('partners', 'media-licenses')
    and rtb.has_any_role(array['super_admin', 'growth']))
  with check (bucket_id = 'rtb-private' and (storage.foldername(name))[1] in ('partners', 'media-licenses')
    and rtb.has_any_role(array['super_admin', 'growth']));

commit;
