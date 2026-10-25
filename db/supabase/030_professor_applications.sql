-- IntelliDocs: Migration 030 — professor application tracking and plagiarism scan scope.
-- Re-runnable: every statement is guarded.

-- 1) The role an applicant asked for stays separate from the role they hold, so a
--    pending or rejected applicant never gets professor privileges early.
alter table public.user_profiles add column if not exists requested_role text;
alter table public.user_profiles add column if not exists faculty_id varchar(50);
alter table public.user_profiles add column if not exists decision_note text;
alter table public.user_profiles add column if not exists decided_at timestamptz;
alter table public.user_profiles add column if not exists decided_by uuid references auth.users(id) on delete set null;

-- 2) Plagiarism scans remember whether they compared one class or all of a professor's classes.
alter table public.plagiarism_scans add column if not exists scope text not null default 'local';
alter table public.plagiarism_matches add column if not exists matched_folder_id uuid references public.folders(folder_id) on delete set null;

-- 3) Class folders get a private join code (the class_code column is only the public course label).
alter table public.folders add column if not exists join_code varchar(12);
create unique index if not exists idx_folders_join_code on public.folders (upper(join_code)) where join_code is not null;
