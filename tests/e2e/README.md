# End-to-End Test Suite

Browser and HTTP coverage for IntelliDocs, organised by application module.

## Setup

```powershell
pip install pytest requests playwright
```

Playwright's bundled Chromium cannot be downloaded on some networks. The suite
drives the locally installed Google Chrome instead (`channel="chrome"`), so no
browser download is required.

## Running

```powershell
# everything
pytest tests/e2e -v

# one layer
pytest tests/e2e -m api -v
pytest tests/e2e -m browser -v

# one module
pytest tests/e2e -k formatting -v
```

The backend must be running on `:3000` and the frontend on `:5173`:

```powershell
cd server    && npm run dev
cd frontend  && npm run dev
```

Note the Express backend mounts routes at the root, not under `/api`; the Vite
proxy adds that prefix. API tests therefore target `http://localhost:3000`.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `API_URL` | `http://localhost:3000` | Backend origin |
| `WEB_URL` | `http://localhost:5173` | Frontend origin |
| `TEST_EMAIL` | `test@test.com` | Standard test user |
| `TEST_PASSWORD` | `asd123` | Standard test user password |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | unset | Unlocks the admin module |
| `E2E_ARTIFACTS` | `tests/e2e/artifacts` | Screenshots |

## Reading the report

The run ends with a per-module tally:

```
  ok   test_api_core       22/22 passed
  ok   test_ui_flows        8/8 passed
  FAIL test_ui_editor      17/19 passed, 2 failed
  ok   test_api_services   14/14 passed, 6 blocked
```

Three outcomes are distinguished deliberately:

- **passed** — the behaviour was observed to be correct.
- **failed** — the application behaved incorrectly. This is a real defect.
- **blocked** — an external dependency was unavailable, so the behaviour could
  not be observed. Not a defect.

A blocked test is not a silent skip. The reason names the missing dependency.

## Dependency gating

Every test authenticates against or reads from Supabase, so the suite checks
provider reachability once during collection. When Supabase is slow or
returning gateway errors, the suite is **blocked as a whole** rather than
filling the report with timeouts that describe the provider instead of the
application. Transient responses (502/503/504/522) are retried with backoff.

This distinction matters when a run is used as evidence. A failure should mean
the code is wrong, never that a third party was briefly unavailable.

The `health` tests are exempt from the gate because their purpose is to report
the outage.

## Layer 1: API (`test_api_core.py`, `test_api_services.py`)

Direct HTTP against Express. Fast and deterministic, and it covers modules with
no meaningful UI: auth, documents, sharing, folders, profile, notifications,
health, behavior, formatting bindings and presets, predictions, AI/MCP,
professor, admin, Drive.

Each negative test asserts that the endpoint *rejects* bad input. Validation is
only meaningful if something confirms the rejection.

Tests marked `requires=...` for the ML service, the AI provider, Google OAuth,
or admin credentials report **blocked** when those are unavailable rather than
failing.

## Layer 2: Browser (`test_ui_flows.py`, `test_ui_editor.py`)

Playwright drives the real editor: login, protected-route redirects, navigation,
the formatting matrix, undo/redo, autosave across reload, and panel toggling.

Each editor test creates its own document over the API and types a unique probe
line, then asserts on the computed style of the block containing that text.

Locating the block by **text** rather than by `window.getSelection()` is
deliberate. Clicking a toolbar button moves focus off the ProseMirror surface,
so the DOM selection is empty afterwards even though ProseMirror still holds
the selection internally. Keying off the probe text also proves the typed text
landed where the test intended, and prevents a document that contains bold
elsewhere from making an assertion pass vacuously.

`test_selection_churn_does_not_overflow_the_stack` is a regression guard for the
style-origin decoration re-entrancy bug: every selection change dispatches the
transaction that recomputes that decoration, which previously recursed until the
stack overflowed.

## Known environment limitations

These are not application defects and cannot be asserted here:

- **Screenshots are written for humans, not asserted on.** Assertions read the
  DOM and computed styles so failures are readable as text.
- **Google OAuth cannot be completed** without a real browser consent screen and
  a redirect; only the failure paths are covered.
- **The production Compose stack is not exercised.** It needs Docker, TLS
  certificates, and a reachable domain.

## Survey-feature regression tests

`test_round3_regression.py` covers the panel navigator (grammar rows, All view with page numbers,
on/off switches), per-block grammar checking, the help sheet, citation styles and DOI lookup,
recovery of unsaved edits after a failed save, document Q&A with source chips, and the originality
card. Start the stack first (server 3000, frontend 5173, ML 8001), then:

    pytest tests/e2e/test_round3_regression.py -v

The chat test needs an AI provider key in the server `.env`; the DOI test skips itself when Crossref
is unreachable.
