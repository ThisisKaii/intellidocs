import os
import json
import time
from datetime import datetime
from typing import Optional, List, Dict, Any

import duckdb
import redis


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


def collect_events(r: redis.Redis, key: str) -> List[Dict[str, Any]]:
    raw_items = r.lrange(key, 0, -1)
    if not raw_items:
        return []
    r.delete(key)
    events: List[Dict[str, Any]] = []
    for raw in raw_items:
        try:
            events.append(json.loads(raw))
        except Exception:
            continue
    return events


def run_once() -> int:
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    duckdb_path = os.getenv("DUCKDB_PATH", "db/duckdb/behavior.duckdb")

    if not duckdb_path.startswith("md:") and os.path.dirname(duckdb_path):
        os.makedirs(os.path.dirname(duckdb_path), exist_ok=True)

    r = redis.from_url(redis_url, decode_responses=True)
    conn = duckdb.connect(duckdb_path)
    ensure_schema(conn)

    keys = r.keys("behavior:*")
    total = 0

    for key in keys:
        events = collect_events(r, key)
        if not events:
            continue

        for event in events:
            user_id = str(event.get("userId", ""))
            document_id = str(event.get("documentId", ""))
            action = str(event.get("action", ""))
            ts_raw = str(event.get("timestamp", ""))
            event_ts = parse_timestamp(ts_raw)
            block_id = str(event.get("blockId", "")) or None
            payload = event.get("payload")

            if not user_id or not document_id or not action:
                continue

            conn.execute(
                """
                INSERT INTO behavior_events
                  (user_id, document_id, action, event_ts, event_ts_raw, source_key,
                   payload, block_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    user_id,
                    document_id,
                    action,
                    event_ts,
                    ts_raw,
                    key,
                    json.dumps(payload) if payload is not None else None,
                    block_id,
                ],
            )
            total += 1

    conn.close()
    return total


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
