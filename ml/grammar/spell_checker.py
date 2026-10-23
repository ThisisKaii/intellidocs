import re
from typing import Any

from spellchecker import SpellChecker


SPELL_PATTERN = re.compile(r"\b[a-zA-Z']+\b")
SPELL_MAX_SUGGESTIONS = 5
spellchecker = SpellChecker()

# ─── Academic Vocabulary Whitelist ───────────────────────────────────────
# Common academic terms that should NOT be flagged as misspellings.
# Includes LaTeX commands, statistical terms, citation conventions,
# and common academic vocabulary that appears in theses, dissertations,
# and journal papers. All entries are lowercase for case-insensitive matching.
ACADEMIC_WHITELIST: frozenset[str] = frozenset({
    # LaTeX / formatting
    "latex", "tex", "bibtex", "biber", "overleaf", "texlive", "miktex",
    "documentclass", "usepackage", "begin", "end", "section", "subsection",
    "subsubsection", "paragraph", "subparagraph", "chapter", "part",
    "tableofcontents", "listoffigures", "listoftables", "bibliography",
    "cite", "citep", "citet", "ref", "label", "pageref", "href", "url",
    "textbf", "textit", "texttt", "underline", "emph", "footnote",
    "caption", "centering", "includegraphics", "figure", "table", "tabular",
    "hline", "cline", "multicolumn", "multirow", "arraystretch",
    "geometry", "fancyhdr", "titlesec", "setspace", "indentfirst",
    "hyperref", "bookmark", "cleveref", "siunitx", "booktabs", "longtable",
    "float", "subcaption", "subfig", "graphicx", "epstopdf", "pdfpages",
    "amsmath", "amssymb", "amsthm", "mathtools", "physics", "cancel",
    "tikz", "pgfplots", "circuitikz", "algorithm", "algorithmic", "algpseudocode",
    "listings", "minted", "verbatim", "lstlisting", "input", "include", "inputenc",
    "fontenc", "babel", "csquotes", "microtype", "xcolor", "colortbl",
    "maketitle", "title", "author", "date", "thanks", "affiliation", "email",
    "abstract", "keywords", "acknowledgments", "acknowledgements",
    "dedication", "preface", "epigraph", "glossary", "acronym", "acro",
    "nomencl", "makeidx", "printindex", "theorem", "lemma", "corollary",
    "proposition", "definition", "proof", "remark", "example", "exercise",
    "qed", "blacksquare", "square", "boxed", "tag", "label", "ref", "eqref",

    # Statistical / methodological
    "anova", "manova", "ancova", "mancova", "t_test", "chi_square", "chi2",
    "pearson", "spearman", "kendall", "kendalltau", "kruskal", "wallis",
    "mann", "whitney", "wilcoxon", "friedman", "sign_test", "mcnemar",
    "cohen", "cohens_d", "hedges_g", "glass_delta", "eta_squared",
    "partial_eta", "omega_squared", "r_squared", "adjusted_r2", "aic", "bic",
    "likert", "likert_scale", "cronbach", "alpha", "reliability", "validity",
    "factor_analysis", "pca", "efa", "cfa", "sem", "path_analysis",
    "regression", "logistic", "multinomial", "ordinal", "poisson",
    "cox", "proportional_hazards", "kaplan_meier", "log_rank",
    "bootstrap", "jackknife", "cross_validation", "k_fold", "loo",
    "monte_carlo", "markov_chain", "mcmc", "gibbs", "metropolis",
    "hastings", "prior", "posterior", "likelihood", "bayes_factor",
    "credible_interval", "hpd", "map", "mle", "mom", "wem",
    "standard_error", "confidence_interval", "margin_of_error",
    "power_analysis", "effect_size", "sample_size", "power",
    "type_i_error", "type_ii_error", "alpha_level", "p_value", "significance",
    "null_hypothesis", "alternative_hypothesis", "reject", "fail_to_reject",
    "one_tailed", "two_tailed", "paired", "independent", "dependent",
    "within_subjects", "between_subjects", "mixed_design", "repeated_measures",
    "sphericity", "mauchly", "greenhouse_geisser", "huynh_feldt",
    "bonferroni", "holm", "hochberg", "benjamini", "hochberg", "fdr",
    "tukey", "scheffe", "dunnett", "games_howell", "dunn",
    "shapiro", "wilk", "kolmogorov", "smirnov", "anderson", "darling",
    "levene", "bartlett", "box", "cochran", "qq_plot", "histogram",

    # Citation / reference conventions
    "et_al", "etal", "ibid", "op_cit", "loc_cit", "cf", "see_also",
    "vide", "supra", "infra", "passim", "compare", "qv", "viz",
    "eds", "ed", "vol", "pp", "pg", "ch", "sec", "fig", "tbl",
    "doi", "isbn", "issn", "pmid", "pmc", "arxiv", "ssrn", "nber",
    "crossref", "orcid", "researcherid", "scopus", "wos", "pubmed",
    "medline", "embase", "cinahl", "psycinfo", "eric", "cochrane",

    # Academic vocabulary
    "methodology", "methodologies", "theoretical", "framework", "paradigm",
    "epistemology", "ontology", "axiology", "constructivism", "positivism",
    "postpositivism", "interpretivism", "critical_realism", "pragmatism",
    "phenomenology", "hermeneutics", "ethnography", "grounded_theory",
    "case_study", "action_research", "participatory", "autoethnography",
    "narrative_inquiry", "discourse_analysis", "content_analysis",
    "thematic_analysis", "framework_analysis", "template_analysis",
    "constant_comparison", "theoretical_saturation", "member_checking",
    "triangulation", "reflexivity", "positionality", "bracketing",
    "audit_trail", "peer_debriefing", "thick_description", "rich_data",
    "transferability", "dependability", "confirmability", "credibility",
    "literature_review", "systematic_review", "meta_analysis", "meta_synthesis",
    "prisma", "cochrane", "campbell", "jbi", "joanna_briggs",
    "inclusion_criteria", "exclusion_criteria", "quality_assessment",
    "risk_of_bias", "robs", "robins", "newcastle_ottawa", "grade",
    "certainty_of_evidence", "imprecision", "inconsistency", "indirectness",
    "publication_bias", "funnel_plot", "egger_test", "trim_fill",

    # Mathematical / formula
    "sigma", "mu", "alpha", "beta", "gamma", "delta", "epsilon", "zeta",
    "eta", "theta", "iota", "kappa", "lambda", "mu", "nu", "xi", "omicron",
    "pi", "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega",
    "partial", "nabla", "infty", "sum", "prod", "int", "oint", "lim",
    "sup", "inf", "max", "min", "argmax", "argmin", "limsup", "liminf",
    "nabla", "partial", "therefore", "because", "forall", "exists",
    "nexists", "subset", "supset", "subseteq", "supseteq", "in", "notin",
    "cup", "cap", "setminus", "emptyset", "mathbb", "mathcal", "mathfrak",
    "mathscr", "mathbf", "mathit", "mathsf", "mathtt", "boldsymbol",

    # Common abbreviations
    "eg", "ie", "viz", "vs", "etc", "ca", "approx", "approx", "cf",
    "resp", "resp", "cf", "et_al", "etc", "ie", "eg", "viz", "vs",
    "mr", "mrs", "ms", "dr", "prof", "rev", "hon", "esq", "jr", "sr",
    "phd", "md", "jd", "edd", "dds", "dvm", "mph", "msc", "bsc", "ba",
    "ma", "mba", "mpa", "mphil", "dphil", "scd", "edd", "edd",

    # Common academic words
    "hypothesis", "hypotheses", "variable", "variables", "construct",
    "constructs", "operationalization", "measurement", "instrument",
    "instrumentation", "pilot", "piloting", "pre_test", "post_test",
    "pretest", "posttest", "longitudinal", "cross_sectional", "cross_sectional",
    "experimental", "quasi_experimental", "quasi_experimental", "nonexperimental",
    "descriptive", "correlational", "causal", "comparative", "predictive",
    "exploratory", "confirmatory", "deductive", "inductive", "abductive",
    "qualitative", "quantitative", "mixed_methods", "multi_method",
    "triangulation", "convergence", "divergence", "complementarity",
    "expansion", "initiation", "integration", "validation",
    "generalizability", "external_validity", "internal_validity",
    "construct_validity", "criterion_validity", "content_validity",
    "face_validity", "concurrent_validity", "predictive_validity",
    "discriminant_validity", "convergent_validity", "known_groups",

    # Software / tools
    "spss", "sas", "stata", "r", "python", "matlab", "julia", "julia",
    "nvivo", "atlas_ti", "maxqda", "dedoose", "quirkos", "weft_qda",
    "endnote", "zotero", "mendeley", "papers", "citavi", "refworks",
    "jabref", "bibdesk", "paperpile", "readcube", "qiqqa",
    "overleaf", "sharelatex", "authorea", "writelatex", "git", "github",
    "gitlab", "bitbucket", "docker", "singularity", "conda", "pip",
    "npm", "yarn", "webpack", "babel", "eslint", "prettier", "jest",
    "pytest", "unittest", "nose", "coverage", "tox", "travis", "circleci",
    "github_actions", "jenkins", "ansible", "terraform", "kubernetes",
    "helm", "kustomize", "argocd", "flux", "prometheus", "grafana",

    # Publishing
    "elsevier", "springer", "wiley", "taylor", "francis", "sage",
    "oxford", "cambridge", "mit", "harvard", "chicago", "apa", "mla",
    "chicago_manual", "turabian", "vancouver", "ieee", "acm", "ams",
    "nature", "science", "cell", "plos", "plos_one", "plos_biology",
    "plos_medicine", "plos_computational_biology", "plos_genetics",
    "plos_pathogens", "plos_ntds", "elife", "f1000", "peerj",
    "biorxiv", "medrxiv", "arxiv", "chemrxiv", "psyarxiv", "socarxiv",
    "engrxiv", "edarxiv", "lawxiv", "philpapers", "ssrn", "repec",
    "ideas", "econpapers", "nber", "cepr", "voxeu", "vox", "blogs",

    # Misc
    "appendix", "appendices", "supplement", "supplementary", "online",
    "supplementary_material", "supplementary_data", "supplementary_table",
    "supplementary_figure", "supplementary_note", "supplementary_methods",
    "supplementary_results", "supplementary_discussion", "supplementary_references",
    "dataset", "datasets", "data_availability", "code_availability",
    "author_contributions", "conceptualization", "data_curation",
    "formal_analysis", "funding_acquisition", "investigation", "methodology",
    "project_administration", "resources", "software", "supervision",
    "validation", "visualization", "writing_original_draft",
    "writing_review_editing", "ethics_approval", "informed_consent",
    "conflict_of_interest", "data_sharing", "materials_availability",
    "field_specific_reporting", "life_sciences", "clinical_trials",
    "human_subjects", "animal_subjects", "biosafety", "biosecurity",
    "dual_use", "responsible_disclosure", "reproducibility", "replicability",
    "robustness", "sensitivity_analysis", "subgroup_analysis",
    "per_protocol", "intention_to_treat", "as_treated", "complier_average",
    "local_average", "treatment_effect", "average_treatment_effect",
    "average_treatment_effect_on_treated", "local_average_treatment_effect",
    "marginal_treatment_effect", "quantile_treatment_effect",
    "dose_response", "mediation", "moderation", "moderated_mediation",
    "mediated_moderation", "serial_mediation", "parallel_mediation",
    "path_a", "path_b", "path_c", "path_c_prime", "indirect_effect",
    "direct_effect", "total_effect", "proportion_mediated",
    "index_of_moderated_mediation", "conditional_indirect_effect",
    "bootstrapping", "percentile", "bca", "bias_corrected", "accelerated",
    "monte_carlo_simulation", "simulation_study", "power_simulation",
    "type_i_error_rate", "type_ii_error_rate", "coverage_probability",
    "bias", "mean_squared_error", "root_mean_squared_error", "mae",
    "mape", "smape", "rmsle", "log_loss", "auc", "roc", "pr_curve",
    "precision", "recall", "f1", "f_beta", "accuracy", "balanced_accuracy",
    "matthews_corrcoef", "cohen_kappa", "fleiss_kappa", "krippendorff_alpha",
    "intraclass_correlation", "icc", "pearson_r", "spearman_rho",
    "kendall_tau", "point_biserial", "biserial", "tetrachoric",
    "polychoric", "cramers_v", "phi", "lambda", "uncertainty_coefficient",
    "theil_u", "goodman_kruskal_gamma", "somers_d", "tau_a", "tau_b",
    "tau_c", "stuart_tau_c", "kendall_w", "friedman_chi_square",
    "cochran_q", "mcnemar_test", "sign_test", "wilcoxon_signed_rank",
    "wilcoxon_rank_sum", "mann_whitney_u", "kruskal_wallis_h",
    "jonckheere_terpstra", "page_test", "skillings_mack", "durbin",
    "friedman", "quade", "cochran", "mantel_haenszel", "breslow_day",
    "woolf", "logit", "probit", "cloglog", "loglog", "cauchit",
    "identity", "inverse", "sqrt", "log", "logit", "probit", "cloglog",
    "loglog", "cauchit", "identity", "inverse", "sqrt", "log",
})


def extract_words(text: str) -> list[str]:
    """Extract candidate words from text for spell checking."""
    return SPELL_PATTERN.findall(text)


def build_issue(word: str, suggestions: list[str]) -> dict[str, Any]:
    """Build a structured spelling issue with several plausible corrections."""
    return {
        "word": word,
        "suggestion": suggestions[0] if suggestions else None,
        "suggestions": suggestions,
        "type": "spelling",
    }


def edit_distance(left: str, right: str) -> int:
    """Calculate a small Levenshtein edit distance for correction filtering."""
    previous_row = list(range(len(right) + 1))

    for left_index, left_char in enumerate(left, start=1):
        current_row = [left_index]

        for right_index, right_char in enumerate(right, start=1):
            insert_cost = current_row[right_index - 1] + 1
            delete_cost = previous_row[right_index] + 1
            replace_cost = previous_row[right_index - 1] + int(left_char != right_char)
            current_row.append(min(insert_cost, delete_cost, replace_cost))

        previous_row = current_row

    return previous_row[-1]


def is_reliable_correction(word: str, suggestion: str | None) -> bool:
    """Return true only when a correction is close enough to be actionable."""
    if suggestion is None:
        return False

    normalized_word = word.lower()
    normalized_suggestion = suggestion.lower()

    if normalized_word == normalized_suggestion:
        return False

    if abs(len(normalized_word) - len(normalized_suggestion)) > 1:
        return False

    distance = edit_distance(normalized_word, normalized_suggestion)
    return distance <= 2


def check_spelling(text: str) -> dict[str, Any]:
    """Return spelling issues and summary details for the given text."""
    normalized = text.strip()
    if not normalized:
        return {
            "issues": [],
            "count": 0,
            "message": "Text is required.",
        }

    words = extract_words(normalized)
    # Skip single-character fragments — they are either valid (a, I)
    # or artifacts from stripped HTML entities (&#9; → t).
    words = [w for w in words if len(w) >= 2]
    # Filter out academic vocabulary whitelist (case-insensitive)
    words = [w for w in words if w.lower() not in ACADEMIC_WHITELIST]
    misspelled = sorted(spellchecker.unknown(words))

    issues: list[dict[str, Any]] = []
    for word in misspelled:
        raw_candidates = spellchecker.candidates(word) or {}
        # pyspellchecker yields a dict {word: probability} when a frequency
        # table is loaded, but a plain set when only the lean dictionary is.
        ranked = (
            sorted(raw_candidates.items(), key=lambda kv: kv[1], reverse=True)
            if isinstance(raw_candidates, dict)
            else [(candidate, 0) for candidate in raw_candidates]
        )
        candidates: list[str] = []
        for candidate, _ in ranked:
            if len(candidates) >= SPELL_MAX_SUGGESTIONS:
                break
            if is_reliable_correction(word, candidate):
                candidates.append(candidate)
        # Prefer the checker's strongest single correction as the top pick,
        # with the rest of the plausible candidates offered as alternates.
        top_pick = spellchecker.correction(word)
        if top_pick and top_pick != word and top_pick in candidates:
            candidates.remove(top_pick)
            candidates.insert(0, top_pick)
        elif (
            top_pick
            and top_pick != word
            and is_reliable_correction(word, top_pick)
            and top_pick not in candidates
        ):
            candidates.insert(0, top_pick)
        issues.append(build_issue(word, candidates[:SPELL_MAX_SUGGESTIONS]))

    return {
        "issues": issues,
        "count": len(issues),
        "message": (
            "No spelling issues found."
            if not issues
            else f"Found {len(issues)} spelling issue(s)."
        ),
    }


def main() -> None:
    """Run a small local smoke test for the spell checker."""
    sample = "Thiss sentense has a spleling issue."
    result = check_spelling(sample)
    print(result)


if __name__ == "__main__":
    main()
