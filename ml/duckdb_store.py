"""One place that opens DuckDB, so a locked or unreachable database degrades instead of failing.

A local DuckDB file allows a single writing process. When the aggregator is
writing, anything else that opens the file (the ML service, training scripts)
gets "could not set lock". `connect_duckdb` retries those a few times, then
falls back to a second local file so work continues. Rows written to the
fallback are copied back into the primary by `sync_fallback_to_primary` the
next time the primary is reachable.
"""
import os
import time
from typing import Any, NamedTuple

import duckdb

DEFAULT_PRIMARY = "db/duckdb/behavior.duckdb"
DEFAULT_FALLBACK = "db/duckdb/behavior_fallback.duckdb"

# Pauses between attempts on a lock error (seconds); the last attempt is not followed by a pause.
LOCK_BACKOFF_SECONDS = (0.2, 0.5, 1.0)

# Columns copied from the fallback into the primary, in table order.
EVENT_COLUMNS = (
    "user_id, document_id, action, event_ts, event_ts_raw, ingested_at, source_key, payload, block_id"
)

_last_kind = "primary"


class Store(NamedTuple):
    """An open connection and which database it is: 'primary' or 'fallback'."""

    conn: Any
    kind: str


def primary_path() -> str:
    """The main database: a local file or a MotherDuck `md:` name."""
    return os.getenv("DUCKDB_PATH", DEFAULT_PRIMARY)


def fallback_path() -> str:
    """The local file used while the primary is locked or unreachable."""
    return os.getenv("DUCKDB_FALLBACK_PATH", DEFAULT_FALLBACK)


def is_lock_error(error: Exception) -> bool:
    """True when another process holds the file (worth retrying), not when the file is bad."""
    text = str(error).lower()
    return "lock" in text and ("could not set lock" in text or "conflicting lock" in text or "already open" in text)


def _ensure_parent(path: str) -> None:
    """Create the folder of a local database file."""
    if not path.startswith("md:") and os.path.dirname(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)


def _open(path: str, read_only: bool) -> Any:
    """Open one database; a writer creates the folder first."""
    if not read_only:
        _ensure_parent(path)
    return duckdb.connect(path, read_only=read_only) if read_only else duckdb.connect(path)


def connect_duckdb(read_only: bool = False, sleep=time.sleep) -> Store:
    """Open the primary database, retrying lock errors, else the fallback file.

    Readers (`read_only=True`) only use the fallback when it already exists, so
    reading never creates an empty database. Raises the primary's error when
    neither database can be opened.
    """
    global _last_kind
    primary = primary_path()
    last_error: Exception | None = None

    for attempt in range(len(LOCK_BACKOFF_SECONDS) + 1):
        try:
            conn = _open(primary, read_only)
            _last_kind = "primary"
            return Store(conn, "primary")
        except Exception as error:  # duckdb raises several error types for locks and IO
            last_error = error
            if not is_lock_error(error) or attempt == len(LOCK_BACKOFF_SECONDS):
                break
            sleep(LOCK_BACKOFF_SECONDS[attempt])

    fallback = fallback_path()
    if fallback != primary and (not read_only or os.path.exists(fallback)):
        try:
            conn = _open(fallback, read_only)
            _last_kind = "fallback"
            print(f"[duckdb] primary unavailable ({last_error}); using fallback {fallback}")
            return Store(conn, "fallback")
        except Exception as fallback_error:
            print(f"[duckdb] fallback also failed: {fallback_error}")

    raise last_error if last_error else RuntimeError("DuckDB is not available")


def active_store() -> str:
    """Which database the last connection used: 'primary' or 'fallback'."""
    return _last_kind


def sync_fallback_to_primary(primary_conn: Any) -> int:
    """Copy behavior events written to the fallback into the primary, then clear them.

    If the copy fails, the fallback is left untouched and the next run tries
    again. Returns how many rows moved.
    """
    fallback = fallback_path()
    if fallback == primary_path() or not os.path.exists(fallback):
        return 0

    primary_conn.execute(f"ATTACH '{fallback}' AS fallback_db")
    try:
        tables = [row[0] for row in primary_conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_catalog = 'fallback_db'"
        ).fetchall()]
        if "behavior_events" not in tables:
            return 0
        count = primary_conn.execute("SELECT count(*) FROM fallback_db.behavior_events").fetchone()[0]
        if not count:
            return 0
        # DuckDB can't write two databases in one transaction, so copy first and
        # clear after: a failure between the steps can only repeat rows, never lose them.
        primary_conn.execute(
            f"INSERT INTO behavior_events ({EVENT_COLUMNS}) SELECT {EVENT_COLUMNS} FROM fallback_db.behavior_events"
        )
        primary_conn.execute("DELETE FROM fallback_db.behavior_events")
        return int(count)
    finally:
        primary_conn.execute("DETACH fallback_db")
