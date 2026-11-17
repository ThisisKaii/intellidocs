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


# ─── Shrinking the stored copies ─────────────────────────────────────────────

import pymupdf  # noqa: E402


def _png(width: int, height: int, alpha: int) -> bytes:
    """A noisy picture (so it does not compress to nothing), with a uniform alpha when alpha < 256."""
    import random

    rng = random.Random(7)
    channels = 4 if alpha < 256 else 3
    samples = bytearray()
    for _ in range(width * height):
        samples += bytes(rng.randrange(256) for _ in range(3))
        if channels == 4:
            samples.append(alpha)
    pix = pymupdf.Pixmap(pymupdf.csRGB, width, height, bytes(samples), channels == 4)
    return pix.tobytes("png")


def test_a_wide_opaque_picture_is_narrowed_and_loses_its_unused_transparency():
    data = _png(1600, 200, alpha=255)
    small, mime = converted_images.shrink_picture(data, "image/png")
    pix = pymupdf.Pixmap(small)
    assert (pix.width, pix.height) == (converted_images.MAX_PICTURE_WIDTH, 125)
    assert not pix.alpha
    assert len(small) < len(data)
    assert mime in ("image/png", "image/jpeg", "image/webp")


def test_a_picture_that_uses_transparency_keeps_it():
    small, mime = converted_images.shrink_picture(_png(300, 100, alpha=128), "image/png")
    assert pymupdf.Pixmap(small).alpha
    assert mime in ("image/png", "image/webp")


def test_a_small_picture_never_grows_and_odd_formats_are_left_alone():
    data = _png(200, 100, alpha=256)
    small, _ = converted_images.shrink_picture(data, "image/png")
    assert len(small) <= len(data)
    assert converted_images.shrink_picture(b"GIF89a....", "image/gif") == (b"GIF89a....", "image/gif")
    assert converted_images.shrink_picture(b"not a picture", "image/png") == (b"not a picture", "image/png")


def test_the_manifest_lists_the_shrunk_size_and_type(tmp_path, monkeypatch):
    monkeypatch.setattr(converted_images, "ROOT", tmp_path)
    data = _png(1600, 200, alpha=255)
    out = converted_images.externalise({"html": f'<img src="{_uri("image/png", data)}">'})
    [image] = out["images"]
    stored, mime = converted_images.read_image(out["image_set"], image["key"])
    assert image["bytes"] == len(stored) < len(data)
    assert image["mime"] == mime
    assert pymupdf.Pixmap(stored).width == converted_images.MAX_PICTURE_WIDTH


def test_an_animated_gif_is_kept_whole():
    animated = b"GIF89a" + b"\x00" * 20 + b"NETSCAPE2.0" + b"\x00" * 20
    assert converted_images.shrink_picture(animated, "image/gif") == (animated, "image/gif")
