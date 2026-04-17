import os
import duckdb


def ensure_export_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def table_exists(conn: duckdb.DuckDBPyConnection, table_name: str) -> bool:
    result = conn.execute(
        """
        SELECT COUNT(*) 
        FROM information_schema.tables 
        WHERE table_name = ?
        """,
        [table_name],
    ).fetchone()
    return bool(result and result[0] > 0)


def export_features(conn: duckdb.DuckDBPyConnection, export_dir: str) -> None:
    csv_path = os.path.join(export_dir, "formatting_features.csv")
    parquet_path = os.path.join(export_dir, "formatting_features.parquet")

    conn.execute(
        f"""
        COPY (SELECT * FROM formatting_features)
        TO '{csv_path}'
        (HEADER, DELIMITER ',');
        """
    )

    conn.execute(
        f"""
        COPY (SELECT * FROM formatting_features)
        TO '{parquet_path}'
        (FORMAT PARQUET);
        """
    )

    print(f"✅ Exported CSV: {csv_path}")
    print(f"✅ Exported Parquet: {parquet_path}")


def main() -> None:
    duckdb_path = os.getenv("DUCKDB_PATH", "db/duckdb/behavior.duckdb")
    export_dir = os.getenv("FEATURE_EXPORT_DIR", "db/duckdb/exports")

    ensure_export_dir(export_dir)

    conn = duckdb.connect(duckdb_path)
    if not table_exists(conn, "formatting_features"):
        conn.close()
        raise RuntimeError("formatting_features table does not exist.")

    export_features(conn, export_dir)
    conn.close()


if __name__ == "__main__":
    main()