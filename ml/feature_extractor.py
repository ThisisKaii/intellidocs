import os
from typing import List, Tuple

import duckdb


FEATURE_TABLE = "formatting_features"


def ensure_feature_table(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute(f"""
    CREATE TABLE IF NOT EXISTS {FEATURE_TABLE} (
      user_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      total_events INTEGER,
      bold_count INTEGER,
      italic_count INTEGER,
      underline_count INTEGER,
      heading1_count INTEGER,
      heading2_count INTEGER,
      heading3_count INTEGER,
      ordered_list_count INTEGER,
      unordered_list_count INTEGER,
      blockquote_count INTEGER,
      code_block_count INTEGER,
      last_action TEXT,
      last_event_ts TIMESTAMP,
      window_start TIMESTAMP,
      window_end TIMESTAMP,
      ingested_at TIMESTAMP DEFAULT now()
    );
    """)


def extract_features(conn: duckdb.DuckDBPyConnection) -> List[Tuple]:
    query = f"""
    SELECT
      user_id,
      document_id,
      COUNT(*) AS total_events,
      SUM(CASE WHEN action = 'bold' THEN 1 ELSE 0 END) AS bold_count,
      SUM(CASE WHEN action = 'italic' THEN 1 ELSE 0 END) AS italic_count,
      SUM(CASE WHEN action = 'underline' THEN 1 ELSE 0 END) AS underline_count,
      SUM(CASE WHEN action = 'heading1' THEN 1 ELSE 0 END) AS heading1_count,
      SUM(CASE WHEN action = 'heading2' THEN 1 ELSE 0 END) AS heading2_count,
      SUM(CASE WHEN action = 'heading3' THEN 1 ELSE 0 END) AS heading3_count,
      SUM(CASE WHEN action = 'ordered_list' THEN 1 ELSE 0 END) AS ordered_list_count,
      SUM(CASE WHEN action = 'unordered_list' THEN 1 ELSE 0 END) AS unordered_list_count,
      SUM(CASE WHEN action = 'blockquote' THEN 1 ELSE 0 END) AS blockquote_count,
      SUM(CASE WHEN action = 'code_block' THEN 1 ELSE 0 END) AS code_block_count,
      arg_max(action, event_ts) AS last_action,
      max(event_ts) AS last_event_ts,
      min(event_ts) AS window_start,
      max(event_ts) AS window_end
    FROM behavior_events
    GROUP BY user_id, document_id
    """
    return conn.execute(query).fetchall()


def overwrite_features(conn: duckdb.DuckDBPyConnection, rows: List[Tuple]) -> int:
    conn.execute(f"DELETE FROM {FEATURE_TABLE}")
    if not rows:
        return 0

    conn.executemany(
        f"""
        INSERT INTO {FEATURE_TABLE} (
          user_id, document_id, total_events,
          bold_count, italic_count, underline_count,
          heading1_count, heading2_count, heading3_count,
          ordered_list_count, unordered_list_count,
          blockquote_count, code_block_count,
          last_action, last_event_ts, window_start, window_end
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    return len(rows)


def main() -> None:
    duckdb_path = os.getenv("DUCKDB_PATH", "db/duckdb/behavior.duckdb")
    conn = duckdb.connect(duckdb_path)
    ensure_feature_table(conn)

    rows = extract_features(conn)
    count = overwrite_features(conn, rows)

    conn.close()
    print(f"✅ Feature extraction complete: {count} rows written.")


if __name__ == "__main__":
    main()
