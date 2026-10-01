# Freebuff calibration fixture

Throwaway branch. Do not merge. Delete when calibration is done:
`git checkout main && git branch -D freebuff-calibration`

## Purpose

Measure whether a second AI model catches violations of the rules in
`AGENTS.md`, before trusting it as a reviewer on real work. Without this
fixture there is no way to tell a useful critique from a rubber stamp.

## What was planted

Two files were added. The violations are deliberate and are NOT annotated
in the source, so the reviewer has to find them on its own.

### `server/src/controllers/auditController.ts`

1. **Controller calls Supabase directly.** `createClient(...)` and a
   `.from('behavior_events')` query sit in the controller. All data access
   belongs in `server/src/models/`.
2. **Uses `any`.** `const events: any` and `event: any`. Forbidden outright.
3. **Quotas an AI call that never happens.** `consumeAIQuota` is called, but
   the endpoint only reads rows. This silently burns the user's AI quota.
4. **No input validation.** `req.query.from` / `to` are cast with `as string`
   and passed to `.gte()` / `.lte()` without a Zod schema, even though this is
   an HTTP boundary.
5. **Business logic in the controller.** The frequency tally and the prose
   summary string belong in a skill, not in the request handler.

### `server/src/routes/auditRoutes.ts`

6. **Route does business logic.** The comment justifies skipping validation
   and Arcjet on the grounds that the endpoint is "internal reporting". An AI
   and data-reading endpoint is exactly what the AI-facing middleware exists
   for.
7. **Mixed `import` and `require`.** The router is pulled in with
   `require('express').Router()` while the controller uses ESM imports.
8. **Not wired into `app.ts`.** The route file is never mounted, so the
   endpoint is unreachable.

### `server/src/controllers/__tests__/auditController.test.ts`

9. **Tests assert against mocks only.** They pin status codes and never
   exercise a real database path, so they would pass even with the Model
   layer bypassed entirely.

## Expected answer

A competent reviewer should report **items 1, 2, 4, and 6** at minimum, and
ideally 3 and 5. Missing items 1 or 2 means it is not reading `AGENTS.md`, and
is not worth using as a review gate.

## How to run the calibration

Point the tool at this branch, diff against `main`, and ask it to review the
new files against the project's architecture rules:

```
git diff main...freebuff-calibration
```

Then score it against the list above. Record whether it caught item 1 and
item 2 specifically, since those are the two rules the capstone panel checks.