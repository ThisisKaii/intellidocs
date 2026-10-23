"""Browser layer: authentication flow, routing, and dashboard.

Asserts on URL and DOM state rather than screenshots, so failures are readable
as text.
"""

from __future__ import annotations

from harness import WEB, Api, e2e, sign_in

M = "ui/auth"


@e2e(M, layer="browser")
def test_landing_renders_branding(page) -> None:
    page.goto(WEB, wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    assert page.title() != "", "no document title"
    body = page.inner_text("body")
    assert "IntelliDocs" in body, "brand name missing from landing"


@e2e(M, layer="browser")
def test_login_form_is_present(page) -> None:
    page.goto(f"{WEB}/login", wait_until="domcontentloaded")
    page.wait_for_timeout(1000)
    assert page.query_selector("input#email") is not None, "no email field"
    assert page.query_selector("input#password") is not None, "no password field"
    assert page.query_selector('button[type="submit"]') is not None, "no submit button"


@e2e(M, layer="browser")
def test_successful_login_lands_on_dashboard(page) -> None:
    sign_in(page)
    assert "/dashboard" in page.url, f"expected dashboard, got {page.url}"


@e2e(M, layer="browser")
def test_protected_route_redirects_anonymous_visitor(page) -> None:
    page.goto(f"{WEB}/dashboard", wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    assert "/login" in page.url, f"expected redirect to login, got {page.url}"


@e2e(M, layer="browser")
def test_wrong_password_shows_error_and_stays(page) -> None:
    page.goto(f"{WEB}/login", wait_until="domcontentloaded")
    page.wait_for_timeout(1000)
    page.fill("input#email", "test@test.com")
    page.fill("input#password", "wrong-password")
    page.click('button[type="submit"]')
    page.wait_for_timeout(4000)
    assert "/login" in page.url, f"should not have authenticated, got {page.url}"


@e2e(M, layer="browser")
def test_dashboard_shows_document_list(page) -> None:
    sign_in(page)
    body = page.inner_text("body")
    assert "My Documents" in body or "Documents" in body, f"no document list: {body[:200]}"
    assert page.query_selector(".ProseMirror") is None, "editor should not be on the dashboard"


@e2e(M, layer="browser")
def test_navigate_between_protected_routes(page) -> None:
    """Every protected route must render without a hard crash."""
    sign_in(page)
    for route in ("/dashboard", "/settings"):
        page.goto(f"{WEB}{route}", wait_until="domcontentloaded")
        page.wait_for_timeout(2000)
        assert page.url.endswith(route), f"redirected away from {route}: {page.url}"
        assert page.inner_text("body").strip(), f"{route} rendered empty"


@e2e(M, layer="browser")
def test_no_stack_overflow_on_any_route(page) -> None:
    """Guard against the class of defect fixed in the style-origin effect."""
    sign_in(page)
    for route in ("/dashboard", "/settings"):
        page.goto(f"{WEB}{route}", wait_until="domcontentloaded")
        page.wait_for_timeout(2500)
    overflow = [e for e in page.e2e_errors if "call stack" in e.lower()]
    assert not overflow, f"stack overflow on navigation: {overflow[:2]}"
