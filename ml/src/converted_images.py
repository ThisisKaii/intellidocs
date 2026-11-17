"""Pictures of a converted document, sent beside its JSON instead of inside it.

A converted document carries every picture as a base64 data URI, often twice (in the HTML and in
the editor JSON). A large manuscript's response then outgrows what the server can hold as one
string (Node caps strings at ~512 MB). `externalise` swaps each picture for an `idoc-image:<key>`
token and writes its bytes to a temp folder; the server fetches them one at a time, stores them and
puts their URLs in place of the tokens.

Each picture is also shrunk for storage (`shrink_picture`): at most MAX_PICTURE_WIDTH pixels wide,
an unused transparency channel dropped, and saved in whichever format is smallest. A 1,447-page
thesis's 1,489 pictures go from 204 MB to about 80 MB. Only the stored copy changes: the converter's
HTML and its layout (picture sizes on the page) are untouched.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import shutil
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(tempfile.gettempdir()) / "intellidocs-converted-images"
# A set the server never fetched (it crashed, or the request was abandoned) is removed after this.
MAX_AGE_S = 30 * 60

_DATA_URI = re.compile(r"data:(image/[\w.+-]+);base64,([A-Za-z0-9+/=]+)")
_SAFE_ID = re.compile(r"^[0-9a-f]{32}$")
TOKEN_PREFIX = "idoc-image:"

# The text of a page is about 6.3 in wide: 1,000 px still prints at about 150 dpi across it.
MAX_PICTURE_WIDTH = 1000
JPEG_QUALITY = 85
# Raster formats that can be re-encoded (a GIF only when it is a still picture). Vector and Office
# formats (SVG, EMF, WMF) are shown as they are.
_SHRINKABLE = {"image/png", "image/jpeg", "image/jpg", "image/bmp", "image/tiff", "image/webp", "image/gif"}


def _webp_encoder() -> Any:
    """Pillow's WebP encoder when Pillow is installed with WebP support, else None."""
    try:
        from PIL import Image, features  # type: ignore[import-not-found]

        return Image if features.check("webp") else None
    except Exception:
        return None


_WEBP = _webp_encoder()


def shrink_picture(data: bytes, mime: str) -> Tuple[bytes, str]:
    """A picture made small for storage, with its type: no wider than MAX_PICTURE_WIDTH (height in
    proportion), without a transparency channel nothing uses, as the smallest of PNG, JPEG (quality
    JPEG_QUALITY) and, with Pillow, WebP. A picture that cannot be read, or would not get smaller
    without being resized, is returned as it is."""
    if mime.lower() not in _SHRINKABLE:
        return data, mime
    # A looping animation carries the NETSCAPE2.0 extension; re-encoding would keep one frame.
    if mime.lower() == "image/gif" and b"NETSCAPE2.0" in data:
        return data, mime
    try:
        import pymupdf

        pix = pymupdf.Pixmap(data)
        if pix.alpha:
            alpha = pix.samples[pix.n - 1 :: pix.n]
            if min(alpha) == 255:
                pix = pymupdf.Pixmap(pix, 0)  # opaque: the channel only adds weight
        if pix.colorspace is not None and pix.colorspace.n > 3:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        resized = pix.width > MAX_PICTURE_WIDTH
        if resized:
            pix = pymupdf.Pixmap(pix, MAX_PICTURE_WIDTH, max(1, round(pix.height * MAX_PICTURE_WIDTH / pix.width)))
        candidates = [(pix.tobytes("png"), "image/png")]
        if not pix.alpha:
            candidates.append((pix.tobytes("jpeg", jpg_quality=JPEG_QUALITY), "image/jpeg"))
        if _WEBP is not None:
            image = _WEBP.frombytes("RGBA" if pix.alpha else "RGB", (pix.width, pix.height), pix.samples)
            buffer = io.BytesIO()
            image.save(buffer, "WEBP", quality=JPEG_QUALITY)
            candidates.append((buffer.getvalue(), "image/webp"))
        if not resized:
            candidates.append((data, mime))
        return min(candidates, key=lambda candidate: len(candidate[0]))
    except Exception:
        return data, mime


def _sweep(now: float) -> None:
    """Remove image sets older than MAX_AGE_S."""
    if not ROOT.exists():
        return
    for folder in ROOT.iterdir():
        try:
            if now - folder.stat().st_mtime > MAX_AGE_S:
                shutil.rmtree(folder, ignore_errors=True)
        except OSError:
            pass


def externalise(result: Dict[str, Any]) -> Dict[str, Any]:
    """The result with every data-URI picture replaced by a token, plus `image_set` and `images`.

    Identical pictures share one key. A result without pictures is returned with an empty list.
    """
    _sweep(time.time())
    set_id = uuid.uuid4().hex
    folder = ROOT / set_id
    images: Dict[str, Tuple[str, int]] = {}

    def swap(match: re.Match) -> str:
        mime, data = match.group(1), match.group(2)
        key = hashlib.sha256(f"{mime}:{data}".encode("ascii")).hexdigest()[:32]
        if key not in images:
            raw = base64.b64decode(data)
            folder.mkdir(parents=True, exist_ok=True)
            (folder / key).write_bytes(raw)
            images[key] = (mime, len(raw))
        return TOKEN_PREFIX + key

    def visit(value: Any) -> Any:
        if isinstance(value, str):
            return _DATA_URI.sub(swap, value) if "data:image/" in value else value
        if isinstance(value, list):
            return [visit(item) for item in value]
        if isinstance(value, dict):
            return {key: visit(item) for key, item in value.items()}
        return value

    out = visit(result)

    # Shrink the stored copies (PyMuPDF holds the interpreter lock, so threads would not help).
    for key, (mime, _) in list(images.items()):
        data, new_mime = shrink_picture((folder / key).read_bytes(), mime)
        (folder / key).write_bytes(data)
        images[key] = (new_mime, len(data))
    manifest: List[Dict[str, Any]] = [{"key": k, "mime": m, "bytes": n} for k, (m, n) in images.items()]
    if manifest:
        (folder / "manifest.json").write_text(json.dumps({k: m for k, (m, _) in images.items()}))
    out["image_set"] = set_id
    out["images"] = manifest
    return out


def read_image(set_id: str, key: str) -> Optional[Tuple[bytes, str]]:
    """One stored picture's bytes and type, or None when the set or key is unknown."""
    if not (_SAFE_ID.match(set_id) and _SAFE_ID.match(key)):
        return None
    folder = ROOT / set_id
    try:
        mimes = json.loads((folder / "manifest.json").read_text())
        return (folder / key).read_bytes(), mimes[key]
    except (OSError, KeyError, ValueError):
        return None


def release(set_id: str) -> None:
    """Remove a set once the server has every picture it needs."""
    if _SAFE_ID.match(set_id):
        shutil.rmtree(ROOT / set_id, ignore_errors=True)
