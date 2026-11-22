"""TCASE-041 | Module 4: ML Prediction Cascade | Unit: Aggregator Failover | Error (DuckDB File Lock Fallback)

The primary DuckDB file is held open for writing by another process (a separate Python process
standing in for a long analytical query). The aggregator's own code then flushes a buffer of
events. Runs against temporary local DuckDB files (primary + fallback), never the real store;
the event buffer is an in-memory stand-in for Redis that drain_redis reads like the real one.

Expected (as the app behaves): opening the primary fails with a lock error, the aggregator
retries with backoff, then writes the events to the fallback file (behavior_fallback.duckdb);
once the other process releases the primary, the next run's sync_fallback_to_primary copies
every fallback row into the primary and empties the fallback.
"""

import json
import subprocess
import sys
import time

import pytest

from selenium_helpers import ml_in_process, show_evidence

USER = "tcase-041-user"
DOCUMENT = "tcase-041-document"
EVENTS = 12

HOLD_LOCK = """
import sys, time, duckdb
conn = duckdb.connect(sys.argv[1])
conn.execute("CREATE TABLE IF NOT EXISTS hold (x INTEGER)")
print("locked", flush=True)
sys.stdin.readline()
conn.close()
"""


class BufferStandIn:
    """The four list commands drain_redis uses, over a dict instead of Redis."""

    def __init__(self, lists: dict[str, list[str]]) -> None:
        self.lists = lists

    def keys(self, pattern: str) -> list[str]:
        return [k for k in self.lists if k.startswith(pattern.rstrip("*"))]

    def type(self, key: str) -> str:
        return "list"

    def lrange(self, key: str, start: int, stop: int) -> list[str]:
        return list(self.lists[key])

    def ltrim(self, key: str, start: int, stop: int) -> None:
        self.lists[key] = self.lists[key][start:]


def test_aggregator_failover_tcase_041(driver, tmp_path, monkeypatch):
    primary, fallback = tmp_path / "behavior.duckdb", tmp_path / "behavior_fallback.duckdb"
    monkeypatch.setenv("DUCKDB_PATH", str(primary))
    monkeypatch.setenv("DUCKDB_FALLBACK_PATH", str(fallback))
    duckdb_store = ml_in_process("duckdb_store")
    aggregator = ml_in_process("aggregator")

    events = [json.dumps({"userId": USER, "documentId": DOCUMENT, "action": "bold" if i % 2 else "italic",
                          "timestamp": f"2026-11-21T08:00:{i:02d}Z", "genre": "general"}) for i in range(EVENTS)]
    buffer = BufferStandIn({f"behavior:{USER}:{DOCUMENT}": events})

    holder = subprocess.Popen([sys.executable, "-c", HOLD_LOCK, str(primary)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    try:
        assert holder.stdout.readline().strip() == "locked", "the other process could not take the primary"

        started = time.perf_counter()
        store = duckdb_store.connect_duckdb()
        waited = time.perf_counter() - started
        try:
            aggregator.ensure_schema(store.conn)
            written = aggregator.drain_redis(buffer, store.conn)
        finally:
            store.conn.close()
        assert store.kind == "fallback", f"wrote to {store.kind} while the primary was locked"
        assert written == EVENTS and buffer.lists[f"behavior:{USER}:{DOCUMENT}"] == [], "the buffer was not flushed"
    finally:
        holder.stdin.write("\n")
        holder.stdin.flush()
        holder.wait(timeout=30)

    # The primary is free again: the next run merges the fallback back.
    store = duckdb_store.connect_duckdb()
    try:
        assert store.kind == "primary"
        aggregator.ensure_schema(store.conn)
        moved = duckdb_store.sync_fallback_to_primary(store.conn)
        in_primary = store.conn.execute("SELECT count(*) FROM behavior_events WHERE user_id = ?", [USER]).fetchone()[0]
        store.conn.execute(f"ATTACH '{fallback}' AS fb (READ_ONLY)")
        left_in_fallback = store.conn.execute("SELECT count(*) FROM fb.behavior_events").fetchone()[0]
        store.conn.execute("DETACH fb")
    finally:
        store.conn.close()

    show_evidence(driver, "TCASE-041 DuckDB lock fallback", [
        ("Primary", f"{primary.name} held open by another process (pid {holder.pid})"),
        ("Lock retries before falling back", f"{len(duckdb_store.LOCK_BACKOFF_SECONDS)} (waited {waited:.1f} s)"),
        ("Store written while locked", f"fallback ({fallback.name})"),
        ("Events flushed", written),
        ("After the lock was released", f"{moved} rows merged into the primary"),
        ("Rows in primary / left in fallback", f"{in_primary} / {left_in_fallback}"),
    ])
    assert moved == EVENTS and in_primary == EVENTS and left_in_fallback == 0


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
