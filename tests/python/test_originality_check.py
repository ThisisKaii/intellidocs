"""POST /originality/check compares a document with the student's own other documents."""
import asyncio

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml", "src"))
from main import OriginalityPeer, OriginalityRequest, originality_check

SHARED = (
    "The mitochondria is the organelle responsible for producing most of the "
    "chemical energy that a eukaryotic cell needs to function properly."
)
UNIQUE = (
    "Medieval trade routes across the Silk Road connected merchants from China "
    "to the Mediterranean and carried ideas as well as goods."
)


def run(request: OriginalityRequest):
    return asyncio.run(originality_check(request))


def test_reports_verbatim_overlap_with_peer_title():
    result = run(OriginalityRequest(
        text=f"<p>{SHARED}</p><p>{UNIQUE}</p>",
        peers=[OriginalityPeer(document_id="d1", title="Biology Essay", text=f"<p>{SHARED}</p>")],
    ))
    assert len(result.passages) == 1
    passage = result.passages[0]
    assert passage.peer_document_id == "d1"
    assert passage.peer_title == "Biology Essay"
    assert passage.similarity >= 95
    assert passage.match_type == "verbatim"
    assert 40 < result.overlap_percent < 60


def test_unrelated_documents_have_no_overlap():
    result = run(OriginalityRequest(
        text=f"<p>{UNIQUE}</p>",
        peers=[OriginalityPeer(document_id="d1", title="Biology Essay", text=f"<p>{SHARED}</p>")],
    ))
    assert result.passages == []
    assert result.overlap_percent == 0


def test_no_peers_means_no_overlap():
    result = run(OriginalityRequest(text=f"<p>{SHARED}</p>", peers=[]))
    assert result.passages == []
    assert result.overlap_percent == 0
