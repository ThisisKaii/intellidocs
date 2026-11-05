-- IntelliDocs: Migration 040 — mock Pro subscription state
--
-- A demo SaaS flow: no payment provider is involved and no card data is stored. `plan = 'pro'`
-- lifts the storage quota on the server. Cancelling keeps Pro until `plan_renews_at`.
-- Re-runnable: every statement is guarded.

alter table public.user_profiles add column if not exists plan text not null default 'free';
alter table public.user_profiles add column if not exists plan_started_at timestamptz;
alter table public.user_profiles add column if not exists plan_renews_at timestamptz;
alter table public.user_profiles add column if not exists plan_canceled_at timestamptz;

do $$ begin
  alter table public.user_profiles
    add constraint user_profiles_plan_check check (plan in ('free', 'pro'));
exception when duplicate_object then null; end $$;

-- Plan columns join the privileged set guarded by migration 039's trigger.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if new.role_id is distinct from old.role_id
       or new.verification_status is distinct from old.verification_status
       or new.requested_role is distinct from old.requested_role
       or new.plan is distinct from old.plan
       or new.plan_started_at is distinct from old.plan_started_at
       or new.plan_renews_at is distinct from old.plan_renews_at
       or new.plan_canceled_at is distinct from old.plan_canceled_at then
      raise exception 'privileged profile columns can only be changed by the server';
    end if;
  end if;
  return new;
end;
$$;
