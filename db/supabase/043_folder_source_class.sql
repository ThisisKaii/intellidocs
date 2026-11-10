-- Migration 043: remember which class a student's folder came from
--
-- When a professor deletes a class, the folders students kept inside it (their
-- workspace and submission folders) stay with the students and move to their
-- top level. This column records the class they came from, so the app can label
-- them "Class document · from <class>". Null for every other folder.

alter table public.folders
  add column if not exists source_class_name text;
