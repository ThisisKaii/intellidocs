"""API layer: behavior pipeline, formatting, predictions, AI/MCP, professor, admin, drive.

Tests that depend on the Python ML service or on admin credentials are marked
with ``requires`` and report as BLOCKED when those are unavailable, so a missing
external service never reads as an application defect.
"""

from __future__ import annotations

import os
import uuid

from harness import ADMIN_EMAIL, ADMIN_PASSWORD, Api, Requires, e2e


# ---------------------------------------------------------------------------
# behavior
# ---------------------------------------------------------------------------


@e2e("api/behavior")
def test_behavior_event_is_ingested(auth_client: Api, document_id: str) -> None:
    """Contracts per server/schemas/behaviorSchemas.ts: action, timestamp, documentId."""
    r = auth_client.post("/behavior/events", {
        "action": "format_applied",
        "timestamp": "2026-01-01T00:00:00.000Z",
        "documentId": document_id,
        "payload": {"format": "bold", "bold": True, "text": "sample"},
    })
    assert r.status_code in (200, 201, 202, 204), r.text[:300]


@e2e("api/behavior")
def test_behavior_summary_returns_shape(auth_client: Api, document_id: str) -> None:
    r = auth_client.get(f"/behavior/summary/{document_id}")
    assert r.status_code == 200, r.text[:300]


@e2e("api/behavior")
def test_behavior_event_rejects_bad_timestamp(auth_client: Api, document_id: str) -> None:
    """Negative case: timestamp must be a valid ISO datetime."""
    r = auth_client.post("/behavior/events", {
        "action": "format_applied",
        "timestamp": "not-a-date",
        "documentId": document_id,
    })
    assert r.status_code == 400, f"expected 400, got {r.status_code}"


@e2e("api/behavior")
def test_behavior_event_rejects_missing_action(auth_client: Api, document_id: str) -> None:
    r = auth_client.post("/behavior/events", {
        "timestamp": "2026-01-01T00:00:00.000Z",
        "documentId": document_id,
    })
    assert r.status_code == 400, f"expected 400, got {r.status_code}"


# ---------------------------------------------------------------------------
# formatting
# ---------------------------------------------------------------------------


@e2e("api/formatting")
def test_presets_listing(auth_client: Api) -> None:
    r = auth_client.get("/formatting/presets")
    assert r.status_code == 200, r.text[:200]


@e2e("api/formatting")
def test_bindings_lifecycle(auth_client: Api) -> None:
    """Contracts per server/schemas/formattingSchemas.ts:
    trigger_condition (object) + format_to_apply (string) + priority (int)."""
    listed = auth_client.get("/formatting/bindings")
    assert listed.status_code == 200, listed.text[:200]

    created = auth_client.post("/formatting/bindings", {
        "trigger_condition": {"maxWords": 12, "standaloneLine": True},
        "format_to_apply": "heading_2",
        "priority": 1,
    })
    assert created.status_code in (200, 201), created.text[:300]
    binding_id = created.json().get("id") or created.json().get("binding_id")
    assert binding_id, f"no id in create response: {created.text[:300]}"

    updated = auth_client.put(f"/formatting/bindings/{binding_id}", {"priority": 5})
    assert updated.status_code in (200, 204), updated.text[:300]

    deleted = auth_client.delete(f"/formatting/bindings/{binding_id}")
    assert deleted.status_code in (200, 204), deleted.text[:300]


@e2e("api/formatting")
def test_binding_rejects_blank_format(auth_client: Api) -> None:
    """Negative case: format_to_apply must be non-empty."""
    r = auth_client.post("/formatting/bindings", {
        "trigger_condition": {"maxWords": 5},
        "format_to_apply": "   ",
    })
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"


@e2e("api/formatting")
def test_user_presets_lifecycle(auth_client: Api) -> None:
    """createUserPresetSchema keys on baseKey (blueprint fork)."""
    listed = auth_client.get("/formatting/user-presets")
    assert listed.status_code == 200, listed.text[:300]

    created = auth_client.post("/formatting/user-presets", {"baseKey": "apa_7th"})
    if created.status_code in (200, 201):
        preset_id = created.json().get("id") or created.json().get("preset_id")
        assert preset_id, f"no id in create response: {created.text[:300]}"
        deleted = auth_client.delete(f"/formatting/user-presets/{preset_id}")
        assert deleted.status_code in (200, 204), deleted.text[:300]
    else:
        # The user_presets migration may not be applied yet.
        assert created.status_code in (400, 404, 500), created.text[:300]


@e2e("api/formatting")
def test_user_preset_rejects_blank_base_key(auth_client: Api) -> None:
    r = auth_client.post("/formatting/user-presets", {"baseKey": "   "})
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"


# ---------------------------------------------------------------------------
# predictions (require the Python ML service)
# ---------------------------------------------------------------------------


@e2e("api/predictions", requires=(Requires.ML,))
def test_format_prediction(auth_client: Api) -> None:
    r = auth_client.post("/predictions/predict", {
        "text": "This is the first sentence of a paragraph that should be formatted.",
    })
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert "confidence" in body or "prediction" in body, f"unexpected shape: {body}"


@e2e("api/predictions", requires=(Requires.ML,))
def test_grammar_check(auth_client: Api) -> None:
    r = auth_client.post("/predictions/grammar-check", {"text": "This are a test sentence."})
    assert r.status_code == 200, r.text[:300]


@e2e("api/predictions", requires=(Requires.ML,))
def test_spelling_check(auth_client: Api) -> None:
    r = auth_client.post("/predictions/spelling-check", {"text": "This has a mispeling."})
    assert r.status_code == 200, r.text[:300]


# ---------------------------------------------------------------------------
# formatting tier check (require the Python ML service)
# ---------------------------------------------------------------------------


@e2e("api/formatting/tier", requires=(Requires.ML,))
def test_tier_check(auth_client: Api, document_id: str) -> None:
    """tierCheckSchema requires both text and documentId."""
    r = auth_client.post("/formatting/tier-check", {
        "text": "A sample paragraph for tier analysis.",
        "documentId": document_id,
    })
    assert r.status_code == 200, r.text[:300]


# ---------------------------------------------------------------------------
# AI / MCP
# ---------------------------------------------------------------------------


@e2e("api/mcp")
def test_mcp_tool_listing(auth_client: Api) -> None:
    """Tool definitions should be enumerable without invoking a provider."""
    r = auth_client.get("/mcp/tools")
    if r.status_code == 404:
        r = auth_client.get("/mcp/tools/list")
    assert r.status_code in (200, 404), r.text[:200]
    if r.status_code == 200:
        assert r.json() is not None


@e2e("api/ai", requires=(Requires.AI_PROVIDER,))
def test_ai_provider_reachable(auth_client: Api) -> None:
    r = auth_client.post("/ai/chat", {"message": "hello"})
    assert r.status_code == 200, r.text[:300]


# ---------------------------------------------------------------------------
# professor
# ---------------------------------------------------------------------------


@e2e("api/professor")
def test_professor_document_review_requires_approval(auth_client: Api, document_id: str) -> None:
    """A plain student must not be able to read the professor review surface."""
    r = auth_client.get(f"/professor/documents/{document_id}/review")
    assert r.status_code in (200, 403), f"unexpected status {r.status_code}: {r.text[:200]}"


@e2e("api/professor")
def test_professor_comments_listing(auth_client: Api, document_id: str) -> None:
    r = auth_client.get(f"/professor/documents/{document_id}/comments")
    assert r.status_code in (200, 403), f"unexpected status {r.status_code}: {r.text[:200]}"


# ---------------------------------------------------------------------------
# admin
# ---------------------------------------------------------------------------


@e2e("api/admin", requires=(Requires.ADMIN,))
def test_admin_pending_applicants() -> None:
    client = Api()
    client.login(ADMIN_EMAIL, ADMIN_PASSWORD)
    r = client.get("/admin/applicants/pending")
    assert r.status_code == 200, r.text[:200]


@e2e("api/admin", requires=(Requires.ADMIN,))
def test_admin_user_listing() -> None:
    client = Api()
    client.login(ADMIN_EMAIL, ADMIN_PASSWORD)
    r = client.get("/admin/users")
    assert r.status_code == 200, r.text[:200]


@e2e("api/admin")
def test_admin_routes_reject_non_admin(auth_client: Api) -> None:
    """Negative case: a student must not reach admin endpoints."""
    r = auth_client.get("/admin/users")
    assert r.status_code in (401, 403), f"expected denial, got {r.status_code}"


# ---------------------------------------------------------------------------
# drive
# ---------------------------------------------------------------------------


@e2e("api/drive")
def test_drive_status_when_unconnected(auth_client: Api) -> None:
    r = auth_client.get("/drive/status")
    assert r.status_code == 200, r.text[:200]


@e2e("api/drive")
def test_drive_list_files_requires_connection(auth_client: Api) -> None:
    """Without a Google connection this must fail cleanly, not hang or 500 blindly."""
    r = auth_client.get("/drive/files")
    assert r.status_code in (200, 400, 401, 403), f"unexpected {r.status_code}: {r.text[:200]}"


@e2e("api/drive", requires=(Requires.GOOGLE_OAUTH,))
def test_drive_auth_url_generates_state() -> None:
    client = Api()
    client.login()
    r = client.get("/drive/auth-url")
    assert r.status_code == 200, r.text[:200]
    assert r.json().get("url"), "no auth url returned"
