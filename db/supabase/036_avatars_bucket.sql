-- Profile photos: one public bucket, one folder per user. The server uploads with the
-- service key and stores the public link in the user's auth metadata (avatar_url).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;
