"""A conversion's pictures can travel beside its JSON instead of inside it (large manuscripts)."""
import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml" / "src"))

import converted_images  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"pixels" * 10
GIF = b"GIF89a" + b"frames" * 10


def _uri(mime: str, data: bytes) -> str:
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def test_pictures_become_tokens_and_identical_ones_share_a_key(tmp_path, monkeypatch):
    monkeypatch.setattr(converted_images, "ROOT", tmp_path)
    png, gif = _uri("image/png", PNG), _uri("image/gif", GIF)
    result = {
        "html": f'<p><img src="{png}"></p><p><img src="{gif}"></p>',
        "content_json": {"type": "doc", "content": [{"type": "image", "attrs": {"src": png}}]},
        "page_art": {"repeat": f'<div style="background:url({gif})"></div>', "pages": {}},
        "header": "",
    }
    out = converted_images.externalise(result)

    assert "data:image/" not in str(out)
    assert len(out["images"]) == 2
    keys = {image["mime"]: image["key"] for image in out["images"]}
    assert out["html"] == f'<p><img src="idoc-image:{keys["image/png"]}"></p><p><img src="idoc-image:{keys["image/gif"]}"></p>'
    assert out["content_json"]["content"][0]["attrs"]["src"] == f"idoc-image:{keys['image/png']}"
    assert {image["key"]: image["bytes"] for image in out["images"]} == {keys["image/png"]: len(PNG), keys["image/gif"]: len(GIF)}

    assert converted_images.read_image(out["image_set"], keys["image/png"]) == (PNG, "image/png")
    assert converted_images.read_image(out["image_set"], keys["image/gif"]) == (GIF, "image/gif")

    converted_images.release(out["image_set"])
    assert converted_images.read_image(out["image_set"], keys["image/png"]) is None


def test_unknown_or_unsafe_ids_read_nothing(tmp_path, monkeypatch):
    monkeypatch.setattr(converted_images, "ROOT", tmp_path)
    out = converted_images.externalise({"html": f'<img src="{_uri("image/png", PNG)}">'})
    key = out["images"][0]["key"]
    assert converted_images.read_image("../" + out["image_set"][3:], key) is None
    assert converted_images.read_image(out["image_set"], "0" * 32) is None


def test_a_document_without_pictures_has_an_empty_list(tmp_path, monkeypatch):
    monkeypatch.setattr(converted_images, "ROOT", tmp_path)
    out = converted_images.externalise({"html": "<p>text</p>"})
    assert out["html"] == "<p>text</p>" and out["images"] == []
