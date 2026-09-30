-- IntelliDocs: Migration 022 — Professor class folders vs. personal folders
--
-- A professor's drive previously mixed two very different things: their own
-- working folders and the folders they hand to a class. This adds an explicit
-- `folder_type` discriminator, optional course metadata, and an enrollment
-- table so a class folder can be opened to specific students.
--
-- Access rules after this migration:
--   - personal folder  -> owner only (unchanged)
--   - class folder     -> owner (full control) + enrolled students (read the
--                         folder, read its documents, submit into it)
--
-- Re-runnable: every statement is guarded (IF NOT EXISTS / DROP + CREATE).

-- 1) Folder type + optional course metadata
--    Existing rows were all personal workspaces, so the default is correct.
alter table public.folders
  add column if not exists folder_type text not null default 'personal';

alter table public.folders
  add column if not exists class_code text;

alter table public.folders
  add column if not exists academic_term text;

-- Constrain the discriminator to the two values the app understands. Added
-- separately from the column so a re-run on an existing table still installs
-- the constraint after the column already exists.
alter table public.folders
  drop constraint if exists folders_folder_type_check;

alter table public.folders
  add constraint folders_folder_type_check
  check (folder_type in ('personal', 'class'));

-- 2) Class enrollments (class owner -> student)
create table if not exists public.class_enrollments (
  folder_id uuid not null references public.folders(folder_id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  enrolled_at timestamptz default now(),
  primary key (folder_id, student_id)
);

create index if not exists idx_class_enrollments_student_id
  on public.class_enrollments(student_id);

create index if not exists idx_class_enrollments_folder_id
  on public.class_enrollments(folder_id);

-- 3) Lookup indexes for the class-folder views
create index if not exists idx_folders_class_type
  on public.folders(folder_type)
  where folder_type = 'class';

create index if not exists idx_folders_class_code
  on public.folders(class_code)
  where class_code is not null;

-- 4) Helper: is the calling user enrolled in this class folder?
--    SECURITY DEFINER so it can read class_enrollments without re-entering RLS.
create or replace function public.is_class_member(p_folder_id uuid)
returns boolean as $$
begin
  return exists (
    select 1
    from public.class_enrollments ce
    where ce.folder_id = p_folder_id
      and ce.student_id = auth.uid()
  );
end;
$$ language plpgsql security definer;

-- 5) Helper: may the calling user see this folder at all?
create or replace function public.can_read_folder(p_folder_id uuid)
returns boolean as $$
begin
  return exists (
    select 1
    from public.folders f
    where f.folder_id = p_folder_id
      and (f.user_id = auth.uid() or public.is_class_member(f.folder_id))
  );
end;
$$ language plpgsql security definer;

-- 6) Enrollment RLS
--    The owner manages the roster; a student can read their own row.
alter table public.class_enrollments enable row level security;

drop policy if exists "Class owners manage enrollments" on public.class_enrollments;
create policy "Class owners manage enrollments" on public.class_enrollments for all
  using (
    exists (
      select 1 from public.folders f
      where f.folder_id = class_enrollments.folder_id
        and f.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.folders f
      where f.folder_id = class_enrollments.folder_id
        and f.user_id = auth.uid()
    )
  );

drop policy if exists "Students read own enrollments" on public.class_enrollments;
create policy "Students read own enrollments" on public.class_enrollments for select
  using (student_id = auth.uid());

-- 7) Folder RLS — widen SELECT to enrolled students, keep writes owner-only
drop policy if exists "Users can read their own folders" on public.folders;
create policy "Users can read their own folders" on public.folders for select
  using (auth.uid() = user_id or public.is_class_member(folder_id));

-- 8) Folder documents RLS — enrolled students read a class folder's contents
--    and may submit into it; updates and deletes stay owner-only.
drop policy if exists "Users can read their own folder documents" on public.folder_documents;
create policy "Users can read their own folder documents" on public.folder_documents for select
  using (public.can_read_folder(folder_id));

drop policy if exists "Users can insert their own folder documents" on public.folder_documents;
create policy "Users can insert their own folder documents" on public.folder_documents for insert
  with check (public.can_read_folder(folder_id));
