"""Numbered headings take the outline level their number gives ("1.0" top level, "1.1" second)."""
import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml"))

import main  # noqa: E402


def predict(text: str, **fields) -> str:
    return asyncio.run(main.predict_format_core(main.PredictRequest(text=text, genre="general", **fields))).predicted_format


@pytest.mark.parametrize("text", ["1.0 Introduction", "2.0 Review of Related Literature", "1. Introduction", "Chapter 1 Introduction"])
def test_top_level_numbers_are_heading1(text: str) -> None:
    assert predict(text) == "heading1"


def test_second_level_number_is_heading2() -> None:
    assert predict("1.1 Background of the Study", previous_format="heading1") == "heading2"
