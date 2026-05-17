-- IntelliDocs: create default "My Drive" folder on user signup

create or replace function public.create_default_drive_folder()
returns trigger as $$
begin
  insert into public.folders (user_id, name, parent_id)
  values (new.id, 'My Drive', null);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_create_default_drive_folder on auth.users;

create trigger trg_create_default_drive_folder
after insert on auth.users
for each row execute function public.create_default_drive_folder();
