"""Tests that a table keeps its Word column widths when every row has merged (colspan) cells."""
import io
import os
import re
import sys

import docx
from docx.shared import Inches

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml", "src"))

from converter import convert_docx_bytes_to_html  # noqa: E402


def build_document(rows: list[list[int]]) -> bytes:
    """A DOCX with one 3-column table; each row lists how many grid columns each of its cells spans."""
    document = docx.Document()
    table = document.add_table(rows=len(rows), cols=3)
    for index, width in enumerate((1.0, 2.0, 2.0)):
        table.columns[index].width = Inches(width)
    for row, spans in zip(table.rows, rows):
        start = 0
        for span in spans:
            first = row.cells[start]
            merged = first.merge(row.cells[start + span - 1]) if span > 1 else first
            merged.text = f"cell {start}"
            start += span
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def column_sizes(html: str) -> list[float]:
    """The data-column-size percentages of the first table, or [] when it has none."""
    found = re.search(r'<table[^>]*data-column-size="([^"]*)"', html)
    return [float(value) for value in found.group(1).split(",")] if found else []


def test_rows_with_merged_cells_still_get_column_widths() -> None:
    """Every row is [1 cell, 1 cell spanning 2 columns]: 2 cells but 3 grid columns."""
    sizes = column_sizes(convert_docx_bytes_to_html(build_document([[1, 2], [1, 2]]))["html"])
    assert len(sizes) == 3
    assert round(sum(sizes)) == 100
    assert sizes[0] < sizes[1]  # the 1-inch column is narrower than the 2-inch ones


def test_plain_table_keeps_its_column_widths() -> None:
    """A table whose widest row has a cell per grid column is unchanged."""
    sizes = column_sizes(convert_docx_bytes_to_html(build_document([[1, 1, 1], [1, 2]]))["html"])
    assert len(sizes) == 3
