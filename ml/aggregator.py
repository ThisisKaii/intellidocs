import os
import json
import time
from datetime import datetime
from typing import Optional, List, Dict, Any

import duckdb
import redis
import requests


def parse_timestamp(ts: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return None


def ensure_schema(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute("""
    CREATE TABLE IF NOT EXISTS behavior_events (
      user_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      action TEXT NOT NULL,
      event_ts TIMESTAMP,
      event_ts_raw TEXT,
      ingested_at TIMESTAMP DEFAULT now(),
      source_key TEXT
    );
    """)

    # The full event payload (table shape, image dimensions, alignment, block
    # type) is kept as raw JSON so feature_extractor can derive media features
    # from it. Added separately from the CREATE above because CREATE TABLE IF
    # NOT EXISTS will not backfill the column on a database that already exists.
    conn.execute("ALTER TABLE behavior_events ADD COLUMN IF NOT EXISTS payload TEXT")
    conn.execute("ALTER TABLE behavior_events ADD COLUMN IF NOT EXISTS block_id TEXT")


# Keys removed per DEL call once their events are stored.
DELETE_BATCH_SIZE = 100


class UpstashRedis:
    """Just the commands the aggregator needs, over Upstash's REST API."""

    def __init__(self, url: str, token: str) -> None:
        host = url.split("://", 1)[-1].split(":")[0]
        self._endpoint = f"https://{host}"
        self._headers = {"Authorization": f"Bearer {token}"}

    def _call(self, *command: Any) -> Any:
        response = requests.post(self._endpoint, headers=self._headers, json=list(command), timeout=30)
        response.raise_for_status()
        return response.json().get("result")

    def keys(self, pattern: str) -> List[str]:
        return self._call("KEYS", pattern) or []

    def type(self, key: str) -> str:
        return self._call("TYPE", key)

    def lrange(self, key: str, start: int, stop: int) -> List[str]:
        rows = self._call("LRANGE", key, start, stop) or []
        return [row if isinstance(row, str) else json.dumps(row) for row in rows]

    def delete(self, *keys: str) -> None:
        if keys:
            self._call("DEL", *keys)


def connect_redis() -> Any:
    """Upstash REST when configured (the app's Redis), else a plain REDIS_URL connection."""
    upstash_url = os.getenv("UPSTASH_REDIS_REST_URL")
    upstash_token = os.getenv("UPSTASH_REDIS_REST_TOKEN")
    if upstash_url and upstash_token and not os.getenv("REDIS_URL"):
        return UpstashRedis(upstash_url, upstash_token)
    return redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"), decode_responses=True)


def is_event_list_key(r: redis.Redis, key: str) -> bool:
    """True for a per-document event list; the learned-format map is a string key."""
    if key.startswith("behavior:formats:"):
        return False
    return r.type(key) == "list"


def collect_events(r: redis.Redis, key: str) -> List[Dict[str, Any]]:
    """Read (without deleting) every parseable event in one list key."""
    events: List[Dict[str, Any]] = []
    for raw in r.lrange(key, 0, -1):
        try:
            events.append(json.loads(raw))
        except Exception:
            continue
    return events


def event_row(event: Dict[str, Any], key: str) -> Optional[tuple]:
    """Build one behavior_events row, or None when required fields are missing."""
    user_id = str(event.get("userId", ""))
    document_id = str(event.get("documentId", ""))
    action = str(event.get("action", ""))
    if not user_id or not document_id or not action:
        return None
    ts_raw = str(event.get("timestamp", ""))
    payload = event.get("payload")
    return (
        user_id,
        document_id,
        action,
        parse_timestamp(ts_raw),
        ts_raw,
        key,
        json.dumps(payload) if payload is not None else None,
        str(event.get("blockId", "")) or None,
    )


def run_once() -> int:
    duckdb_path = os.getenv("DUCKDB_PATH", "db/duckdb/behavior.duckdb")

    if not duckdb_path.startswith("md:") and os.path.dirname(duckdb_path):
        os.makedirs(os.path.dirname(duckdb_path), exist_ok=True)

    r = connect_redis()
    conn = duckdb.connect(duckdb_path)
    try:
        ensure_schema(conn)

        keys = [key for key in r.keys("behavior:*") if is_event_list_key(r, key)]
        rows: List[tuple] = []
        read_keys: List[str] = []

        for key in keys:
            events = collect_events(r, key)
            if not events:
                continue
            read_keys.append(key)
            rows.extend(row for row in (event_row(e, key) for e in events) if row is not None)

        # One batched insert, then one batched delete: keys are only removed once
        # their events are safely in DuckDB.
        if rows:
            conn.executemany(
                """
                INSERT INTO behavior_events
                  (user_id, document_id, action, event_ts, event_ts_raw, source_key,
                   payload, block_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
        for start in range(0, len(read_keys), DELETE_BATCH_SIZE):
            r.delete(*read_keys[start:start + DELETE_BATCH_SIZE])
        return len(rows)
    finally:
        conn.close()


def main() -> None:
    run_once_flag = os.getenv("AGGREGATOR_RUN_ONCE", "").lower() in ("1", "true", "yes")
    if run_once_flag:
        count = run_once()
        print(f"✅ Aggregation complete: {count} events inserted.")
        return

    interval = int(os.getenv("AGGREGATOR_INTERVAL_SECONDS", "30"))
    print(f"✅ Aggregator running every {interval}s")

    while True:
        count = run_once()
        if count:
            print(f"✅ Aggregation complete: {count} events inserted.")
        time.sleep(interval)


if __name__ == "__main__":
    main()
