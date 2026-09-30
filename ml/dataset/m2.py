"""
Shared M2 parser and error taxonomy for the IntelliDocs grammar corpora.

M2 is the interchange format used by both the CoNLL-2014 shared task and its
successors, but it exists in two dialects that must be handled separately:

The original CoNLL dialect writes the corrected sentence explicitly and marks
edits in numbered groups::

    S the sentence as written
    T the sentence as corrected
    #0
    -<wrong token>\\t...\\t<error type>
    +<right token>\\t...\\t<error type>
    ##0

The ERRANT dialect, used by the BEA 2019 gold files, omits the T line and
reconstructs the corrected sentence by applying each edit to the source::

    S the sentence as written
    A 7 8|||Vform|||cause|||REQUIRED|||-NONE-|||0

In an A line, tokens in [start, end) are replaced by the whitespace-separated
text of field 4; an empty field or "-NONE-" means the tokens are deleted, and
start == end is a pure insertion. Indices are 0-based.

Error types differ between corpora too, so both taxonomies are mapped onto one
set of coarse categories. The 28 CoNLL-2014 tags (ArtOrDet, SVA, Mec, ...) and
the ERRANT-style R:/M:/U: codes (R:VERB:SVA, M:DET, ...) are recognised.
Some mappings below are judgement calls - CoNLL tags like Wtone and Cit do not
correspond to a grammatical category - and are marked as such. A corpus user
should not treat the coarse category as authoritative for those tags.
"""
from typing import Any


# Coarse categories shared with the grammar model. Anything that cannot be
# placed lands in "uncategorized" rather than being forced into a real class,
# because a confident wrong label is worse than an explicit unknown.
ERROR_CATEGORIES = (
    "agreement",
    "article",
    "capitalization",
    "morphology",
    "part_of_speech",
    "preposition",
    "punctuation",
    "repetition",
    "spelling",
    "uncategorized",
    "word_choice",
)

# The 28 CoNLL-2014 error types, mapped to coarse categories. Entries marked
# "loose" are judgement calls where the tag is about register, attribution or
# sentence integrity rather than a grammatical category.
CO2014_ERROR_TYPES: dict[str, str] = {
    "ArtOrDet": "article",      # article or determiner
    "Wci": "word_choice",       # wrong word choice or idiom
    "Rloc-": "preposition",     # localiser/preposition choice
    "Nn": "morphology",         # noun form
    "Vt": "morphology",         # verb tense
    "Mec": "spelling",          # mechanical typo
    "Prep": "preposition",      # preposition
    "Wform": "morphology",      # word form
    "SVA": "agreement",         # subject-verb agreement
    "Others": "uncategorized",
    "Vform": "morphology",      # verb form
    "Trans": "part_of_speech",  # word transformation/transposition
    "Um": "word_choice",        # uncertainty marker
    "Pref": "part_of_speech",   # prefix
    "Srun": "uncategorized",    # loose: run-on sentence
    "WOinc": "part_of_speech",  # incomplete word
    "Wtone": "word_choice",     # loose: tone/register
    "Cit": "uncategorized",     # loose: citation
    "Spar": "spelling",         # spelling
    "Vm": "morphology",         # verb modal
    "V0": "part_of_speech",     # base verb form
    "Ssub": "uncategorized",    # loose: subject substitution
    "WOadv": "part_of_speech",  # word/adverb
    "Npos": "part_of_speech",   # noun part of speech
    "Sfrag": "uncategorized",   # loose: sentence fragment
    "Pform": "morphology",      # possessive form
    "Wa": "morphology",         # word/article form
    "Smod": "part_of_speech",   # modal
}

# The ERRANT-style codes used by the BEA 2019 gold files, keyed by the part
# after the R:/M:/U: operation prefix.
ERRANT_ERROR_TYPES: dict[str, str] = {
    "DET": "article",
    "PREP": "preposition",
    "PUNCT": "punctuation",
    "SPELL": "spelling",
    "ORTH": "spelling",
    "MORPH": "morphology",
    "FORM": "morphology",
    "TENSE": "morphology",
    "INFL": "morphology",
    "POSS": "morphology",
    "SVA": "agreement",
    "NUM": "morphology",
    "NOUN": "part_of_speech",
    "VERB": "part_of_speech",
    "ADJ": "part_of_speech",
    "ADV": "part_of_speech",
    "PRON": "part_of_speech",
    "PART": "part_of_speech",
    "CONJ": "part_of_speech",
    "WO": "word_choice",        # word omission
    "OTHER": "uncategorized",
    "CONTR": "uncategorized",   # loose: contradiction
}

NO_ERROR_MARKER = "S"
DELETION_MARKER = "-NONE-"


# The original CoNLL MISC annotations, as shipped in the CoNLL-2014 scorer's
# own files. Checked before the ERRANT branch because those codes also start
# with "U:", and ERRANT splitting would otherwise turn "U:Art" into "Art".
CO2014_MISC_ANNOTATIONS: dict[str, str] = {
    "Morfparsik": "morphology",
    "Morfsyn": "morphology",
    "Morfor": "morphology",
    "U:xxx": "spelling",
    "U:spel": "spelling",
    "U:Prep": "preposition",
    "U:Adp": "preposition",
    "U:Art": "article",
    "U:Adva": "part_of_speech",
    "U:Noun": "part_of_speech",
    "U:Verb": "part_of_speech",
    "U:Agr": "agreement",
    "U:agr": "agreement",
    "U:Aggr": "agreement",
    "U:SVA": "agreement",
    "U:Cap": "capitalization",
    "U:Punc": "punctuation",
    "U:Int": "punctuation",
    "U:Repl": "repetition",
    "U:Word": "word_choice",
    "U:Conc": "word_choice",
    "U:Genre": "word_choice",
    "U:Dark": "word_choice",
}

# Prefixes marking an ERRANT operation (Replace, Missing, Unnecessary, Added).
ERRANT_OPERATION_PREFIXES = frozenset({"R", "M", "U", "A"})


def classify_error_type(annotation: str) -> str:
    """
    Map a corpus-specific error annotation onto a coarse category.

    The function is idempotent: a value that is already a coarse category, or
    one of the original CoNLL MISC codes used by other redistributions, is
    returned unchanged rather than being flattened to "uncategorized".
    """
    text = (annotation or "").strip()
    if not text or text in {"-", NO_ERROR_MARKER, "UNK"}:
        return "uncategorized"

    if text in ERROR_CATEGORIES:
        return text

    # The 28 CoNLL-2014 tags, matched whole.
    if text in CO2014_ERROR_TYPES:
        return CO2014_ERROR_TYPES[text]

    # Original CoNLL MISC codes, checked before ERRANT splitting because they
    # share the "U:" prefix with an ERRANT operation marker.
    for prefix, category in CO2014_MISC_ANNOTATIONS.items():
        if text.startswith(prefix):
            return category

    # ERRANT-style "R:VERB:SVA". The operation prefix is dropped and the most
    # specific trailing segment is resolved first, so VERB:SVA lands on
    # agreement rather than the generic part_of_speech of VERB.
    head, separator, tail = text.partition(":")
    if separator and head.upper() in ERRANT_OPERATION_PREFIXES and tail:
        segments = [segment for segment in tail.split(":") if segment]
        for segment in reversed(segments):
            if segment in ERRANT_ERROR_TYPES:
                return ERRANT_ERROR_TYPES[segment]
            if segment in CO2014_ERROR_TYPES:
                return CO2014_ERROR_TYPES[segment]
        # Fall back to the whole remainder before giving up.
        return classify_error_type(tail)

    return "uncategorized"


def _edit_span(annotation: str) -> tuple[int, int] | None:
    """
    Read the [start, end) token span from an ERRANT annotation.

    Returns None when the span is missing or non-numeric, which lets callers
    order edits and reject malformed ones with the same check.
    """
    span = annotation.split("|||")[0].split()
    if len(span) < 2:
        return None
    try:
        return int(span[0]), int(span[1])
    except ValueError:
        return None


def _apply_errant_edits(tokens: list[str], annotation: str) -> list[str] | None:
    """
    Apply one ERRANT A line to a token list, or None when it is unparseable.

    The annotation excludes the leading "A", so it reads
    "start end|||type|||replacement|||required|||corpus|||id". Tokens in
    [start, end) are replaced by the split replacement text; an empty
    replacement or the -NONE- marker deletes them, so start == end is a pure
    insertion.
    """
    bounds = _edit_span(annotation)
    if bounds is None:
        return None
    start, end = bounds
    if not 0 <= start <= end <= len(tokens):
        return None

    fields = annotation.split("|||")
    replacement = fields[2].strip() if len(fields) > 2 else ""
    if replacement in {"", DELETION_MARKER}:
        inserted: list[str] = []
    else:
        inserted = replacement.split()
    return tokens[:start] + inserted + tokens[end:]


def parse_m2(path: str) -> list[dict[str, str]]:
    """
    Parse an M2 file into sentence, corrected and error_type records.

    Both M2 dialects described in the module docstring are accepted. A sentence
    whose corrections cannot be applied, or whose corrected text is identical
    to the original, is dropped rather than emitted as a no-op training pair.
    """
    records: list[dict[str, str]] = []
    source: str | None = None
    target: str | None = None
    error_type: str | None = None
    pending_edits: list[str] = []
    dialect: str | None = None
    annotations = 0
    sentences = 0
    dropped: dict[str, int] = {}

    def flush() -> None:
        """Emit the sentence under construction and record why it was dropped."""
        nonlocal source, target, error_type, pending_edits, dialect
        record, reason = _finish(source, target, error_type, pending_edits, dialect)
        if record is not None:
            records.append(record)
        else:
            dropped[reason] = dropped.get(reason, 0) + 1
        source = None
        target = None
        error_type = None
        pending_edits = []
        dialect = None

    with open(path, "r", encoding="utf-8", errors="replace") as handle:
        for raw_line in handle:
            line = raw_line.rstrip("\n").rstrip("\r")
            if not line:
                continue

            if line.startswith("S "):
                if source is not None:
                    sentences += 1
                    flush()
                source = line[2:].strip()
                continue

            if line.startswith("T "):
                target = line[2:].strip()
                dialect = "coNLL"
                continue

            if line.startswith("A "):
                annotations += 1
                dialect = "errant"
                annotation = line[2:].strip()
                fields = annotation.split("|||")
                if len(fields) > 1:
                    # Keep the first annotation that maps to a real category.
                    # Taking whichever comes first would discard a whole
                    # sentence because its leading error happened to be tagged
                    # "Others" while a later one is a clear SVA or Prep.
                    candidate = classify_error_type(fields[1])
                    if candidate != "uncategorized" or error_type is None:
                        error_type = candidate
                pending_edits.append(annotation)
                continue

            if line.startswith("#") and not line.startswith("##"):
                dialect = "coNLL"
                continue

            if line.startswith("##"):
                continue

            # Edit lines of the CoNLL dialect contribute only the error type;
            # the corrected sentence is already given on the T line.
            if line.startswith("-") or line.startswith("+"):
                dialect = "coNLL"
                annotations += 1
                fields = [part.strip() for part in line.split("\t")]
                if fields and fields[-1] and fields[-1] != NO_ERROR_MARKER:
                    # As above, prefer a categorisable tag over "Others".
                    candidate = classify_error_type(fields[-1])
                    if candidate != "uncategorized" or error_type is None:
                        error_type = candidate
                continue

    if source is not None:
        sentences += 1
        flush()

    if not records:
        raise M2ParseError(
            f"No usable records parsed from {path}. Read {sentences} sentences with "
            f"{annotations} annotation lines; every one was dropped for: "
            f"{_describe_drops(dropped)}. The file may not be M2, or its dialect may "
            "be one this parser does not handle."
        )

    print(
        f"  parsed {len(records)}/{sentences} sentences from {path} "
        f"({annotations} annotations)"
    )
    if dropped:
        print(f"  dropped: {_describe_drops(dropped)}")
    return records


def _describe_drops(dropped: dict[str, int]) -> str:
    """Render drop reasons as a readable, stable-ordered summary."""
    return ", ".join(f"{count} {reason}" for reason, count in sorted(dropped.items()))


def _finish(
    source: str | None,
    target: str | None,
    error_type: str | None,
    pending_edits: list[str],
    dialect: str | None,
) -> tuple[dict[str, str] | None, str]:
    """
    Build one record, returning it with an empty reason.

    When no record can be built the reason is returned instead, so parse_m2 can
    report why sentences were dropped rather than guessing. The reasons are
    distinct failure modes: an uncategorised tag is a corpus property, an
    unapplied edit is a parser or index problem, and an unchanged correction is
    a no-op worth discarding.
    """
    if not source:
        return None, "no source sentence"
    if not pending_edits and not target:
        return None, "no annotations"
    if not error_type:
        return None, "uncategorized error type"

    if dialect == "errant":
        if not pending_edits:
            return None, "no edits"
        # Every span in a sentence refers to the ORIGINAL token indices, so the
        # edits must be applied right to left. Applying them in file order
        # invalidates the indices of later edits as soon as the first one
        # changes the token count, which silently discards real corrections.
        ordered = sorted(
            pending_edits,
            key=lambda annotation: (_edit_span(annotation) or (0, 0))[0],
            reverse=True,
        )
        tokens = source.split()
        for annotation in ordered:
            updated = _apply_errant_edits(tokens, annotation)
            if updated is None:
                return None, "edit could not be applied"
            tokens = updated
        corrected = " ".join(tokens).strip()
    else:
        corrected = (target or "").strip()

    if not corrected:
        return None, "empty correction"
    if corrected == source:
        return None, "correction identical to source"
    return {"sentence": source, "corrected": corrected, "error_type": error_type}, ""


class M2ParseError(RuntimeError):
    """Raised when a file yields no usable M2 records."""
