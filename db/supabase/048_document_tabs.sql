-- IntelliDocs: Migration 048 — document tabs (one document, a tab per chapter)
--
-- A long manuscript can be split into tabs (Front matter, Chapter 1 … N, References), like Google
-- Docs tabs, so only one chapter is open in the editor at a time. It stays ONE document:
--
--   * `document_tabs` holds each tab's working copy (HTML + editor JSON). The editor saves one tab.
--   * `documents.content` / `content_json` keep the WHOLE document, rebuilt from the tabs after every
--     tab save by `assemble_document_tabs`, so search, plagiarism, AI chat, exports, previews, the
--     storage quota and version history keep reading one body.
--   * Tab boundaries are written into that body as an empty marker block before each tab:
--       HTML  <div data-tab-break="" data-tab-id="…" data-title="…"></div>
--       JSON  {"type":"tabBreak","attrs":{"tabId":"…","title":"…"}}
--     They add no text. A version snapshot therefore carries its tabs, and restoring it re-splits.
--
-- A document without tabs has no rows here and is stored exactly as before.

create table if not exists public.document_tabs (
  tab_id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  position integer not null default 0,
  title text not null default 'Untitled tab',
  content text not null default '',
  content_json jsonb,
  -- Measured by the editor when the tab was last laid out, so other tabs know where their pages start.
  page_count integer not null default 0,
  word_count integer not null default 0,
  -- {format: none|roman|arabic, restart: bool, start: int, hideFirst: bool}; null = continue the previous tab.
  numbering jsonb,
  -- Figure/table counts and the chapter the tab ends in, so numbering continues in the next tab.
  caption_counts jsonb,
  -- Headings with their page numbers, for a table of contents built across tabs.
  outline jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_document_tabs_document_position
  on public.document_tabs(document_id, position);

alter table public.document_tabs enable row level security;

-- The server uses the service key; these keep direct client access to the owner only.
drop policy if exists "Owners can read their document tabs" on public.document_tabs;
create policy "Owners can read their document tabs"
  on public.document_tabs for select
  using (exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid()));

drop policy if exists "Owners can change their document tabs" on public.document_tabs;
create policy "Owners can change their document tabs"
  on public.document_tabs for all
  using (exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid()));

-- Escape text for an HTML attribute value (the marker's title).
create or replace function public.html_attribute_escape(p_text text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(replace(coalesce(p_text, ''), '&', '&amp;'), '"', '&quot;'), '<', '&lt;'), '>', '&gt;');
$$;

-- Rebuild a document's whole body from its tabs, in the database (no multi-megabyte round trip).
-- The editor JSON is rebuilt only when every tab has one; otherwise it is cleared so the HTML loads.
create or replace function public.assemble_document_tabs(p_document_id uuid)
returns void
language sql
as $$
  update public.documents d
  set
    content = coalesce((
      select string_agg(
        '<div data-tab-break="" data-tab-id="' || t.tab_id::text || '" data-title="' || public.html_attribute_escape(t.title) || '"></div>' || t.content,
        '' order by t.position, t.created_at)
      from public.document_tabs t
      where t.document_id = p_document_id
    ), d.content),
    content_json = (
      select case
        when count(*) = 0 then d.content_json
        when bool_and(t.content_json is not null) then (
          select jsonb_build_object('type', 'doc', 'content', coalesce(jsonb_agg(part.node order by part.position, part.created_at, part.ord), '[]'::jsonb))
          from (
            select t2.position, t2.created_at, 0::bigint as ord,
                   jsonb_build_object('type', 'tabBreak', 'attrs', jsonb_build_object('tabId', t2.tab_id::text, 'title', t2.title)) as node
            from public.document_tabs t2
            where t2.document_id = p_document_id
            union all
            select t2.position, t2.created_at, e.ord, e.node
            from public.document_tabs t2,
                 jsonb_array_elements(coalesce(t2.content_json -> 'content', '[]'::jsonb)) with ordinality as e(node, ord)
            where t2.document_id = p_document_id
          ) part
        )
        else null
      end
      from public.document_tabs t
      where t.document_id = p_document_id
    ),
    updated_at = now()
  where d.id = p_document_id;
$$;

-- Snapshot the document's current (assembled) state as a version, copying the body inside the
-- database. The caller throttles snapshots and supplies the format snapshot and word count.
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
  where id = p_document_id;
$$;
