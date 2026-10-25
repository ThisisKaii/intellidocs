import os
import json
from typing import List, Optional, Tuple

import duckdb

import duckdb_store


FEATURE_TABLE = "formatting_features"

# Structured-object columns added for full-spectrum behavioral learning. Each
# maps to one behavior action so the ML layer can learn table/image/callout
# habits alongside the plain text-format ones.
MEDIA_COLUMNS: List[Tuple[str, str]] = [
    # (column name, action it counts)
    ("table_insert_count", "insert_table"),
    ("table_row_add_count", "table_row_add"),
    ("table_col_add_count", "table_col_add"),
    ("table_alignment_count", "table_alignment_change"),
    ("table_header_toggle_count", "table_header_toggle"),
    ("image_insert_count", "insert_image"),
    ("image_resize_count", "image_resize"),
    ("image_alignment_count", "image_alignment"),
    ("image_caption_count", "image_caption_add"),
    ("callout_insert_count", "callout_insert"),
    ("blockquote_indent_count", "blockquote_indent"),
    ("code_block_insert_count", "code_block_insert"),
]


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

    # Structured-object counters plus the numeric aggregates pulled out of the
    # stored event payloads. Kept separate from the CREATE because CREATE TABLE
    # IF NOT EXISTS cannot backfill columns on an existing database.
    for column, _ in MEDIA_COLUMNS:
        conn.execute(f"ALTER TABLE {FEATURE_TABLE} ADD COLUMN IF NOT EXISTS {column} INTEGER")
    for column in ("avg_image_width", "avg_image_height", "max_table_rows", "max_table_cols"):
        conn.execute(f"ALTER TABLE {FEATURE_TABLE} ADD COLUMN IF NOT EXISTS {column} DOUBLE")


# Ordered feature columns written to formatting_features. The base text-format
# features come first, then the structured-object counters, then the numeric
# aggregates derived from the stored event payloads. extract_features() and
# overwrite_features() both build their SQL from this list, so the SELECT and
# the INSERT can never drift out of alignment.
BASE_ACTION_COLUMNS: List[Tuple[str, str]] = [
    ("bold_count", "bold"),
    ("italic_count", "italic"),
    ("underline_count", "underline"),
    ("heading1_count", "heading1"),
    ("heading2_count", "heading2"),
    ("heading3_count", "heading3"),
    ("ordered_list_count", "ordered_list"),
    ("unordered_list_count", "unordered_list"),
    ("blockquote_count", "blockquote"),
    ("code_block_count", "code_block"),
]

# (feature column, JSON path inside the stored event payload)
PAYLOAD_AGGREGATES: List[Tuple[str, str, str]] = [
    ("avg_image_width", "$.imageWidth", "AVG"),
    ("avg_image_height", "$.imageHeight", "AVG"),
    ("max_table_rows", "$.tableRows", "MAX"),
    ("max_table_cols", "$.tableCols", "MAX"),
]

TRAILING_COLUMNS = [
    "last_action",
    "last_event_ts",
    "window_start",
    "window_end",
]


def feature_column_order() -> List[str]:
    """Every column of formatting_features, in the order rows are produced."""
    return (
        ["user_id", "document_id", "total_events"]
        + [name for name, _ in BASE_ACTION_COLUMNS]
        + [name for name, _ in MEDIA_COLUMNS]
        + [name for name, _, _ in PAYLOAD_AGGREGATES]
        + TRAILING_COLUMNS
    )


def _count_expr(column: str, action: str) -> str:
    return f"SUM(CASE WHEN action = '{action}' THEN 1 ELSE 0 END) AS {column}"


def _aggregate_expr(column: str, path: str, fn: str) -> str:
    # TRY_CAST twice: JSON first so a malformed payload yields NULL instead of
    # aborting the whole extraction, then DOUBLE for the numeric comparison.
    value = f"TRY_CAST(json_extract_string(TRY_CAST(payload AS JSON), '{path}') AS DOUBLE)"
    return f"{fn}({value}) AS {column}"


def extract_features(conn: duckdb.DuckDBPyConnection) -> List[Tuple]:
    counts = [_count_expr(name, action) for name, action in BASE_ACTION_COLUMNS]
    counts += [_count_expr(name, action) for name, action in MEDIA_COLUMNS]
    aggregates = [_aggregate_expr(name, path, fn) for name, path, fn in PAYLOAD_AGGREGATES]

    query = f"""
    SELECT
      user_id,
      document_id,
      COUNT(*) AS total_events,
      {",\n      ".join(counts)},
      {",\n      ".join(aggregates)},
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

    columns = feature_column_order()
    placeholders = ", ".join("?" for _ in columns)
    conn.executemany(
        f"INSERT INTO {FEATURE_TABLE} ({', '.join(columns)}) VALUES ({placeholders})",
        rows,
    )
    return len(rows)


def main() -> None:
    conn = duckdb_store.connect_duckdb().conn
    ensure_feature_table(conn)

    rows = extract_features(conn)
    count = overwrite_features(conn, rows)

    conn.close()
    print(f"✅ Feature extraction complete: {count} rows written.")


if __name__ == "__main__":
    main()
