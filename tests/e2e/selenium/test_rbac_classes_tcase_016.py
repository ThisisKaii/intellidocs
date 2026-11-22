"""TCASE-016 | Module 1: Authentication & Access Control | Unit: RBAC and Classes | Error (Unauthorized Route)

A student opens the administrator and professor pages directly. Expected (as the app behaves):
- /admin: the route guard shows "403 Forbidden: Administrator Access Required" with a
  "Return to Dashboard" link that leads to /dashboard.
- /professor: "403 Forbidden: Professor Access Required".
The API refuses the same student on professor-only endpoints (403).
"""

import pytest
from selenium.webdriver.common.by import By

from selenium_helpers import STUDENT, click, open_page, sign_in, text_appears, visible, wait_for


def test_rbac_classes_tcase_016(driver, student_api):
    assert student_api.call("GET", "/professor/folders/none/similarity").status_code == 403
    assert student_api.call("GET", "/admin/reports/timeseries").status_code == 403

    sign_in(driver, STUDENT)
    open_page(driver, "/professor")
    assert text_appears(driver, "403 Forbidden: Professor Access Required"), "a student reached the professor page"

    open_page(driver, "/admin")
    assert text_appears(driver, "403 Forbidden: Administrator Access Required"), "a student reached the admin page"
    click(driver, visible(driver, By.XPATH, "//*[self::a or self::button][contains(., 'Return to Dashboard')]"))
    wait_for(driver, lambda d: "/dashboard" in d.current_url, message="'Return to Dashboard' did not lead to /dashboard")
    # The figure shows the 403 page: go back to it for the screenshot.
    open_page(driver, "/admin")
    assert text_appears(driver, "403 Forbidden: Administrator Access Required")


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
