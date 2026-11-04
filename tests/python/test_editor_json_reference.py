"""Helpers of tests/e2e/tools/editor_json_reference.py: picture hashing and finding the first difference."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "e2e" / "tools"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "e2e"))
from editor_json_reference import first_difference, strip_pictures  # noqa: E402


def test_pictures_become_a_hash_of_their_data_everywhere():
    value = {"html": '<img src="data:image/png;base64,iVBORw0KGgo=">', "nested": [{"src": "data:image/jpeg;base64,/9j/4AAQ"}]}
    stripped = strip_pictures(value)
    assert stripped["html"].startswith('<img src="data:image/png;sha256,')
    assert stripped["nested"][0]["src"].startswith("data:image/jpeg;sha256,")
    assert "iVBORw0KGgo" not in str(stripped)


def test_the_same_picture_gives_the_same_hash_and_a_changed_one_does_not():
    a = strip_pictures("data:image/png;base64,AAAA")
    assert a == strip_pictures("data:image/png;base64,AAAA")
    assert a != strip_pictures("data:image/png;base64,AAAB")


def test_first_difference_points_at_the_path():
    old = {"content": [{"type": "paragraph", "attrs": {"style": "a"}}]}
    new = {"content": [{"type": "paragraph", "attrs": {"style": "b"}}]}
    assert first_difference(old, new) == "/content/0/attrs/style: 'a' vs 'b'"


def test_first_difference_reports_missing_keys_lengths_and_types():
    assert first_difference({"a": 1}, {"a": 1, "b": 2}) == "/b: missing vs 2"
    assert first_difference([1, 2], [1, 2, 3]) == ": 2 items vs 3"
    assert first_difference({"a": 1}, {"a": "1"}) == "/a: int vs str"
    assert first_difference({"a": [1, {"b": None}]}, {"a": [1, {"b": None}]}) is None
