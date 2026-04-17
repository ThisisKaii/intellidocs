import os
import json
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


def main() -> None:
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    duckdb_path = os.getenv("DUCKDB_PATH", "db/duckdb/behavior.duckdb")

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

            if not user_id or not document_id or not action:
                continue

            conn.execute(
                """
                INSERT INTO behavior_events
                  (user_id, document_id, action, event_ts, event_ts_raw, source_key)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [user_id, document_id, action, event_ts, ts_raw, key],
            )
            total += 1

    conn.close()
    print(f"✅ Aggregation complete: {total} events inserted.")


if __name__ == "__main__":
    main()
