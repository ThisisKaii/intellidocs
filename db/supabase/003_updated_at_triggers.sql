-- IntelliDocs: updated_at triggers for new tables

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- folders
drop trigger if exists trg_folders_updated_at on public.folders;
create trigger trg_folders_updated_at
before update on public.folders
for each row execute function public.set_updated_at();

-- folder_documents
drop trigger if exists trg_folder_documents_updated_at on public.folder_documents;
create trigger trg_folder_documents_updated_at
before update on public.folder_documents
for each row execute function public.set_updated_at();

-- formatting_actions
drop trigger if exists trg_formatting_actions_updated_at on public.formatting_actions;
create trigger trg_formatting_actions_updated_at
before update on public.formatting_actions
for each row execute function public.set_updated_at();

-- ai_suggestions
drop trigger if exists trg_ai_suggestions_updated_at on public.ai_suggestions;
create trigger trg_ai_suggestions_updated_at
before update on public.ai_suggestions
for each row execute function public.set_updated_at();

-- suggestion_feedback
drop trigger if exists trg_suggestion_feedback_updated_at on public.suggestion_feedback;
create trigger trg_suggestion_feedback_updated_at
before update on public.suggestion_feedback
for each row execute function public.set_updated_at();

-- grammar_issues
drop trigger if exists trg_grammar_issues_updated_at on public.grammar_issues;
create trigger trg_grammar_issues_updated_at
before update on public.grammar_issues
for each row execute function public.set_updated_at();
