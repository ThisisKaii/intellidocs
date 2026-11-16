-- IntelliDocs: Migration 049 — a tabbed document's text lives in its tabs only
--
-- Migration 048 kept the WHOLE body of a tabbed document in `documents.content`/`content_json` and
-- rebuilt it after every tab save. A 1,447-page thesis (13 MB of HTML, 27 MB of editor JSON) could
-- not be written that way: the rebuild ran past the statement timeout, and one 27 MB JSON write took
-- the database's gateway down. From now on:
--
--   * `documents.content` of a tabbed document is a skeleton: one empty marker per tab, in order
--       <div data-tab-break="" data-tab-id="…" data-title="…"></div>…
--     and `content_json` is null. The server writes it whenever tabs are added, moved or renamed and
--     reads the whole text from the tabs when it needs it (AI chat, originality checks, reviews).
--   * Versions of a tabbed document are kept per tab: `document_versions.tab_id` names the tab,
--     with its title and place then, so a deleted tab can be restored where it was.
--   * Storage counts each tab, since the document row no longer holds the text.
--
-- Safe to run before the new server is deployed: the two functions below are redefined so the
-- previous server writes skeletons too, and never records a skeleton as a whole-document version
-- (restoring one would empty every tab).

alter table public.document_versions add column if not exists tab_id uuid;
alter table public.document_versions add column if not exists tab_title text;
alter table public.document_versions add column if not exists tab_position integer;

create index if not exists idx_document_versions_document_tab
  on public.document_versions(document_id, tab_id, created_at desc);

-- The skeleton of a tabbed document (its markers in order), or null when it has no tabs.
create or replace function public.document_tab_skeleton(p_document_id uuid)
returns text
language sql
stable
as $$
  select string_agg(
    '<div data-tab-break="" data-tab-id="' || t.tab_id::text || '" data-title="' || public.html_attribute_escape(t.title) || '"></div>',
    '' order by t.position, t.created_at)
  from public.document_tabs t
  where t.document_id = p_document_id;
$$;

-- Migration 048's rebuild now writes only the skeleton.
create or replace function public.assemble_document_tabs(p_document_id uuid)
returns void
language sql
as $$
  update public.documents d
  set content = coalesce(public.document_tab_skeleton(p_document_id), d.content),
      content_json = case when public.document_tab_skeleton(p_document_id) is null then d.content_json else null end,
      updated_at = now()
  where d.id = p_document_id;
$$;

-- A whole-document version of a tabbed document would hold only its skeleton: none is taken.
create or replace function public.snapshot_document_version(
  p_document_id uuid,
  p_reason text,
  p_editor_prefs jsonb,
  p_word_count integer
)
returns void
language sql
as $$
  insert into public.document_versions
    (document_id, user_id, content, content_json, title, word_count, page_size, margins, orientation, editor_prefs, reason)
  select id, user_id, content, content_json, title, p_word_count, page_size, margins, orientation, p_editor_prefs, p_reason
  from public.documents
  where id = p_document_id
    and not exists (select 1 from public.document_tabs t where t.document_id = p_document_id);
$$;

-- Documents already split into tabs drop their whole-body copy for the skeleton.
update public.documents d
set content = s.skeleton,
    content_json = null
from (
  select t.document_id, public.document_tab_skeleton(t.document_id) as skeleton
  from public.document_tabs t
  group by t.document_id
) s
where d.id = s.document_id;

-- A user's storage: each document's own content (its JSON when it has one, else its HTML), plus the
-- tabs of tabbed documents. pg_column_size reads the stored (compressed) size, as in migration 037.
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
  )::bigint;
$$;
