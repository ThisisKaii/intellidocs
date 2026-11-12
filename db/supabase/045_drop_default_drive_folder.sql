-- Migration 045: stop creating a default "My Drive" folder for new users
--
-- Migration 0004 added a trigger that inserted a root folder named "My Drive" for
-- every new account. Documents live in the user's drive root already, so the
-- folder was an empty extra level. New accounts no longer get one, and empty
-- "My Drive" folders that the trigger created are removed. A "My Drive" folder a
-- user has put documents or sub-folders into is kept and can now be renamed or
-- deleted like any other folder.

drop trigger if exists trg_create_default_drive_folder on auth.users;
drop function if exists public.create_default_drive_folder();

delete from public.folders f
where f.name = 'My Drive'
  and f.parent_id is null
  and coalesce(f.folder_type, 'personal') = 'personal'
  and not exists (select 1 from public.folder_documents fd where fd.folder_id = f.folder_id)
  and not exists (select 1 from public.folders c where c.parent_id = f.folder_id);
