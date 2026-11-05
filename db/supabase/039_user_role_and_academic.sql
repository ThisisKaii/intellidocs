-- IntelliDocs: Migration 039 — baseline `user` role and academic verification
--
-- New accounts start as `user` (baseline quota) and apply for `student` or `professor`.
-- Existing student rows are left as they are.
-- Re-runnable: every statement is guarded.

-- 1) The baseline role. Its id is pinned to 4 because the frontend admin role picker maps names to ids.
insert into public.roles (role_id, role_name) values (4, 'user')
on conflict do nothing;
select setval(pg_get_serial_sequence('public.roles', 'role_id'),
              greatest((select max(role_id) from public.roles), 1));

alter table public.user_profiles alter column role_id set default 4;

-- 2) Student applications keep their ID in its own column instead of `phone`.
alter table public.user_profiles add column if not exists student_id varchar(50);

-- 3) Users may update their own profile row (display name, phone), but never the columns that
--    grant privileges. The Express server writes those with the service role, which bypasses this.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if new.role_id is distinct from old.role_id
       or new.verification_status is distinct from old.verification_status
       or new.requested_role is distinct from old.requested_role then
      raise exception 'privileged profile columns can only be changed by the server';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_privileged_columns on public.user_profiles;
create trigger trg_protect_profile_privileged_columns
  before update on public.user_profiles
  for each row execute function public.protect_profile_privileged_columns();
