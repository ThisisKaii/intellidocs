"""DuckDB falls back to a second file when the main one is locked, and syncs back later."""
import os
import sys
import json

import duckdb
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../ml'))

import aggregator
import duckdb_store


@pytest.fixture()
def paths(tmp_path, monkeypatch):
    primary = str(tmp_path / "primary.duckdb")
    fallback = str(tmp_path / "fallback.duckdb")
    monkeypatch.setenv("DUCKDB_PATH", primary)
    monkeypatch.setenv("DUCKDB_FALLBACK_PATH", fallback)
    monkeypatch.setattr(duckdb_store.time, "sleep", lambda _s: None)
    return primary, fallback


def _event(action, key="behavior:u1:d1"):
    return json.dumps({"userId": "u1", "documentId": "d1", "action": action,
                       "timestamp": "2026-01-01T00:00:00Z", "payload": {"text": "x"}})


class _Redis:
    """Minimal list-based redis for the aggregator."""

    def __init__(self, store):
        self.store = store

    def keys(self, _pattern):
        return [k for k in self.store if k.startswith("behavior:")]

    def type(self, key):
        return "list"

    def lrange(self, key, _a, _b):
        return list(self.store[key])

    def ltrim(self, key, start, _stop):
        rest = self.store[key][start:]
        if rest:
            self.store[key] = rest
        else:
            self.store.pop(key, None)


def _count(path):
    conn = duckdb.connect(path)
    try:
        return conn.execute("SELECT count(*) FROM behavior_events").fetchone()[0]
    finally:
        conn.close()


def test_opens_the_primary_when_it_is_free(paths):
    store = duckdb_store.connect_duckdb()
    assert store.kind == "primary"
    store.conn.close()


def test_lock_is_retried_then_the_fallback_is_used(paths):
    primary, fallback = paths
    holder = duckdb.connect(primary)  # this process keeps the write lock
    try:
        # A second connection in the same process shares the lock, so simulate the lock error.
        real_open = duckdb_store._open
        attempts = []

        def locked_open(path, read_only):
            if path == primary:
                attempts.append(1)
                raise duckdb.IOException("IO Error: Could not set lock on file: Conflicting lock is held")
            return real_open(path, read_only)

        duckdb_store._open = locked_open
        try:
            store = duckdb_store.connect_duckdb()
        finally:
            duckdb_store._open = real_open
        assert store.kind == "fallback"
        assert len(attempts) == len(duckdb_store.LOCK_BACKOFF_SECONDS) + 1
        assert duckdb_store.active_store() == "fallback"
        store.conn.close()
    finally:
        holder.close()


def test_a_non_lock_error_goes_straight_to_the_fallback(paths, monkeypatch):
    primary, _ = paths
    attempts = []
    real_open = duckdb_store._open

    def broken(path, read_only):
        if path == primary:
            attempts.append(1)
            raise duckdb.IOException("IO Error: cannot open file")
        return real_open(path, read_only)

    monkeypatch.setattr(duckdb_store, "_open", broken)
    assert duckdb_store.connect_duckdb().kind == "fallback"
    assert len(attempts) == 1


def test_readers_do_not_create_an_empty_fallback(paths, monkeypatch):
    primary, fallback = paths

    def broken(path, read_only):
        raise duckdb.IOException("IO Error: Could not set lock on file")

    monkeypatch.setattr(duckdb_store, "_open", broken)
    with pytest.raises(Exception):
        duckdb_store.connect_duckdb(read_only=True)
    assert not os.path.exists(fallback)


def test_fallback_rows_sync_into_the_primary_and_are_cleared(paths):
    primary, fallback = paths
    fb = duckdb.connect(fallback)
    aggregator.ensure_schema(fb)
    fb.execute("INSERT INTO behavior_events (user_id, document_id, action) VALUES ('u1', 'd1', 'bold'), ('u1', 'd1', 'italic')")
    fb.close()

    conn = duckdb.connect(primary)
    aggregator.ensure_schema(conn)
    assert duckdb_store.sync_fallback_to_primary(conn) == 2
    conn.close()

    assert _count(primary) == 2
    assert _count(fallback) == 0


def test_sync_does_nothing_without_a_fallback_file(paths):
    primary, _ = paths
    conn = duckdb.connect(primary)
    aggregator.ensure_schema(conn)
    assert duckdb_store.sync_fallback_to_primary(conn) == 0
    conn.close()


def test_aggregator_keeps_events_pushed_while_it_ran(paths, monkeypatch):
    store = {"behavior:u1:d1": [_event("bold")]}
    redis = _Redis(store)
    real_lrange = redis.lrange

    def lrange_then_new_event(key, a, b):
        items = real_lrange(key, a, b)
        store[key].append(_event("italic"))  # arrives after the read, before the trim
        return items

    redis.lrange = lrange_then_new_event
    monkeypatch.setattr(aggregator, "connect_redis", lambda: redis)

    assert aggregator.run_once() == 1
    assert len(store["behavior:u1:d1"]) == 1  # the late event is still waiting
    assert json.loads(store["behavior:u1:d1"][0])["action"] == "italic"


def test_aggregator_skips_a_dead_redis_and_still_drains_the_rest(paths, monkeypatch):
    class Dead:
        def keys(self, _p):
            raise ConnectionError("upstash down")

    live = _Redis({"behavior:u1:d1": [_event("bold")]})
    monkeypatch.setattr(aggregator, "connect_redis_all", lambda: [Dead(), live])
    assert aggregator.run_once() == 1


def test_aggregator_writes_to_the_fallback_when_the_primary_is_unavailable(paths, monkeypatch):
    primary, fallback = paths
    real_open = duckdb_store._open

    def locked(path, read_only):
        if path == primary:
            raise duckdb.IOException("IO Error: Could not set lock on file")
        return real_open(path, read_only)

    monkeypatch.setattr(duckdb_store, "_open", locked)
    monkeypatch.setattr(aggregator, "connect_redis", lambda: _Redis({"behavior:u1:d1": [_event("bold")]}))
    assert aggregator.run_once() == 1
    assert _count(fallback) == 1
