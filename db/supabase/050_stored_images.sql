-- IntelliDocs: Migration 050 — pictures count toward a user's storage
--
-- Storage used to count only document text. A 1,447-page thesis is 13 MB of text and 200 MB of
-- pictures, so pictures were the real cost and were free. Every stored picture now has a row here:
-- where it lives (the Supabase bucket or Cloudflare R2), whose it is, which document it belongs to
-- and its size. `user_storage_bytes` adds the pictures of the user's documents that are not in the
-- trash, plus pictures not tied to a document (editor uploads, older imports).
--
-- Deleting a document for good removes its pictures (the server deletes the files first, then the
-- rows go with the document). Existing pictures in the `document-images` bucket are backfilled
-- below without a document.

create table if not exists public.stored_images (
  path text primary key,                                   -- object key: <user id>/<uuid>.<ext>
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  bytes bigint not null default 0,
  backend text not null default 'supabase' check (backend in ('supabase', 'r2')),
  created_at timestamptz not null default now()
);

create index if not exists idx_stored_images_user on public.stored_images(user_id);
create index if not exists idx_stored_images_document on public.stored_images(document_id);

-- Only the server (service key) reads or writes this table.
alter table public.stored_images enable row level security;

-- Pictures already in the bucket: counted for their owner (the first folder of the path).
insert into public.stored_images (path, user_id, bytes, backend)
select o.name, u.id, coalesce((o.metadata ->> 'size')::bigint, 0), 'supabase'
from storage.objects o
join auth.users u on u.id::text = split_part(o.name, '/', 1)
where o.bucket_id = 'document-images'
on conflict (path) do nothing;

-- A user's storage: document text (as in migration 049, tabs included) plus pictures.
create or replace function public.user_storage_bytes(p_user_id uuid)
returns bigint
language sql
stable
as $$
  select (
    coalesce((
      select sum(coalesce(pg_column_size(d.content_json), pg_column_size(d.content)))
      from public.documents d
      where d.user_id = p_user_id and d.is_deleted = false
    ), 0)
    + coalesce((
      select sum(coalesce(pg_column_size(t.content_json), pg_column_size(t.content)))
      from public.document_tabs t
      join public.documents d on d.id = t.document_id
      where d.user_id = p_user_id and d.is_deleted = false
    ), 0)
    + coalesce((
      select sum(i.bytes)
      from public.stored_images i
      left join public.documents d on d.id = i.document_id
      where i.user_id = p_user_id and (i.document_id is null or d.is_deleted = false)
    ), 0)
  )::bigint;
$$;
