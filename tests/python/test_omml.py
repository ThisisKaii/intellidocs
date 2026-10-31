"""OMML to LaTeX: one case per element of the coverage list, plus the never-drop fallback."""
import os
import sys

from lxml import etree

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml", "src"))

from omml import linear_text, omath_to_latex, split_equation_number  # noqa: E402

NS = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def latex(inner: str) -> str:
    """LaTeX of an m:oMath holding the given OMML."""
    element = etree.fromstring(f"<m:oMath {NS}>{inner}</m:oMath>")
    result = omath_to_latex(element)
    assert result is not None, f"not converted: {inner}"
    return result


def r(text: str, props: str = "") -> str:
    """An OMML run."""
    return f"<m:r>{('<m:rPr>' + props + '</m:rPr>') if props else ''}<m:t>{text}</m:t></m:r>"


def e(inner: str) -> str:
    return f"<m:e>{inner}</m:e>"


def test_plain_run_keeps_its_text() -> None:
    assert latex(r("x+y")) == "x+y"


def test_math_alphanumerics_are_normalised_and_greek_is_named() -> None:
    assert latex(r("\U0001d465")) == "x"  # mathematical italic x
    assert latex(r("α+β")) == r"\alpha +\beta"


def test_relations_and_operators() -> None:
    assert latex(r("a≤b")) == r"a\leq b"
    assert latex(r("a≠b")) == r"a\neq b"
    assert latex(r("a×b")) == r"a\times b"


def test_fraction_and_its_variants() -> None:
    frac = "<m:f><m:num>{n}</m:num><m:den>{d}</m:den></m:f>".format(n=r("1"), d=r("2"))
    assert latex(frac) == r"\frac{1}{2}"
    no_bar = '<m:f><m:fPr><m:type m:val="noBar"/></m:fPr><m:num>' + r("n") + "</m:num><m:den>" + r("k") + "</m:den></m:f>"
    assert latex(no_bar) == r"\genfrac{}{}{0pt}{}{n}{k}"
    linear = '<m:f><m:fPr><m:type m:val="lin"/></m:fPr><m:num>' + r("a") + "</m:num><m:den>" + r("b") + "</m:den></m:f>"
    assert latex(linear) == "{a}/{b}"


def test_scripts() -> None:
    assert latex("<m:sSup>" + e(r("x")) + "<m:sup>" + r("2") + "</m:sup></m:sSup>") == "x^{2}"
    assert latex("<m:sSub>" + e(r("x")) + "<m:sub>" + r("i") + "</m:sub></m:sSub>") == "x_{i}"
    assert latex("<m:sSubSup>" + e(r("x")) + "<m:sub>" + r("i") + "</m:sub><m:sup>" + r("2") + "</m:sup></m:sSubSup>") == "x_{i}^{2}"


def test_pre_scripts() -> None:
    result = latex("<m:sPre><m:sub>" + r("1") + "</m:sub><m:sup>" + r("2") + "</m:sup>" + e(r("X")) + "</m:sPre>")
    assert result == "{}_{1}^{2}X"


def test_radical_with_and_without_degree() -> None:
    plain = '<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>' + e(r("x")) + "</m:rad>"
    assert latex(plain) == r"\sqrt{x}"
    cube = "<m:rad><m:deg>" + r("3") + "</m:deg>" + e(r("x")) + "</m:rad>"
    assert latex(cube) == r"\sqrt[3]{x}"


def test_nary_sum_integral_and_hidden_limits() -> None:
    total = '<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>' + r("i=1") + "</m:sub><m:sup>" + r("n") + "</m:sup>" + e(r("x")) + "</m:nary>"
    assert latex(total) == r"\sum_{i=1}^{n} x"
    integral = '<m:nary><m:naryPr><m:supHide m:val="1"/></m:naryPr><m:sub/><m:sup/>' + e(r("f")) + "</m:nary>"
    assert latex(integral) == r"\int f"


def test_delimiters_default_and_custom() -> None:
    assert latex("<m:d>" + e(r("x")) + "</m:d>") == r"\left( x \right)"
    custom = '<m:d><m:dPr><m:begChr m:val="⟨"/><m:endChr m:val="⟩"/></m:dPr>' + e(r("a")) + "</m:d>"
    assert latex(custom) == r"\left\langle a \right\rangle"
    open_end = '<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr>' + e(r("x")) + "</m:d>"
    assert latex(open_end) == r"\left\{ x \right."


def test_delimiter_separator_between_elements() -> None:
    pair = '<m:d><m:dPr><m:sepChr m:val=","/></m:dPr>' + e(r("a")) + e(r("b")) + "</m:d>"
    assert latex(pair) == r"\left( a , b \right)"
    bar = '<m:d><m:dPr><m:sepChr m:val="|"/></m:dPr>' + e(r("a")) + e(r("b")) + "</m:d>"
    assert latex(bar) == r"\left( a \middle| b \right)"


def test_matrix() -> None:
    row1 = "<m:mr>" + e(r("1")) + e(r("0")) + "</m:mr>"
    row2 = "<m:mr>" + e(r("0")) + e(r("1")) + "</m:mr>"
    assert latex("<m:m>" + row1 + row2 + "</m:m>") == r"\begin{matrix}1 & 0 \\ 0 & 1\end{matrix}"


def test_equation_array_keeps_alignment_points() -> None:
    result = latex("<m:eqArr>" + e(r("a&amp;=b")) + e(r("c&amp;=d")) + "</m:eqArr>")
    assert result == r"\begin{aligned}a&=b \\ c&=d\end{aligned}"


def test_named_function_and_unknown_function() -> None:
    sin = "<m:func><m:fName>" + r("sin", "<m:sty m:val=\"p\"/>") + "</m:fName>" + e(r("x")) + "</m:func>"
    assert latex(sin) == r"\sin x"
    other = "<m:func><m:fName>" + r("foo") + "</m:fName>" + e(r("x")) + "</m:func>"
    assert latex(other) == r"\operatorname{foo} x"


def test_limit_function_takes_its_limit_underneath() -> None:
    lim = "<m:func><m:fName><m:limLow>" + e(r("lim")) + "<m:lim>" + r("x→0") + "</m:lim></m:limLow></m:fName>" + e(r("f")) + "</m:func>"
    assert latex(lim) == r"\lim_{x\rightarrow 0} f"


def test_accents_bars_and_group_characters() -> None:
    assert latex("<m:acc><m:accPr><m:chr m:val=\"̇\"/></m:accPr>" + e(r("x")) + "</m:acc>") == r"\dot{x}"
    assert latex("<m:acc>" + e(r("x")) + "</m:acc>") == r"\widehat{x}"  # Word's default accent
    assert latex('<m:bar><m:barPr><m:pos m:val="top"/></m:barPr>' + e(r("x")) + "</m:bar>") == r"\overline{x}"
    assert latex('<m:bar><m:barPr><m:pos m:val="bot"/></m:barPr>' + e(r("x")) + "</m:bar>") == r"\underline{x}"
    assert latex('<m:groupChr><m:groupChrPr><m:chr m:val="⏞"/></m:groupChrPr>' + e(r("abc")) + "</m:groupChr>") == r"\overbrace{abc}"


def test_limit_above_and_below_a_base() -> None:
    assert latex("<m:limUpp>" + e(r("x")) + "<m:lim>" + r("def") + "</m:lim></m:limUpp>") == r"\overset{def}{x}"
    assert latex("<m:limLow>" + e(r("x")) + "<m:lim>" + r("k") + "</m:lim></m:limLow>") == r"\underset{k}{x}"


def test_box_border_box_and_phantom() -> None:
    assert latex("<m:box>" + e(r("x")) + "</m:box>") == "x"
    assert latex("<m:borderBox>" + e(r("x")) + "</m:borderBox>") == r"\boxed{x}"
    assert latex('<m:borderBox><m:borderBoxPr><m:strikeH m:val="1"/></m:borderBoxPr>' + e(r("x")) + "</m:borderBox>") == r"\cancel{x}"
    assert latex("<m:phant>" + e(r("x")) + "</m:phant>") == r"\phantom{x}"


def test_run_styles() -> None:
    assert latex(r("abc", '<m:sty m:val="p"/>')) == r"\mathrm{abc}"
    assert latex(r("abc", '<m:sty m:val="b"/>')) == r"\mathbf{abc}"
    assert latex(r("not math", "<m:nor/>")) == r"\text{not math}"


def test_special_characters_are_escaped() -> None:
    assert latex(r("50%")) == r"50\%"


def test_unknown_element_is_reported_and_text_is_kept() -> None:
    element = etree.fromstring(f"<m:oMath {NS}><m:mystery>" + r("x") + f"</m:mystery></m:oMath>")
    assert omath_to_latex(element) is None
    assert linear_text(element) == "x"


def test_typed_equation_number_is_split_off() -> None:
    assert split_equation_number(r"E=mc^{2}\#(1)") == ("E=mc^{2}", "1")
    assert split_equation_number(r"\begin{aligned}a&=b\#(2a)\end{aligned}") == ("a&=b", "2a")
    assert split_equation_number(r"x\#(3.1)") == ("x", "3.1")
    assert split_equation_number("E=mc^{2}") == ("E=mc^{2}", None)
    assert split_equation_number(r"50\#(x)") == (r"50\#(x)", None)  # not a number


def test_runs_wrapped_in_word_markup_are_found() -> None:
    result = latex("<w:ins><m:r><m:t>x</m:t></m:r></w:ins>")
    assert result == "x"
