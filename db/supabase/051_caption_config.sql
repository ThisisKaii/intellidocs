-- IntelliDocs: Migration 051 — a document's own caption settings
--
-- Captions follow the document's preset (IEEE: "Fig. 1." 8pt below figures, "TABLE I" above
-- tables; APA 7th: bold "Figure 1" above, italic title on the next line). Page Setup → Captions
-- lets a document set its own: placement, label, separator, size, bold label, italic text and
-- alignment, per figure and table. Null means "follow the preset". The server validates the shape
-- (documentSchemas.captionConfigSchema); without this column the setting is simply not saved.

alter table public.documents
  add column if not exists caption_config jsonb;
