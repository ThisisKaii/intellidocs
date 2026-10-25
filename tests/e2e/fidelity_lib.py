"""Pure comparison helpers for the import fidelity check (no browser, no server).

An imported document is compared page by page with a reference rendering of the
original (the PNGs in tests/fixtures/import_baselines/reference_screenshots and
the original PDF's text). Pixel-identical output is impossible because browsers
and Word rasterise fonts differently, so "1:1" is judged by three things:
the same number of pages, the same words on the same pages, and a high
layout similarity between the page images.

Layout similarity deliberately ignores how glyphs are rasterised: both pages are
shrunk until every line of text is a grey bar, blurred, and correlated while
allowing a few pixels of shift. A plain pixel SSIM was tried first and could not
tell a correct page from a wrong one (0.42 for both), because sub-pixel text
differences dominate it.
"""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

import cv2
import numpy as np

# Page images are compared at this width (height follows the reference aspect).
COMPARE_WIDTH = 800
# Pages are compared at this width, blurred by this much, searching this many pixels of shift.
LAYOUT_WIDTH = 200
LAYOUT_BLUR = 1.5
LAYOUT_SHIFT = 4
# Targets for a page to count as a match.
TEXT_TARGET = 0.97
LAYOUT_TARGET = 0.85

_WORD = re.compile(r"[a-z0-9]+")


def normalize_words(text: str) -> list[str]:
    """Lower-case alphanumeric words, so spacing, case and punctuation never matter."""
    return _WORD.findall(text.lower())


def sequence_ratio(reference: Sequence[str], actual: Sequence[str]) -> float:
    """Order-aware similarity of two word lists in [0, 1]; two empty pages count as equal."""
    if not reference and not actual:
        return 1.0
    if not reference or not actual:
        return 0.0
    return difflib.SequenceMatcher(None, list(reference), list(actual), autojunk=False).ratio()


def _without_page_numbers(words: Sequence[str]) -> list[str]:
    """Drop bare numbers at the start and end of a page: a printed page number is not page content."""
    trimmed = list(words)
    while trimmed and trimmed[0].isdigit():
        trimmed.pop(0)
    while trimmed and trimmed[-1].isdigit():
        trimmed.pop()
    return trimmed


def page_edges_match(reference: Sequence[str], actual: Sequence[str], count: int = 3) -> bool:
    """True when both pages start with the same words and end with the same words.

    This is what proves a page break landed in the same place. A page with fewer
    words than `count` is compared whole, and printed page numbers are ignored.
    """
    reference, actual = _without_page_numbers(reference), _without_page_numbers(actual)
    if not reference and not actual:
        return True
    n = min(count, len(reference), len(actual)) or 1
    return list(reference[:n]) == list(actual[:n]) and list(reference[-n:]) == list(actual[-n:])


def _gray(image: np.ndarray) -> np.ndarray:
    """A single-channel float32 copy of an image (BGR, BGRA or already gray)."""
    if image.ndim == 3:
        channels = image.shape[2]
        code = cv2.COLOR_BGRA2GRAY if channels == 4 else cv2.COLOR_BGR2GRAY
        image = cv2.cvtColor(image, code)
    return image.astype(np.float32)


def resize_to_width(image: np.ndarray, width: int = COMPARE_WIDTH) -> np.ndarray:
    """Scale an image to the given width, keeping its aspect ratio."""
    height = max(1, round(image.shape[0] * width / image.shape[1]))
    return cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA)


def layout_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """How alike the layout of two page images is, in [0, 1] (1 = same blocks in the same places).

    Both pages are converted to ink-on-black, shrunk to LAYOUT_WIDTH, blurred and
    padded to a common height (a page that is too short or long is penalised, not
    stretched). The score is the best normalised correlation over small shifts,
    measured only where either page has ink, so blank margins cannot inflate it.
    """

    def prep(image: np.ndarray) -> np.ndarray:
        gray = _gray(image)
        height = max(1, round(gray.shape[0] * LAYOUT_WIDTH / gray.shape[1]))
        small = cv2.resize(255.0 - gray, (LAYOUT_WIDTH, height), interpolation=cv2.INTER_AREA)
        return cv2.GaussianBlur(small, (0, 0), LAYOUT_BLUR)

    pa, pb = prep(a), prep(b)
    height = max(pa.shape[0], pb.shape[0])

    def pad(image: np.ndarray) -> np.ndarray:
        canvas = np.zeros((height, image.shape[1]), dtype=np.float32)
        canvas[: image.shape[0]] = image
        return canvas

    pa, pb = pad(pa), pad(pb)
    if not ((pa > 8).any() or (pb > 8).any()):
        return 1.0  # two blank pages
    best = 0.0
    for dy in range(-LAYOUT_SHIFT, LAYOUT_SHIFT + 1):
        for dx in range(-LAYOUT_SHIFT, LAYOUT_SHIFT + 1):
            shifted = cv2.warpAffine(pb, np.float32([[1, 0, dx], [0, 1, dy]]), (pb.shape[1], pb.shape[0]))
            mask = (pa > 8) | (shifted > 8)
            if not mask.any():
                continue
            x, y = pa[mask], shifted[mask]
            x, y = x - x.mean(), y - y.mean()
            denom = float(np.linalg.norm(x) * np.linalg.norm(y)) + 1e-6
            best = max(best, float((x * y).sum() / denom))
    return min(1.0, best)


def side_by_side(reference: np.ndarray, actual: np.ndarray, label: str) -> np.ndarray:
    """A single image: the reference page on the left, the imported page on the right, with a caption."""
    ref, act = resize_to_width(reference, 600), resize_to_width(actual, 600)
    height = max(ref.shape[0], act.shape[0])

    def canvas(img: np.ndarray) -> np.ndarray:
        if img.ndim == 2:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        elif img.shape[2] == 4:
            img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
        out = np.full((height, 600, 3), 255, dtype=np.uint8)
        out[: img.shape[0]] = img
        return out

    gap = np.full((height, 8, 3), 160, dtype=np.uint8)
    body = cv2.hconcat([canvas(ref), gap, canvas(act)])
    banner = np.full((28, body.shape[1], 3), 245, dtype=np.uint8)
    cv2.putText(banner, label, (8, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (30, 30, 30), 1, cv2.LINE_AA)
    return cv2.vconcat([banner, body])


@dataclass
class PageResult:
    """How one imported page compares with its reference page."""

    index: int
    text_ratio: float
    layout: float
    edges_match: bool

    @property
    def ok(self) -> bool:
        return self.text_ratio >= TEXT_TARGET and self.layout >= LAYOUT_TARGET and self.edges_match


@dataclass
class DocumentResult:
    """The fidelity result of one imported file."""

    name: str
    reference_pages: int
    imported_pages: int
    pages: list[PageResult] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def page_count_ok(self) -> bool:
        return self.reference_pages == self.imported_pages

    @property
    def ok_pages(self) -> int:
        return sum(1 for page in self.pages if page.ok)

    @property
    def ok(self) -> bool:
        return self.page_count_ok and self.ok_pages == len(self.pages) == self.reference_pages


def compare_pages(
    reference_images: Sequence[np.ndarray],
    reference_words: Sequence[Sequence[str]],
    actual_images: Sequence[np.ndarray],
    actual_words: Sequence[Sequence[str]],
) -> list[PageResult]:
    """Compare page i of the reference with page i of the import, for every page the reference has.

    A page the import lacks scores zero, so a missing or extra page can never hide behind averages.
    """
    results: list[PageResult] = []
    for i in range(len(reference_images)):
        have = i < len(actual_images)
        ref_words = list(reference_words[i]) if i < len(reference_words) else []
        act_words = list(actual_words[i]) if have and i < len(actual_words) else []
        results.append(
            PageResult(
                index=i + 1,
                text_ratio=sequence_ratio(ref_words, act_words),
                layout=layout_similarity(reference_images[i], actual_images[i]) if have else 0.0,
                edges_match=page_edges_match(ref_words, act_words) if have else False,
            )
        )
    return results


def summary_table(results: Sequence[DocumentResult]) -> str:
    """A plain-text table of every document: pages, matching pages, and the worst page."""
    lines = [f"{'document':<52} {'pages ref/got':>13} {'pages ok':>9} {'worst layout':>11} {'worst text':>11}"]
    for doc in results:
        worst_layout = min((p.layout for p in doc.pages), default=0.0)
        worst_text = min((p.text_ratio for p in doc.pages), default=0.0)
        lines.append(
            f"{doc.name[:52]:<52} {doc.reference_pages:>6}/{doc.imported_pages:<6} "
            f"{doc.ok_pages:>4}/{len(doc.pages):<4} {worst_layout:>11.3f} {worst_text:>11.3f}"
        )
    return "\n".join(lines)


def read_image(path: Path) -> np.ndarray:
    """Read an image file (paths with non-ASCII characters included)."""
    data = np.fromfile(str(path), dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Cannot read image {path}")
    return image


def write_image(path: Path, image: np.ndarray) -> None:
    """Write a PNG (paths with non-ASCII characters included)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    ok, encoded = cv2.imencode(".png", image)
    if not ok:
        raise ValueError(f"Cannot encode image for {path}")
    encoded.tofile(str(path))
