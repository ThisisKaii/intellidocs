"""Professor access control: a plain student must not reach educator features.

Run with the dev stack up:  pytest tests/e2e/test_professor_roles.py -v
"""

from __future__ import annotations

from harness import Api, e2e

M = "professor/roles"


@e2e(M)
def test_student_cannot_open_professor_routes(api: Api) -> None:
    assert api.get("/professor/folders/none/similarity").status_code == 403


@e2e(M)
def test_student_cannot_create_a_class_folder(api: Api) -> None:
    r = api.post("/folders", {"name": "Not allowed", "folderType": "class", "classCode": "CS-201"})
    assert r.status_code == 403, r.text[:200]


@e2e(M)
def test_student_cannot_run_class_scans(api: Api) -> None:
    assert api.post("/plagiarism/scans", {"documentId": "a", "folderId": "b"}).status_code == 403
    assert api.get("/plagiarism/folders/none/scans").status_code == 403


@e2e(M)
def test_joining_with_an_unknown_code_is_a_clean_404(api: Api) -> None:
    r = api.post("/folders/join", {"code": "ZZZZZZ"})
    assert r.status_code == 404, r.text[:200]


@e2e(M)
def test_student_can_read_their_application_status(api: Api) -> None:
    r = api.get("/auth/application-status")
    assert r.status_code == 200
    assert "verificationStatus" in r.json()


@e2e(M)
def test_admin_report_series_is_admin_only(api: Api) -> None:
    assert api.get("/admin/reports/timeseries").status_code == 403
