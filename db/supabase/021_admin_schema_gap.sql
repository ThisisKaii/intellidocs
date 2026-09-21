-- IntelliDocs: Migration 021 — Admin role support gap (008 only)
--
-- Earlier probing assumed some tables were missing; they were not (the probe
-- used the wrong PK column names). The deployed DB only lacks the piece that
-- migration 008 introduced: user_profiles.verification_status + the admin
-- RLS function/policies. Those break every /admin endpoint:
--   - getAllUsers selects verification_status          -> 500 /admin/users
--   - getPendingProfessorApplicants filters on it      -> 500 /admin/professors/pending
--   - getSystemReports / exportEmpirical count on it   -> 500 /admin/reports, /export-empirical
--
-- Re-runnable: every statement is guarded (IF NOT EXISTS / DROP + CREATE).

-- 1) Verification status for professor applicants
alter table public.user_profiles
add column if not exists verification_status text not null default 'approved'
check (verification_status in ('pending', 'approved', 'rejected'));

-- 2) Admin helper: is the calling user an admin?
  create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1
    from public.user_profiles up
    join public.roles r on up.role_id = r.role_id
    where up.user_id = auth.uid()
      and r.role_name = 'admin'
  );
end;
$$ language plpgsql security definer;

-- 3) Admin RLS policies (drop-first so the script is safe to re-run)
drop policy if exists "Admins can view all user profiles" on public.user_profiles;
create policy "Admins can view all user profiles" on public.user_profiles for select
  using (public.is_admin());  

drop policy if exists "Admins can update all user profiles" on public.user_profiles;
create policy "Admins can update all user profiles" on public.user_profiles for update
  using (public.is_admin());

drop policy if exists "Admins can view all documents" on public.documents;
create policy "Admins can view all documents" on public.documents for select
  using (public.is_admin());

drop policy if exists "Admins can update all documents" on public.documents;
create policy "Admins can update all documents" on public.documents for update
  using (public.is_admin());

drop policy if exists "Admins can delete any document" on public.documents;
create policy "Admins can delete any document" on public.documents for delete
  using (public.is_admin());

drop policy if exists "Admins can view all reports" on public.reports;
create policy "Admins can view all reports" on public.reports for select
  using (public.is_admin());

drop policy if exists "Admins can view all document reviews" on public.document_reviews;
create policy "Admins can view all document reviews" on public.document_reviews for select
  using (public.is_admin());

drop policy if exists "Admins can update all document reviews" on public.document_reviews;
create policy "Admins can update all document reviews" on public.document_reviews for update
  using (public.is_admin());

drop policy if exists "Admins can view all document comments" on public.document_comments;
create policy "Admins can view all document comments" on public.document_comments for select
  using (public.is_admin());