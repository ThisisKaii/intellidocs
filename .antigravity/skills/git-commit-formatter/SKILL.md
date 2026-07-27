---
name: git-commit-formatter
description: Use when staging and committing changes to the IntelliDocs repository. Enforces consistent, scoped commit messages across the frontend/server/ml services.
---

# Git Commit Formatting Standards for IntelliDocs

This skill defines the commit message conventions for the IntelliDocs codebase.

## Commit Message Format

```text
<scope>: <short description in imperative mood>

[optional body explaining context or breaking changes]
```

## Scopes
- `frontend`: React app, Vite config, Shadcn components, custom editor, CSS styling
- `server`: Express backend, routes, controllers, models, middleware, MCP tools
- `ml`: Python FastAPI service, model training (RF/LSTM), preprocessing, grammar/spelling
- `db`: Supabase SQL migrations, DuckDB schemas, DBML definitions
- `docs`: README, SETUP, AGENTS, architecture diagrams, research notes
- `config`: Environment variables, root configuration, git attributes, gitignore
- `tests`: Jest API tests, pytest scripts, test fixtures
- `scripts`: PowerShell or Bash startup scripts, utility scripts

## Rules & Conventions
1. **Imperative Mood**: Use "add", "fix", "update", "refactor" (not "added", "fixing", "updates").
2. **Lowercase Scope**: Always lowercase scope prefix followed by a colon and space (e.g., `server: ...`).
3. **Subject Line Length**: Keep under 72 characters.
4. **No Period**: Do not end the subject line with a period.
5. **Atomic Commits**: Group related changes per scope. Do not mix unrelated frontend and ML changes in a single commit unless doing a full cross-cutting feature slice.

## Examples
- `server: fix auth middleware token validation`
- `ml: add lstm trainer for sequence modeling`
- `frontend: update toolbar hover states`
- `db: add professor role and grading migration`
- `docs: update README with research goals and setup guide`
- `config: add windows line ending rules to gitattributes`

## Anti-patterns to Avoid
- ❌ `WIP` or `updates`
- ❌ `Fixed bug in server` (capitalized, past tense)
- ❌ `frontend and backend changes` (unscoped / vague)
