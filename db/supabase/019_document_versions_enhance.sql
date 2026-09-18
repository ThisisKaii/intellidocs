-- Migration 019: enrich document version snapshots (plan point 22)
-- Adds sequential version numbering and word counts used by the history
-- timeline and the visual diff comparator (plan point 23).

alter table public.document_versions
  add column if not exists version_number integer;

alter table public.document_versions
  add column if not exists word_count integer;

-- Number historical rows that predate this migration in chronological order.
update public.document_versions
set version_number = seq.seq
from (
  select version_id, row_number() over (
    partition by document_id
    order by created_at asc
  ) as seq
  from public.document_versions
) as seq
where public.document_versions.version_id = seq.version_id
  and public.document_versions.version_number is null;

-- Keep numbering consistent for every new snapshot going forward.
create or replace function public.set_version_number()
returns trigger
language plpgsql
as $$
declare
  next_number integer;
begin
  select coalesce(max(version_number), 0) + 1
  into next_number
  from public.document_versions
  where document_id = new.document_id;

  new.version_number := next_number;
  return new;
end;
$$;

drop trigger if exists trg_document_versions_number on public.document_versions;
create trigger trg_document_versions_number
before insert on public.document_versions
for each row
execute function public.set_version_number();