-- Header/footer art, per-section headers and page numbering that an imported
-- Word document carries beyond the plain header/footer text columns.
-- Shape: { sections: [...], parts: { key: { flow, art } }, repeat_art, page_art }

alter table public.documents
  add column if not exists page_layout jsonb;
