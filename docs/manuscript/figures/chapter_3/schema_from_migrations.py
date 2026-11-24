"""The Supabase public schema as the migrations build it: {table: [(column, type, keys)]}.

Reads db/supabase/0*.sql in order: `create table ... (...)` and `alter table ... add column ...`.
keys is "PK", "FK", "PK, FK" or "". Used by the database design figures (database_designs.py).
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
MIGRATIONS = ROOT / "db" / "supabase"

_CREATE = re.compile(r"create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?\"?(\w+)\"?\s*\((.*?)\);", re.I | re.S)
_ALTER = re.compile(r"alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?(\w+)\s+(.*?);", re.I | re.S)
_ADD = re.compile(r"add\s+column\s+(?:if\s+not\s+exists\s+)?\"?(\w+)\"?\s+([^,]+)", re.I)
_TYPE = re.compile(r"^(double precision|timestamp with time zone|character varying\(\d+\)|\w+(?:\(\s*\d+(?:\s*,\s*\d+)?\s*\))?(?:\[\])?)", re.I)


def _split_columns(body: str) -> list[str]:
    """Top-level comma-separated parts of a create-table body."""
    parts, depth, current = [], 0, []
    for ch in body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(current))
            current = []
        else:
            current.append(ch)
    parts.append("".join(current))
    return [re.sub(r"--[^\n]*", "", p).strip() for p in parts if re.sub(r"--[^\n]*", "", p).strip()]


def _type_of(definition: str) -> str:
    found = _TYPE.match(definition.strip())
    kind = found.group(1).lower() if found else definition.split()[0].lower()
    return {"timestamp with time zone": "timestamptz", "double precision": "float", "int": "integer",
            "int4": "integer", "int8": "bigint"}.get(kind, kind).replace(" ", "")


def load_schema() -> dict[str, list[tuple[str, str, str]]]:
    tables: dict[str, dict[str, list[str]]] = {}
    order: dict[str, list[str]] = {}

    def add(table: str, column: str, definition: str) -> None:
        cols = tables.setdefault(table, {})
        if column not in cols:
            order.setdefault(table, []).append(column)
        keys: list[str] = []
        if re.search(r"\bprimary\s+key\b", definition, re.I):
            keys.append("PK")
        if re.search(r"\breferences\b", definition, re.I):
            keys.append("FK")
        cols[column] = [_type_of(definition), *keys]

    for path in sorted(MIGRATIONS.glob("0*.sql")):
        sql = re.sub(r"--[^\n]*", "", path.read_text(encoding="utf-8"))
        for match in _CREATE.finditer(sql):
            table, body = match.group(1).lower(), match.group(2)
            for part in _split_columns(body):
                head = part.split()[0].lower().strip('"')
                if head in ("constraint", "primary", "unique", "foreign", "check", "exclude"):
                    pk = re.search(r"primary\s+key\s*\(([^)]*)\)", part, re.I)
                    for column in (pk.group(1).split(",") if pk else []):
                        column = column.strip().strip('"').lower()
                        if column in tables.get(table, {}) and "PK" not in tables[table][column]:
                            tables[table][column].insert(1, "PK")
                    fk = re.search(r"foreign\s+key\s*\(([^)]*)\)", part, re.I)
                    for column in (fk.group(1).split(",") if fk else []):
                        column = column.strip().strip('"').lower()
                        if column in tables.get(table, {}) and "FK" not in tables[table][column]:
                            tables[table][column].append("FK")
                    continue
                add(table, head, part[len(part.split()[0]):])
        for match in _ALTER.finditer(sql):
            table = match.group(1).lower()
            if table not in tables:
                continue
            for column, definition in _ADD.findall(match.group(2)):
                add(table, column.lower(), definition)

    result: dict[str, list[tuple[str, str, str]]] = {}
    for table, columns in tables.items():
        result[table] = [(c, tables[table][c][0], ", ".join(k for k in ("PK", "FK") if k in tables[table][c][1:]))
                         for c in order[table]]
    return result


if __name__ == "__main__":
    for table, columns in sorted(load_schema().items()):
        print(f"== {table} ({len(columns)})")
        for column, kind, keys in columns:
            print(f"   {column:28s} {kind:16s} {keys}")
