-- IntelliDocs: Migration 037 — the editor's own JSON as a document's source of truth
--
-- `content` is HTML. Saving it means serialising the editor and loading means parsing it back, and
-- that round trip changed documents silently (table cell padding came back as a shorthand the
-- editor dropped, so a 31-page document reloaded at 34 pages). The editor's JSON keeps every node
-- and attribute exactly, so it is saved alongside the HTML and loaded in preference to it.
--
-- `content` is still written on every save: search, plagiarism, AI chat, word count and previews
-- read the HTML. The backend clears `content_json` whenever `content` is written without it (an
-- import, an older client, a restored pre-JSON version), so stale JSON can never win over newer HTML.
-- Existing documents need no backfill: they load from HTML once and gain JSON on their next save.

alter table public.documents
  add column if not exists content_json jsonb;

alter table public.document_versions
  add column if not exists content_json jsonb;

-- A document counts once against the user's storage: its JSON when it has one, else its HTML.
-- pg_column_size reads the stored (compressed) size without detoasting, as in migration 027.
create or replace function public.user_storage_bytes(p_user_id uuid)
returns bigint
language sql
stable
as $$
  select coalesce(sum(coalesce(pg_column_size(content_json), pg_column_size(content))), 0)::bigint
  from public.documents
  where user_id = p_user_id
    and is_deleted = false;
$$;
