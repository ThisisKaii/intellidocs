"""Office Math Markup Language (OMML) to LaTeX that KaTeX can render.

The structure (one handler per OMML element, a tree walk, symbol tables) follows dwml
(https://github.com/xiilei/dwml, Apache License 2.0, Copyright its authors), whose big-operator,
accent and fraction tables are the starting point of the ones below. It differs where dwml falls
short for this project: every output command is one KaTeX supports, math-alphanumeric letters are
normalised instead of listed, pre-scripts, matrices with `&` alignment, borders and phantoms are
handled, and an equation that cannot be converted is reported (None) so the caller keeps the
equation's own text instead of dropping it.

Element coverage follows the list in texmath's OMML reader (fractions, scripts, radicals, n-ary
operators, delimiters, matrices, equation arrays, functions, accents, bars, group characters,
limits, boxes, phantoms and runs).
"""

import re
import unicodedata
from typing import Callable, Dict, List, Optional

from lxml import etree

M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"
W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def _m(tag: str) -> str:
    """Clark-notation name of an OMML element."""
    return f"{{{M_NS}}}{tag}"


class NotConvertible(Exception):
    """An OMML construct the converter cannot express in LaTeX."""


# ─── Symbol tables ─────────────────────────────────────────────────────────────

# LaTeX specials in plain text.
_ESCAPES = {"#": r"\#", "$": r"\$", "%": r"\%", "&": r"\&", "_": r"\_", "{": r"\{", "}": r"\}", "~": r"\~{}", "^": r"\^{}", "\\": r"\backslash "}

# Unicode characters whose KaTeX command is not the character itself.
_SYMBOLS = {
    "α": r"\alpha ", "β": r"\beta ", "γ": r"\gamma ", "δ": r"\delta ", "ε": r"\epsilon ", "ϵ": r"\epsilon ", "ζ": r"\zeta ",
    "η": r"\eta ", "θ": r"\theta ", "ϑ": r"\vartheta ", "ι": r"\iota ", "κ": r"\kappa ", "λ": r"\lambda ", "μ": r"\mu ",
    "ν": r"\nu ", "ξ": r"\xi ", "π": r"\pi ", "ϖ": r"\varpi ", "ρ": r"\rho ", "ϱ": r"\varrho ", "σ": r"\sigma ", "ς": r"\varsigma ",
    "τ": r"\tau ", "υ": r"\upsilon ", "φ": r"\phi ", "ϕ": r"\varphi ", "χ": r"\chi ", "ψ": r"\psi ", "ω": r"\omega ",
    "Γ": r"\Gamma ", "Δ": r"\Delta ", "Θ": r"\Theta ", "Λ": r"\Lambda ", "Ξ": r"\Xi ", "Π": r"\Pi ", "Σ": r"\Sigma ",
    "Υ": r"\Upsilon ", "Φ": r"\Phi ", "Ψ": r"\Psi ", "Ω": r"\Omega ",
    "±": r"\pm ", "∓": r"\mp ", "×": r"\times ", "÷": r"\div ", "·": r"\cdot ", "⋅": r"\cdot ", "∗": r"\ast ", "∘": r"\circ ",
    "∙": r"\bullet ", "⊕": r"\oplus ", "⊗": r"\otimes ", "⊙": r"\odot ", "−": "-", "–": "-",
    "≤": r"\leq ", "≥": r"\geq ", "≠": r"\neq ", "≈": r"\approx ", "≡": r"\equiv ", "∼": r"\sim ", "≃": r"\simeq ", "≅": r"\cong ",
    "∝": r"\propto ", "≪": r"\ll ", "≫": r"\gg ", "≺": r"\prec ", "≻": r"\succ ", "∥": r"\parallel ", "⊥": r"\perp ",
    "∈": r"\in ", "∉": r"\notin ", "∋": r"\ni ", "⊂": r"\subset ", "⊃": r"\supset ", "⊆": r"\subseteq ", "⊇": r"\supseteq ",
    "∪": r"\cup ", "∩": r"\cap ", "∅": r"\emptyset ", "∖": r"\setminus ",
    "→": r"\rightarrow ", "←": r"\leftarrow ", "↔": r"\leftrightarrow ", "⇒": r"\Rightarrow ", "⇐": r"\Leftarrow ", "⇔": r"\Leftrightarrow ",
    "↑": r"\uparrow ", "↓": r"\downarrow ", "↦": r"\mapsto ", "⟶": r"\longrightarrow ",
    "∀": r"\forall ", "∃": r"\exists ", "¬": r"\neg ", "∧": r"\wedge ", "∨": r"\vee ", "∴": r"\therefore ",
    "∞": r"\infty ", "∂": r"\partial ", "∇": r"\nabla ", "ℏ": r"\hbar ", "ℓ": r"\ell ", "′": "'", "″": "''",
    "⋯": r"\cdots ", "…": r"\ldots ", "⋮": r"\vdots ", "⋱": r"\ddots ", "√": r"\surd ",
    "ℝ": r"\mathbb{R}", "ℕ": r"\mathbb{N}", "ℤ": r"\mathbb{Z}", "ℚ": r"\mathbb{Q}", "ℂ": r"\mathbb{C}",
    "∑": r"\sum ", "∏": r"\prod ", "∫": r"\int ",
    " ": r"\ ", " ": r"\, ", " ": r"\ ",
}

# n-ary operator characters (m:naryPr/m:chr); Word's default is the integral.
_NARY = {
    "∑": r"\sum", "∏": r"\prod", "∐": r"\coprod", "∫": r"\int", "∬": r"\iint", "∭": r"\iiint", "∮": r"\oint", "∯": r"\oiint", "∰": r"\oiiint",
    "⋀": r"\bigwedge", "⋁": r"\bigvee", "⋂": r"\bigcap", "⋃": r"\bigcup", "⨀": r"\bigodot", "⨁": r"\bigoplus", "⨂": r"\bigotimes",
}

# Accent characters (m:accPr/m:chr) and the KaTeX command that draws them; Word's default is the hat.
_ACCENTS = {
    "̀": "grave", "́": "acute", "̂": "widehat", "^": "widehat", "̃": "widetilde", "~": "widetilde",
    "̄": "bar", "¯": "bar", "̅": "overline", "̆": "breve", "̇": "dot", "˙": "dot", "̈": "ddot", "¨": "ddot",
    "̌": "check", "ˇ": "check", "⃗": "vec", "→": "overrightarrow", "⃖": "overleftarrow", "⃡": "overleftrightarrow",
    "⃛": "dddot", "̊": "mathring",
}

# Group characters (m:groupChrPr/m:chr) with the KaTeX command for each.
_GROUP = {"⏞": "overbrace", "⏟": "underbrace", "⏜": "overgroup", "⏝": "undergroup", "⎴": "overbrace", "⎵": "underbrace"}

# Delimiter characters (begChr, sepChr, endChr) as they are written after \left, \middle and \right.
_DELIMITERS = {
    "{": r"\{", "}": r"\}", "|": "|", "‖": r"\Vert", "⟨": r"\langle", "⟩": r"\rangle", "〈": r"\langle", "〉": r"\rangle",
    "⌊": r"\lfloor", "⌋": r"\rfloor", "⌈": r"\lceil", "⌉": r"\rceil", "[": "[", "]": "]", "(": "(", ")": ")", "⟦": r"\llbracket", "⟧": r"\rrbracket",
}

# Names Word sets as functions, written as the KaTeX operator of the same name.
_FUNCTIONS = {
    "sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "coth", "log", "ln", "lg", "exp",
    "det", "dim", "gcd", "lim", "max", "min", "sup", "inf", "arg", "deg", "ker", "hom", "Pr", "limsup", "liminf", "mod",
}
# Functions that take their limit underneath.
_LIMIT_FUNCTIONS = {"lim", "max", "min", "sup", "inf", "limsup", "liminf", "det", "gcd", "Pr"}


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _val(parent: Optional[etree._Element], tag: str) -> Optional[str]:
    """The m:val of a property child such as m:chr, or None when absent (an empty string is a real value)."""
    if parent is None:
        return None
    child = parent.find(_m(tag))
    return None if child is None else child.get(_m("val"))


def _is_on(parent: Optional[etree._Element], tag: str) -> bool:
    """Whether a boolean property (m:subHide, m:degHide) is switched on."""
    if parent is None:
        return False
    child = parent.find(_m(tag))
    return child is not None and child.get(_m("val")) not in ("0", "false", "off")


def _group(latex: str) -> str:
    """Wrap a fragment in braces unless it is already one token."""
    stripped = latex.strip()
    if len(stripped) == 1 or re.fullmatch(r"\\[A-Za-z]+", stripped):
        return stripped
    return "{" + stripped + "}"


def linear_text(element: etree._Element) -> str:
    """The equation's own text (every m:t), used when it cannot be converted."""
    return "".join(t.text or "" for t in element.iter(_m("t"))).strip()


# ─── The converter ─────────────────────────────────────────────────────────────

class _Converter:
    """Walks an OMML tree; one method per element."""

    def __init__(self) -> None:
        self.handlers: Dict[str, Callable[[etree._Element], str]] = {
            "r": self.run, "f": self.fraction, "sSup": self.sup, "sSub": self.sub, "sSubSup": self.subsup, "sPre": self.pre,
            "rad": self.radical, "nary": self.nary, "d": self.delimiter, "m": self.matrix, "eqArr": self.eq_array,
            "func": self.function, "acc": self.accent, "bar": self.bar, "groupChr": self.group_char, "limLow": self.lim_low,
            "limUpp": self.lim_upp, "box": self.box, "borderBox": self.border_box, "phant": self.phantom,
        }

    def children(self, element: etree._Element) -> str:
        """Concatenated LaTeX of an element's math children (properties are skipped)."""
        parts: List[str] = []
        for child in element:
            if not isinstance(child.tag, str) or not child.tag.startswith("{" + M_NS + "}"):
                # Word wraps runs in hyperlinks, content controls and revision marks inside a formula.
                if isinstance(child.tag, str) and child.tag.startswith("{" + W_NS + "}"):
                    parts.append(self.children(child))
                continue
            tag = child.tag.split("}")[1]
            if tag.endswith("Pr") or tag == "ctrlPr":
                continue
            handler = self.handlers.get(tag)
            if handler is not None:
                parts.append(handler(child))
            elif tag in ("e", "num", "den", "sub", "sup", "deg", "lim", "fName", "oMath", "mr"):
                parts.append(self.children(child))
            else:
                raise NotConvertible(f"m:{tag}")
        return "".join(parts)

    def arg(self, element: etree._Element, tag: str) -> str:
        """LaTeX of one named child (m:e, m:num, ...); empty when missing."""
        child = element.find(_m(tag))
        return self.children(child).strip() if child is not None else ""

    # -- runs --

    def run(self, element: etree._Element) -> str:
        text = "".join((t.text or "") for t in element.findall(_m("t")))
        if not text:
            return ""
        props = element.find(_m("rPr"))
        if _is_on(props, "nor"):
            return r"\text{" + "".join(_ESCAPES.get(c, c) for c in text) + "}"
        out = "".join(self.symbol(c) for c in unicodedata.normalize("NFKC", text))
        style = _val(props, "sty")
        if style == "p":
            return r"\mathrm{" + out + "}"
        if style == "b":
            return r"\mathbf{" + out + "}"
        if style == "bi":
            return r"\boldsymbol{" + out + "}"
        return out

    @staticmethod
    def symbol(char: str) -> str:
        if char in _SYMBOLS:
            return _SYMBOLS[char]
        if char in _ESCAPES:
            return _ESCAPES[char]
        return char

    # -- structures --

    def fraction(self, element: etree._Element) -> str:
        kind = _val(element.find(_m("fPr")), "type") or "bar"
        num, den = self.arg(element, "num"), self.arg(element, "den")
        if kind == "noBar":
            return r"\genfrac{}{}{0pt}{}{" + num + "}{" + den + "}"
        if kind == "lin":
            return "{" + num + "}/{" + den + "}"
        if kind == "skw":
            return "{}^{" + num + "}/_{" + den + "}"
        return r"\frac{" + num + "}{" + den + "}"

    def sup(self, element: etree._Element) -> str:
        return _group(self.arg(element, "e")) + "^{" + self.arg(element, "sup") + "}"

    def sub(self, element: etree._Element) -> str:
        return _group(self.arg(element, "e")) + "_{" + self.arg(element, "sub") + "}"

    def subsup(self, element: etree._Element) -> str:
        return _group(self.arg(element, "e")) + "_{" + self.arg(element, "sub") + "}^{" + self.arg(element, "sup") + "}"

    def pre(self, element: etree._Element) -> str:
        return "{}_{" + self.arg(element, "sub") + "}^{" + self.arg(element, "sup") + "}" + _group(self.arg(element, "e"))

    def radical(self, element: etree._Element) -> str:
        body = self.arg(element, "e")
        degree = self.arg(element, "deg")
        if degree and not _is_on(element.find(_m("radPr")), "degHide"):
            return r"\sqrt[" + degree + "]{" + body + "}"
        return r"\sqrt{" + body + "}"

    def nary(self, element: etree._Element) -> str:
        props = element.find(_m("naryPr"))
        char = _val(props, "chr")
        operator = _NARY.get(char if char is not None else "∫")
        if operator is None:
            raise NotConvertible(f"n-ary {char!r}")
        out = operator
        if not _is_on(props, "subHide") and self.arg(element, "sub"):
            out += "_{" + self.arg(element, "sub") + "}"
        if not _is_on(props, "supHide") and self.arg(element, "sup"):
            out += "^{" + self.arg(element, "sup") + "}"
        return out + " " + self.arg(element, "e")

    def delimiter(self, element: etree._Element) -> str:
        props = element.find(_m("dPr"))
        begin, end, sep = _val(props, "begChr"), _val(props, "endChr"), _val(props, "sepChr")
        left = self.delimiter_char("(" if begin is None else begin)
        right = self.delimiter_char(")" if end is None else end)
        sep = "|" if sep is None else sep
        parts = [self.children(e).strip() for e in element.findall(_m("e"))]
        if sep in _DELIMITERS:
            joiner = r" \middle" + _DELIMITERS[sep] + " "
        else:
            # A separator that is not a bracket (a comma, a semicolon) is an ordinary symbol between the elements.
            joiner = " " + self.symbol(sep).strip() + " " if sep else " "
        return r"\left" + left + " " + joiner.join(parts) + r" \right" + right

    @staticmethod
    def delimiter_char(char: str) -> str:
        if char == "":
            return "."
        if char in _DELIMITERS:
            return _DELIMITERS[char]
        raise NotConvertible(f"delimiter {char!r}")

    def matrix(self, element: etree._Element) -> str:
        rows = [" & ".join(self.children(e).strip() for e in row.findall(_m("e"))) for row in element.findall(_m("mr"))]
        return r"\begin{matrix}" + r" \\ ".join(rows) + r"\end{matrix}"

    def eq_array(self, element: etree._Element) -> str:
        lines = []
        for e in element.findall(_m("e")):
            # A literal "&" in an array line is its alignment point, not text.
            lines.append(self.children(e).replace(r"\&", "&").strip())
        return r"\begin{aligned}" + r" \\ ".join(lines) + r"\end{aligned}"

    def function(self, element: etree._Element) -> str:
        name_el = element.find(_m("fName"))
        name = linear_text(name_el) if name_el is not None else ""
        body = self.arg(element, "e")
        # A function name with limits (lim under a limLow) is built by lim_low and already carries the operator.
        has_limits = name_el is not None and (name_el.find(_m("limLow")) is not None or name_el.find(_m("limUpp")) is not None)
        if has_limits:
            return self.arg(element, "fName") + " " + body
        if name in _FUNCTIONS:
            return "\\" + name + " " + body
        if name:
            return r"\operatorname{" + "".join(_ESCAPES.get(c, c) for c in name) + "} " + body
        return body

    def accent(self, element: etree._Element) -> str:
        char = _val(element.find(_m("accPr")), "chr")
        command = _ACCENTS.get(char if char is not None else "̂")
        if command is None:
            raise NotConvertible(f"accent {char!r}")
        return "\\" + command + "{" + self.arg(element, "e") + "}"

    def bar(self, element: etree._Element) -> str:
        position = _val(element.find(_m("barPr")), "pos") or "bot"
        return (r"\overline{" if position == "top" else r"\underline{") + self.arg(element, "e") + "}"

    def group_char(self, element: etree._Element) -> str:
        char = _val(element.find(_m("groupChrPr")), "chr")
        command = _GROUP.get(char if char is not None else "⏟")
        if command is None:
            raise NotConvertible(f"group character {char!r}")
        return "\\" + command + "{" + self.arg(element, "e") + "}"

    def lim_low(self, element: etree._Element) -> str:
        base, limit = self.arg(element, "e"), self.arg(element, "lim")
        base_el = element.find(_m("e"))
        name = linear_text(base_el) if base_el is not None else ""
        if name in _LIMIT_FUNCTIONS:
            return "\\" + name + "_{" + limit + "}"
        return r"\underset{" + limit + "}{" + base + "}"

    def lim_upp(self, element: etree._Element) -> str:
        return r"\overset{" + self.arg(element, "lim") + "}{" + self.arg(element, "e") + "}"

    def box(self, element: etree._Element) -> str:
        return self.arg(element, "e")

    def border_box(self, element: etree._Element) -> str:
        props = element.find(_m("borderBoxPr"))
        body = self.arg(element, "e")
        if any(_is_on(props, flag) for flag in ("strikeH", "strikeV", "strikeBLTR", "strikeTLBR")):
            return r"\cancel{" + body + "}"
        return r"\boxed{" + body + "}"

    def phantom(self, element: etree._Element) -> str:
        return r"\phantom{" + self.arg(element, "e") + "}"


# "(1)", "(2a)", "(3.1)": a number written after an equation (a tab and the number in the same paragraph).
EQUATION_NUMBER = re.compile(r"\(\s*(\d+(?:[.\-]\d+)?[a-z]?)\s*\)")


def split_equation_number(latex: str) -> "tuple[str, Optional[str]]":
    """Separate Word's typed equation number (`E=mc^2#(1)`, made into an array by Word) from the equation.

    Returns (latex without the number, number or None).
    """
    inner = re.fullmatch(r"\\begin\{aligned\}(.*)\\end\{aligned\}", latex, flags=re.S)
    body = inner.group(1) if inner else latex
    found = re.fullmatch(r"(.*?)\s*\\#\s*" + EQUATION_NUMBER.pattern + r"\s*", body, flags=re.S)
    if not found:
        return latex, None
    return found.group(1).strip(), found.group(2)


def omath_to_latex(element: etree._Element) -> Optional[str]:
    """LaTeX for an m:oMath element, or None when any part of it cannot be expressed.

    The caller keeps `linear_text(element)` for a None result, so no equation is ever dropped.
    """
    try:
        latex = _Converter().children(element).strip()
    except (NotConvertible, RecursionError):
        return None
    return re.sub(r"\s+", " ", latex) or None
