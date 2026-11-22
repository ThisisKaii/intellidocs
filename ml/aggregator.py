import os
import json
import time
from datetime import datetime
from typing import Optional, List, Dict, Any

import duckdb
import redis
import requests

import duckdb_store


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
    # Genre partition stamped by the server on every event. Rows without one are 'legacy'
    # and are excluded from training and prediction (see duckdb_store.fetch_genre_actions).
    conn.execute("ALTER TABLE behavior_events ADD COLUMN IF NOT EXISTS genre TEXT")


# Keys removed per DEL call once their events are stored.
DELETE_BATCH_SIZE = 100

# The columns of an event row as event_row builds it.
EVENT_INSERT_COLUMNS = ["user_id", "document_id", "action", "event_ts", "event_ts_raw", "source_key", "payload", "block_id", "genre"]

# Commands sent per Upstash /pipeline request.
PIPELINE_CHUNK = 100


class UpstashRedis:
    """Just the commands the aggregator needs, over Upstash's REST API."""

    def __init__(self, url: str, token: str) -> None:
        host = url.split("://", 1)[-1].split(":")[0]
        self._endpoint = f"https://{host}"
        self._headers = {"Authorization": f"Bearer {token}"}
        # One kept-alive connection: a new TLS handshake per command made a flush of a few
        # hundred keys take minutes.
        self._session = requests.Session()

    def _call(self, *command: Any) -> Any:
        response = self._session.post(self._endpoint, headers=self._headers, json=list(command), timeout=30)
        response.raise_for_status()
        return response.json().get("result")

    def batch(self, commands: List[tuple]) -> List[Any]:
        """Run many commands in a few round trips through Upstash's /pipeline endpoint."""
        results: List[Any] = []
        for start in range(0, len(commands), PIPELINE_CHUNK):
            chunk = [list(command) for command in commands[start:start + PIPELINE_CHUNK]]
            response = self._session.post(f"{self._endpoint}/pipeline", headers=self._headers, json=chunk, timeout=60)
            response.raise_for_status()
            for item in response.json():
                if "error" in item:
                    raise RuntimeError(f"Upstash command failed: {item['error']}")
                results.append(item.get("result"))
        return results

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

    def ltrim(self, key: str, start: int, stop: int) -> None:
        self._call("LTRIM", key, start, stop)


def connect_redis() -> Any:
    """Upstash REST when configured (the app's Redis), else a plain REDIS_URL connection."""
    upstash_url = os.getenv("UPSTASH_REDIS_REST_URL")
    upstash_token = os.getenv("UPSTASH_REDIS_REST_TOKEN")
    if upstash_url and upstash_token and not os.getenv("REDIS_URL"):
        return UpstashRedis(upstash_url, upstash_token)
    return redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"), decode_responses=True)


def connect_redis_all() -> List[Any]:
    """The app's Redis plus the optional second Upstash, so events written there still reach DuckDB."""
    clients: List[Any] = [connect_redis()]
    secondary_url = os.getenv("UPSTASH_REDIS_REST_URL_2")
    secondary_token = os.getenv("UPSTASH_REDIS_REST_TOKEN_2")
    if secondary_url and secondary_token:
        clients.append(UpstashRedis(secondary_url, secondary_token))
    return clients


def is_event_list_key(r: redis.Redis, key: str) -> bool:
    """True for a per-document event list; the learned-format map is a string key."""
    if key.startswith("behavior:formats:"):
        return False
    return r.type(key) == "list"


def collect_events(r: redis.Redis, key: str) -> List[Dict[str, Any]]:
    """Read (without deleting) every parseable event in one list key."""
    return read_event_list(r, key)[1]


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
        duckdb_store.normalize_genre(event.get("genre")),
    )


def read_event_list(r: redis.Redis, key: str) -> tuple:
    """Read (without deleting) a list key: (how many items it held, the parseable events)."""
    raw_items = r.lrange(key, 0, -1)
    events: List[Dict[str, Any]] = []
    for raw in raw_items:
        try:
            events.append(json.loads(raw))
        except Exception:
            continue
    return len(raw_items), events


def run_batch(r: Any, commands: List[tuple]) -> List[Any]:
    """Run Redis commands in as few round trips as the client allows: Upstash's pipeline
    endpoint, a redis-py pipeline, or (simple clients) one call per command."""
    if not commands:
        return []
    if hasattr(r, "batch"):
        return r.batch(commands)
    if hasattr(r, "pipeline"):
        pipe = r.pipeline(transaction=False)
        for command in commands:
            pipe.execute_command(*command)
        return pipe.execute()
    return [getattr(r, command[0].lower())(*command[1:]) for command in commands]


def _as_text(row: Any) -> str:
    return row if isinstance(row, str) else json.dumps(row)


def drain_redis(r: Any, conn: Any) -> int:
    """Move every behavior event from one Redis into DuckDB; returns how many rows were stored.

    Batched: one KEYS, then the TYPE, LRANGE and LTRIM of all keys in a few pipelined round
    trips each, however many keys there are.
    """
    keys = [key for key in r.keys("behavior:*") if not key.startswith("behavior:formats:")]
    types = run_batch(r, [("TYPE", key) for key in keys])
    list_keys = [key for key, kind in zip(keys, types) if kind == "list"]
    contents = run_batch(r, [("LRANGE", key, 0, -1) for key in list_keys])

    rows: List[tuple] = []
    read_counts: Dict[str, int] = {}
    for key, raw_items in zip(list_keys, contents):
        raw_items = raw_items or []
        if not raw_items:
            continue
        read_counts[key] = len(raw_items)
        for raw in raw_items:
            try:
                event = json.loads(_as_text(raw))
            except Exception:
                continue
            row = event_row(event, key) if isinstance(event, dict) else None
            if row is not None:
                rows.append(row)

    # One batched insert; then each list is trimmed by exactly the events that
    # were read, so events pushed while this ran stay for the next run.
    duckdb_store.insert_rows(conn, "behavior_events", EVENT_INSERT_COLUMNS, rows)
    run_batch(r, [("LTRIM", key, count, -1) for key, count in read_counts.items()])
    return len(rows)


def run_once() -> int:
    """One aggregation pass over every configured Redis; returns events stored.

    A Redis that can't be reached is logged and skipped, so one dead backend
    never blocks the others or loses their events.
    """
    clients = connect_redis_all()
    store = duckdb_store.connect_duckdb()
    conn = store.conn
    try:
        ensure_schema(conn)
        if store.kind == "primary":
            moved = duckdb_store.sync_fallback_to_primary(conn)
            if moved:
                print(f"✅ Synced {moved} events from the DuckDB fallback into the primary.")

        total = 0
        for client in clients:
            try:
                total += drain_redis(client, conn)
            except Exception as error:
                print(f"⚠️ Skipping a Redis backend this run: {error}")
        return total
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
        try:
            count = run_once()
            if count:
                print(f"✅ Aggregation complete: {count} events inserted.")
        except Exception as error:
            # Events stay in Redis, so the next interval simply tries again.
            print(f"⚠️ Aggregation run failed, retrying in {interval}s: {error}")
        time.sleep(interval)


if __name__ == "__main__":
    main()
