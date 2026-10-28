-- Migration 035: short share codes for collaboration
--
-- A document's share link can also carry a short code (8 characters, for example
-- K7M2-QX9P). A collaborator types the code under "Shared with me" and the document
-- is added to their shared list with the link's permission. The code lives and dies
-- with the link: it is minted with it, kept when its permission or expiry changes,
-- and cleared when the link is revoked. Stored without the dash, upper case.

alter table public.documents
  add column if not exists share_code text;

create unique index if not exists idx_documents_share_code
  on public.documents(share_code) where (share_code is not null);
