"""Council paragraph extraction: full body coverage, no front/back matter, no double counting."""

import os

import pytest

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")

from embedding_service import extract_paragraphs  # noqa: E402

BODY = "Body paragraph {tag} is a long sentence written to exceed the fifty character minimum."


def texts(html: str) -> list[str]:
    return [text for _, text, _, _ in extract_paragraphs(html)]


def manuscript() -> str:
    html = "<h1>Table of Contents</h1><p>Chapter 1 Introduction ............................................ 1</p>"
    html += "<h1>Dedication</h1><p>To my family, who supported me through every long night of this project.</p>"
    html += "<h1>Abstract</h1><p>This abstract summarizes the study in a sentence longer than fifty characters.</p>"
    for chapter in range(1, 6):
        html += f"<h1>Chapter {chapter}</h1>"
        html += f"<h2>{chapter}.1 Background</h2>"
        html += "".join(f"<p>{BODY.format(tag=f'{chapter}-{i}')}</p>" for i in range(3))
    html += "<h1>References</h1><p>Smith, J. (2020). A reference entry that is clearly longer than fifty characters.</p>"
    html += "<h1>Bibliography</h1><p>Doe, A. (2019). Another bibliography entry that exceeds fifty characters.</p>"
    return html


def test_every_body_paragraph_from_chapter_one_to_conclusion_is_extracted():
    found = texts(manuscript())
    expected = [BODY.format(tag=f"{c}-{i}") for c in range(1, 6) for i in range(3)]
    assert found == expected


@pytest.mark.parametrize("marker", ["......", "To my family", "This abstract", "Smith, J.", "Doe, A."])
def test_front_and_back_matter_is_excluded(marker):
    assert not any(marker in text for text in texts(manuscript()))


@pytest.mark.parametrize(
    "heading",
    ["REFERENCES", "1. References", "Chapter 6 References", "VII. Bibliography", "Works Cited", "Appendix A"],
)
def test_numbered_and_uppercase_back_matter_headings_are_excluded(heading):
    html = f"<h1>Chapter 1</h1><p>{BODY.format(tag='kept')}</p><h2>{heading}</h2><p>{BODY.format(tag='dropped')}</p>"
    assert texts(html) == [BODY.format(tag="kept")]


def test_subheadings_inside_matter_do_not_end_it_but_the_next_chapter_does():
    html = "<h1>Appendices</h1><h2>Survey instrument</h2>"
    html += f"<p>{BODY.format(tag='appendix')}</p>"
    html += f"<h1>Chapter 2</h1><p>{BODY.format(tag='chapter')}</p>"
    assert texts(html) == [BODY.format(tag="chapter")]


@pytest.mark.parametrize("heading", ["Indexing Strategies", "Abstraction Layers", "Introduction", "I. Introduction"])
def test_body_headings_that_only_resemble_matter_keywords_end_the_matter_section(heading):
    html = f"<h1>Table of Contents</h1><h1>{heading}</h1><p>{BODY.format(tag='body')}</p>"
    assert texts(html) == [BODY.format(tag="body")]


def test_nested_blocks_are_extracted_once():
    html = (
        f"<ul><li><p>{BODY.format(tag='list')}</p></li></ul>"
        f"<table><tr><td><p>{BODY.format(tag='cell')}</p></td></tr></table>"
        f"<div><blockquote><p>{BODY.format(tag='quote')}</p></blockquote></div>"
        f"<li>{BODY.format(tag='bare-item')}</li>"
    )
    assert texts(html) == [BODY.format(tag=t) for t in ("list", "cell", "quote", "bare-item")]


def test_offsets_point_at_the_extracted_block():
    html = f"<h1>Chapter 1</h1><p>{BODY.format(tag='a')}</p><p>{BODY.format(tag='b')}</p>"
    for index, (para_index, text, start, end) in enumerate(extract_paragraphs(html)):
        assert para_index == index
        assert text in html[start:end]
