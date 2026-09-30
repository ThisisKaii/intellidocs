"""
pytest tests for the section 3 behavior pipeline.

Covers the full structured-object path: the event payload must survive the
Redis -> DuckDB hop in aggregator.py, and feature_extractor.py must derive the
table / image / callout features from it.
"""
import json
import os
import sys

import duckdb
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../ml'))

import aggregator
import feature_extractor


def _event(action, ts, payload=None, block_id=None):
    """Build one stored behavior event payload row."""
    return {
        "userId": "u1",
        "documentId": "d1",
        "action": action,
        "timestamp": ts,
        "blockId": block_id,
        "payload": payload,
    }


SAMPLE_EVENTS = [
    _event("insert_table", "2026-01-01T10:00:00Z", {
        "contextNode": "table",
        "tableRows": 3,
        "tableCols": 4,
        "tableAlignment": "center",
        "tableHasHeader": True,
    }, block_id="b1"),
    _event("table_row_add", "2026-01-01T10:01:00Z", {"tableRows": 4, "tableCols": 4}),
    _event("insert_image", "2026-01-01T10:02:00Z", {
        "imageWidth": 400,
        "imageHeight": 300,
        "imageAlignment": "center",
    }),
    _event("image_resize", "2026-01-01T10:03:00Z", {"imageWidth": 600, "imageHeight": 450}),
    _event("bold", "2026-01-01T10:04:00Z", {"text": "hello", "bold": True}),
    _event("callout_insert", "2026-01-01T10:05:00Z", {"blockType": "warning"}),
    # A payload-less event must not break extraction for the whole batch.
    _event("code_block_insert", "2026-01-01T10:06:00Z"),
]


@pytest.fixture()
def conn():
    """An in-memory DuckDB seeded with the sample events."""
    connection = duckdb.connect(":memory:")
    aggregator.ensure_schema(connection)
    for e in SAMPLE_EVENTS:
        connection.execute(
            """
            INSERT INTO behavior_events
              (user_id, document_id, action, event_ts, event_ts_raw, source_key,
               payload, block_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                e["userId"],
                e["documentId"],
                e["action"],
                aggregator.parse_timestamp(e["timestamp"]),
                e["timestamp"],
                "behavior:u1:d1",
                json.dumps(e["payload"]) if e["payload"] is not None else None,
                e["blockId"],
            ],
        )
    feature_extractor.ensure_feature_table(connection)
    yield connection
    connection.close()


def _features(connection):
    """Run the extractor and return the single row as a name -> value dict."""
    rows = feature_extractor.extract_features(connection)
    assert len(rows) == 1
    order = feature_extractor.feature_column_order()
    select_list = ", ".join(order)
    values = connection.execute(
        f"SELECT {select_list} FROM {feature_extractor.FEATURE_TABLE}"
    ).fetchone() if feature_extractor.overwrite_features(connection, rows) else None
    return dict(zip(order, values))


class TestAggregatorSchema:
    """aggregator.py must persist the payload, not just the action name."""

    def test_payload_column_exists(self, conn):
        cols = [r[1] for r in conn.execute("PRAGMA table_info(behavior_events)").fetchall()]
        assert "payload" in cols

    def test_block_id_column_exists(self, conn):
        cols = [r[1] for r in conn.execute("PRAGMA table_info(behavior_events)").fetchall()]
        assert "block_id" in cols

    def test_all_events_ingested(self, conn):
        assert conn.execute("SELECT count(*) FROM behavior_events").fetchone()[0] == len(SAMPLE_EVENTS)

    def test_table_payload_round_trips(self, conn):
        raw = conn.execute(
            "SELECT payload FROM behavior_events WHERE action = 'insert_table'"
        ).fetchone()[0]
        parsed = json.loads(raw)
        assert parsed["tableRows"] == 3
        assert parsed["tableCols"] == 4
        assert parsed["tableAlignment"] == "center"
        assert parsed["tableHasHeader"] is True

    def test_block_id_persisted(self, conn):
        block_id = conn.execute(
            "SELECT block_id FROM behavior_events WHERE action = 'insert_table'"
        ).fetchone()[0]
        assert block_id == "b1"

    def test_parse_timestamp_handles_zulu_suffix(self):
        assert aggregator.parse_timestamp("2026-01-01T10:00:00Z") is not None

    def test_parse_timestamp_returns_none_for_garbage(self):
        assert aggregator.parse_timestamp("not-a-date") is None


class TestFeatureExtractorSchema:
    """ensure_feature_table must be safe to re-run against an existing db."""

    def test_media_columns_created(self, conn):
        cols = [r[1] for r in conn.execute(
            f"PRAGMA table_info({feature_extractor.FEATURE_TABLE})"
        ).fetchall()]
        for column, _ in feature_extractor.MEDIA_COLUMNS:
            assert column in cols

    def test_payload_aggregate_columns_created(self, conn):
        cols = [r[1] for r in conn.execute(
            f"PRAGMA table_info({feature_extractor.FEATURE_TABLE})"
        ).fetchall()]
        for column, _, _ in feature_extractor.PAYLOAD_AGGREGATES:
            assert column in cols

    def test_ensure_feature_table_is_idempotent(self, conn):
        feature_extractor.ensure_feature_table(conn)
        feature_extractor.ensure_feature_table(conn)
        cols = [r[1] for r in conn.execute(
            f"PRAGMA table_info({feature_extractor.FEATURE_TABLE})"
        ).fetchall()]
        assert len(cols) == len(set(cols))


class TestFeatureExtraction:
    """Structured-object features must be derived from the stored payloads."""

    def test_row_width_matches_column_order(self, conn):
        rows = feature_extractor.extract_features(conn)
        assert len(rows[0]) == len(feature_extractor.feature_column_order())

    def test_total_events_counted(self, conn):
        assert _features(conn)["total_events"] == len(SAMPLE_EVENTS)

    @pytest.mark.parametrize("column,action", feature_extractor.MEDIA_COLUMNS)
    def test_each_media_action_counted(self, conn, column, action):
        expected = sum(1 for e in SAMPLE_EVENTS if e["action"] == action)
        assert _features(conn)[column] == expected

    def test_text_features_still_counted(self, conn):
        got = _features(conn)
        assert got["bold_count"] == 1
        assert got["code_block_count"] == 0

    def test_image_dimensions_averaged(self, conn):
        got = _features(conn)
        assert got["avg_image_width"] == pytest.approx(500.0)
        assert got["avg_image_height"] == pytest.approx(375.0)

    def test_table_shape_maxima(self, conn):
        got = _features(conn)
        assert got["max_table_rows"] == pytest.approx(4.0)
        assert got["max_table_cols"] == pytest.approx(4.0)

    def test_last_action_recorded(self, conn):
        assert _features(conn)["last_action"] == "code_block_insert"

    def test_malformed_payload_does_not_abort_extraction(self, conn):
        conn.execute(
            """
            INSERT INTO behavior_events
              (user_id, document_id, action, event_ts, event_ts_raw, source_key, payload)
            VALUES ('u1', 'd1', 'insert_image', now(), 'raw', 'k', '{not json')
            """
        )
        got = _features(conn)
        assert got["image_insert_count"] == 2
        assert got["avg_image_width"] == pytest.approx(500.0)


class TestEmptyInput:
    """A batch with no usable events must not raise."""

    def test_extract_with_no_rows(self, conn):
        conn.execute("DELETE FROM behavior_events")
        assert feature_extractor.extract_features(conn) == []

    def test_overwrite_with_no_rows(self, conn):
        assert feature_extractor.overwrite_features(conn, []) == 0
