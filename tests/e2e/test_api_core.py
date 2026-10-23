"""API layer: auth, documents, folders, profile, notifications, health.

These modules have no meaningful UI state, so they are covered over HTTP where
the assertions are exact rather than inferred from the DOM.
"""

from __future__ import annotations

import uuid

from harness import Api, Requires, e2e

M = "api/auth"


# ---------------------------------------------------------------------------
# health
# ---------------------------------------------------------------------------


@e2e("health")
def test_liveness_reports_ok(anon: Api) -> None:
    r = anon.get("/health/live")
    assert r.status_code == 200, r.text[:200]


@e2e("health")
def test_readiness_reports_component_checks(anon: Api) -> None:
    r = anon.get("/health/ready")
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    assert "status" in body, f"no status key: {body}"
    assert "checks" in body, f"no checks key: {body}"


# ---------------------------------------------------------------------------
# auth
# ---------------------------------------------------------------------------


@e2e(M)
def test_login_returns_token_and_user(anon: Api) -> None:
    r = anon.post("/auth/login", {"email": "test@test.com", "password": "asd123"})
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    assert body["session"]["access_token"], "no access token"
    assert body["user"]["email"] == "test@test.com"


@e2e(M)
def test_login_rejects_bad_password(anon: Api) -> None:
    r = anon.post("/auth/login", {"email": "test@test.com", "password": "definitely-wrong"})
    assert r.status_code in (400, 401), f"expected rejection, got {r.status_code}"


@e2e(M)
def test_login_rejects_unknown_email(anon: Api) -> None:
    r = anon.post("/auth/login", {"email": f"{uuid.uuid4()}@example.com", "password": "x"})
    assert r.status_code in (400, 401), f"expected rejection, got {r.status_code}"


@e2e(M)
def test_me_requires_authentication(anon: Api) -> None:
    """Regression guard for the role-refresh endpoint added for approval lag."""
    r = anon.get("/auth/me")
    assert r.status_code == 401, f"expected 401, got {r.status_code}"


@e2e(M)
def test_me_returns_role_and_verification(api: Api) -> None:
    r = api.get("/auth/me")
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    assert "role" in body, f"no role key: {body}"
    assert "verificationStatus" in body, f"no verificationStatus key: {body}"


@e2e(M)
def test_storage_reports_usage(api: Api) -> None:
    r = api.get("/auth/storage")
    assert r.status_code == 200, r.text[:200]


@e2e(M)
def test_profile_update_roundtrip(auth_client: Api) -> None:
    """Profile writes land in Supabase Auth metadata.

    ``/auth/me`` intentionally returns only role and verification status, so
    persistence is confirmed from the PATCH response and a fresh login rather
    than from ``/auth/me``.
    """
    marker = f"e2e-{uuid.uuid4().hex[:8]}"
    r = auth_client.patch("/auth/profile", {"display_name": marker})
    assert r.status_code in (200, 204), r.text[:200]
    assert r.json()["user"]["displayName"] == marker, r.text[:200]

    # Confirm it is actually persisted, not just echoed back.
    fresh = Api()
    fresh.login()
    assert fresh.get("/auth/storage") is not None
    login_body = auth_client.post("/auth/login",
                                  {"email": "test@test.com", "password": "asd123"}).json()
    assert login_body["user"]["displayName"] == marker, (
        f"profile not persisted: {login_body['user'].get('displayName')}"
    )


# ---------------------------------------------------------------------------
# documents
# ---------------------------------------------------------------------------


@e2e("api/documents")
def test_list_documents(auth_client: Api) -> None:
    r = auth_client.get("/documents")
    assert r.status_code == 200, r.text[:200]


@e2e("api/documents")
def test_list_trash(auth_client: Api) -> None:
    r = auth_client.get("/documents/trash")
    assert r.status_code == 200, r.text[:200]


@e2e("api/documents")
def test_list_shared(auth_client: Api) -> None:
    r = auth_client.get("/documents/shared")
    assert r.status_code == 200, r.text[:200]


@e2e("api/documents")
def test_create_get_update_delete(auth_client: Api) -> None:
    title = f"e2e-crud-{uuid.uuid4().hex[:8]}"
    created = auth_client.post("/documents", {"title": title})
    assert created.status_code in (200, 201), created.text[:200]
    doc_id = created.json()["id"]

    fetched = auth_client.get(f"/documents/{doc_id}")
    assert fetched.status_code == 200, fetched.text[:200]
    assert fetched.json()["title"] == title

    updated = auth_client.put(f"/documents/{doc_id}", {"title": title + "-edited"})
    assert updated.status_code in (200, 204), updated.text[:200]

    deleted = auth_client.delete(f"/documents/{doc_id}")
    assert deleted.status_code in (200, 204), deleted.text[:200]


@e2e("api/documents")
def test_get_missing_document_is_not_200(auth_client: Api) -> None:
    r = auth_client.get(f"/documents/{uuid.uuid4()}")
    assert r.status_code in (403, 404), f"expected miss, got {r.status_code}"


@e2e("api/documents")
def test_trash_restore_purge_lifecycle(auth_client: Api) -> None:
    created = auth_client.post("/documents", {"title": f"e2e-trash-{uuid.uuid4().hex[:8]}"})
    doc_id = created.json()["id"]

    trashed = auth_client.post(f"/documents/{doc_id}/trash")
    assert trashed.status_code in (200, 204), trashed.text[:200]

    restored = auth_client.post(f"/documents/{doc_id}/restore")
    assert restored.status_code in (200, 204), restored.text[:200]

    trashed_again = auth_client.post(f"/documents/{doc_id}/trash")
    assert trashed_again.status_code in (200, 204), trashed_again.text[:200]

    purged = auth_client.delete(f"/documents/{doc_id}/permanent")
    assert purged.status_code in (200, 204), purged.text[:200]


@e2e("api/documents")
def test_versions_listing(auth_client: Api, document_id: str) -> None:
    r = auth_client.get(f"/documents/{document_id}/versions")
    assert r.status_code == 200, r.text[:200]


# ---------------------------------------------------------------------------
# documents: sharing
# ---------------------------------------------------------------------------


@e2e("api/documents/sharing")
def test_share_lifecycle(auth_client: Api, document_id: str) -> None:
    listed = auth_client.get(f"/documents/{document_id}/shares")
    assert listed.status_code == 200, listed.text[:200]

    # createShareLink requires an explicit permission from view|comment|edit.
    link = auth_client.post(f"/documents/{document_id}/share-link", {"permission": "view"})
    assert link.status_code in (200, 201), link.text[:200]

    revoked = auth_client.delete(f"/documents/{document_id}/share-link")
    assert revoked.status_code in (200, 204), revoked.text[:200]


@e2e("api/documents/sharing")
def test_share_link_rejects_invalid_permission(auth_client: Api, document_id: str) -> None:
    """Negative case: the endpoint must refuse a permission outside the enum."""
    r = auth_client.post(f"/documents/{document_id}/share-link", {"permission": "admin"})
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"


# ---------------------------------------------------------------------------
# folders
# ---------------------------------------------------------------------------


@e2e("api/folders")
def test_folder_lifecycle(auth_client: Api) -> None:
    listed = auth_client.get("/folders")
    assert listed.status_code == 200, listed.text[:200]

    created = auth_client.post("/folders", {"name": f"e2e-folder-{uuid.uuid4().hex[:8]}"})
    assert created.status_code in (200, 201), created.text[:200]
    # Folder records key on folder_id, not id.
    folder_id = created.json()["folder_id"]
    assert created.json()["name"].startswith("e2e-folder-"), created.text[:200]

    renamed = auth_client.put(f"/folders/{folder_id}", {"name": "e2e-folder-renamed"})
    assert renamed.status_code in (200, 204), renamed.text[:200]

    deleted = auth_client.delete(f"/folders/{folder_id}")
    assert deleted.status_code in (200, 204), deleted.text[:200]


@e2e("api/folders")
def test_folder_documents_listing(auth_client: Api) -> None:
    created = auth_client.post("/folders", {"name": f"e2e-docs-{uuid.uuid4().hex[:8]}"})
    folder_id = created.json()["folder_id"]
    r = auth_client.get(f"/folders/{folder_id}/documents")
    assert r.status_code == 200, r.text[:200]
    auth_client.delete(f"/folders/{folder_id}")


# ---------------------------------------------------------------------------
# profile
# ---------------------------------------------------------------------------


@e2e("api/profile")
def test_profile_export(auth_client: Api) -> None:
    r = auth_client.get("/profile/export")
    assert r.status_code == 200, r.text[:200]


# ---------------------------------------------------------------------------
# notifications
# ---------------------------------------------------------------------------


@e2e("api/notifications")
def test_notifications_listing(auth_client: Api) -> None:
    r = auth_client.get("/notifications")
    assert r.status_code == 200, r.text[:200]
    items = r.json()
    if isinstance(items, list) and items:
        nid = items[0].get("id")
        marked = auth_client.put(f"/notifications/{nid}/read")
        assert marked.status_code in (200, 204), marked.text[:200]
