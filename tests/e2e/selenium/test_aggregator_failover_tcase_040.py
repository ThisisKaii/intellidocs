"""TCASE-040 | Module 4: ML Prediction Cascade | Unit: Aggregator Failover | Non-Error (Redis to DuckDB Flush)

50 formatting events are logged through the API (they land in the Redis buffer under
behavior:{user}:{document}); then the aggregation is triggered (/behavior/aggregate, which runs
the ML service's Redis → DuckDB flush).

Expected: the aggregation finishes within a minute and DuckDB holds exactly those 50 events,
each with the timestamp it was logged with, the signed-in user's id, and the document's genre
partition. The test's rows are deleted from DuckDB afterwards.
"""

from datetime import datetime, timedelta, timezone

import pytest
import requests

from selenium_helpers import ml_in_process, show_evidence, start_ml_service, stop_ml_service

EVENTS = 50
ACTIONS = ["bold", "italic", "heading2", "paragraph", "unordered_list"]
LIMIT_S = 60


def test_aggregator_failover_tcase_040(driver, student_api, tmp_path):
    doc_id = student_api.create_document("TCASE-040 Behavior Events", "<h1>Introduction</h1><p>Formatting events.</p>")
    genre = student_api.call("GET", f"/documents/{doc_id}").json().get("genre") or "general"

    start = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(minutes=5)
    sent = []
    for i in range(EVENTS):
        stamp = (start + timedelta(seconds=i)).isoformat().replace("+00:00", "Z")
        action = ACTIONS[i % len(ACTIONS)]
        logged = student_api.call("POST", "/behavior/events", {"action": action, "timestamp": stamp, "documentId": doc_id})
        assert logged.status_code == 202, logged.text[:200]
        sent.append((action, stamp))

    duckdb_store = ml_in_process("duckdb_store")
    aggregator = ml_in_process("aggregator")
    try:
        try:
            aggregated = student_api.call("POST", "/behavior/aggregate", timeout=LIMIT_S)
        except requests.Timeout:
            stop_ml_service()
            start_ml_service(tmp_path / "ml_restart.log")
            pytest.fail(f"the aggregation did not finish within {LIMIT_S} s")
        assert aggregated.status_code == 200, aggregated.text[:300]

        store = duckdb_store.connect_duckdb()  # read-write: DuckDB allows one configuration per database in a process, and other cases open it read-write
        try:
            rows = store.conn.execute(
                "SELECT user_id, action, event_ts_raw, genre FROM behavior_events WHERE document_id = ? ORDER BY event_ts",
                [doc_id],
            ).fetchall()
        finally:
            store.conn.close()

        show_evidence(driver, "TCASE-040 Redis → DuckDB flush", [
            ("Events logged", EVENTS),
            ("Aggregation response", aggregated.text[:200]),
            ("Rows in DuckDB for the document", len(rows)),
            ("User partition", sorted({r[0] for r in rows})),
            ("Genre partition", sorted({r[3] for r in rows})),
            ("First / last timestamp", f"{rows[0][2]} … {rows[-1][2]}" if rows else "-"),
            ("DuckDB store used", store.kind),
        ])
        assert len(rows) == EVENTS, f"{len(rows)} of {EVENTS} events reached DuckDB"
        assert {r[0] for r in rows} == {student_api.user_id}
        assert {r[3] for r in rows} == {genre}
        assert [(r[1], r[2]) for r in rows] == sent, "actions or timestamps differ from what was logged"
    finally:
        store = duckdb_store.connect_duckdb()
        try:
            store.conn.execute("DELETE FROM behavior_events WHERE document_id = ?", [doc_id])
        finally:
            store.conn.close()
        try:
            aggregator.connect_redis_all()[0].delete(f"behavior:{student_api.user_id}:{doc_id}")
        except Exception as error:
            print(f"buffer key not removed: {error}")


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
