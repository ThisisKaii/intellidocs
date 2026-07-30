-- IntelliDocs: Migration 008 — Admin Role Support & Block-Level Unique Identifiers
-- Adds verification_status to user_profiles, block_id tracking, and Admin RLS policies

-- 1) USER PROFILES: Verification Status for Professors
alter table public.user_profiles
add column if not exists verification_status text not null default 'approved'
check (verification_status in ('pending', 'approved', 'rejected'));

-- 2) BLOCK-LEVEL UNIQUE IDENTIFIERS TRACKING
alter table public.formatting_actions
add column if not exists block_id text;

alter table public.ai_suggestions
add column if not exists block_id text;

-- 3) ADMIN RLS POLICIES
-- Admin helper function checking if current user is an admin
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

-- Admin policies on user_profiles
create policy "Admins can view all user profiles" on public.user_profiles for select
  using (public.is_admin());

create policy "Admins can update all user profiles" on public.user_profiles for update
  using (public.is_admin());

-- Admin policies on documents (Moderation)
create policy "Admins can view all documents" on public.documents for select
  using (public.is_admin());

create policy "Admins can update all documents" on public.documents for update
  using (public.is_admin());

create policy "Admins can delete any document" on public.documents for delete
  using (public.is_admin());

-- Admin policies on reports (System-wide Analytics)
create policy "Admins can view all reports" on public.reports for select
  using (public.is_admin());

-- Admin policies on document_reviews & comments
create policy "Admins can view all document reviews" on public.document_reviews for select
  using (public.is_admin());

create policy "Admins can update all document reviews" on public.document_reviews for update
  using (public.is_admin());

create policy "Admins can view all document comments" on public.document_comments for select
  using (public.is_admin());
