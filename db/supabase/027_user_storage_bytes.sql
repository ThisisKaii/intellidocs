-- Storage used by one user's active documents, computed inside the database.
-- The server used to download every document's full content just to add up its
-- length, which burned disk IO and timed out on larger accounts.
-- pg_column_size reads the stored (compressed) size from the row header without
-- detoasting the content, so it costs almost no disk IO.
create or replace function public.user_storage_bytes(p_user_id uuid)
returns bigint
language sql
stable
as $$
  select coalesce(sum(pg_column_size(content)), 0)::bigint
  from public.documents
  where user_id = p_user_id
    and is_deleted = false;
$$;
