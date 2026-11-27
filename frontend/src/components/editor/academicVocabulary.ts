/**
 * Academic vocabulary the in-browser Harper linter must not flag as misspelled: a copy of the
 * alphabetic entries of ml/grammar/spell_checker.py ACADEMIC_WHITELIST (the server checker's
 * list), kept in step by academicVocabulary.test.ts. Regenerate from that list when it changes.
 */
export const ACADEMIC_WORDS: readonly string[] = [
  'abductive', 'abstract', 'accelerated', 'accuracy', 'acknowledgements', 'acknowledgments', 'acm',
  'acro', 'acronym', 'affiliation', 'aic', 'algorithm', 'algorithmic', 'algpseudocode', 'alpha',
  'ams', 'amsmath', 'amssymb', 'amsthm', 'ancova', 'anderson', 'anova', 'ansible', 'apa',
  'appendices', 'appendix', 'approx', 'argmax', 'argmin', 'argocd', 'arraystretch', 'arxiv', 'auc',
  'author', 'authorea', 'autocorrelated', 'autocorrelation', 'autoethnography', 'axiology',
  'babel', 'bartlett', 'bca', 'because', 'begin', 'benjamini', 'beta', 'bias', 'bibdesk', 'biber',
  'bibliography', 'bibtex', 'bic', 'biorxiv', 'biosafety', 'biosecurity', 'biserial', 'bitbucket',
  'blacksquare', 'blogs', 'boldsymbol', 'bonferroni', 'bookmark', 'booktabs', 'bootstrap',
  'bootstrapping', 'box', 'boxed', 'bracketing', 'bsc', 'cambridge', 'campbell', 'cancel', 'cap',
  'caption', 'cauchit', 'causal', 'cell', 'centering', 'cepr', 'cfa', 'chapter', 'chemrxiv', 'chi',
  'chicago', 'cinahl', 'circleci', 'circuitikz', 'citavi', 'cite', 'citep', 'citet', 'cleveref',
  'cline', 'cloglog', 'cochran', 'cochrane', 'cohen', 'collinearity', 'colortbl', 'comparative',
  'compare', 'complementarity', 'conceptualization', 'conda', 'confirmability', 'confirmatory',
  'construct', 'constructivism', 'constructs', 'convergence', 'corollary', 'correlational',
  'covariate', 'covariates', 'coverage', 'cox', 'credibility', 'cronbach', 'crossref', 'csquotes',
  'cup', 'darling', 'dataset', 'datasets', 'date', 'dds', 'dedication', 'dedoose', 'deductive',
  'definition', 'delta', 'dependability', 'dependent', 'descriptive', 'dichotomous', 'divergence',
  'docker', 'documentclass', 'doi', 'dphil', 'dunn', 'dunnett', 'durbin', 'dvm', 'econpapers',
  'edarxiv', 'edd', 'eds', 'efa', 'elife', 'elsevier', 'email', 'embase', 'emph', 'emptyset',
  'end', 'endnote', 'endogeneity', 'endogenous', 'engrxiv', 'epigraph', 'epistemology', 'epsilon',
  'epstopdf', 'eqref', 'eric', 'eslint', 'esq', 'eta', 'etal', 'etc', 'ethnography', 'example',
  'exercise', 'exists', 'exogeneity', 'exogenous', 'expansion', 'experimental', 'exploratory',
  'fancyhdr', 'fdr', 'fig', 'figure', 'float', 'flux', 'fontenc', 'footnote', 'forall',
  'framework', 'francis', 'friedman', 'gamma', 'generalizability', 'geometry', 'gibbs', 'git',
  'github', 'gitlab', 'glossary', 'grade', 'grafana', 'graphicx', 'harvard', 'hastings', 'helm',
  'hermeneutics', 'heteroscedastic', 'heteroscedasticity', 'heteroskedasticity', 'histogram',
  'hline', 'hochberg', 'holm', 'homoscedastic', 'homoscedasticity', 'homoskedasticity', 'hon',
  'hpd', 'href', 'hyperref', 'hypotheses', 'hypothesis', 'ibid', 'icc', 'ideas', 'identity',
  'ieee', 'imprecision', 'include', 'includegraphics', 'inconsistency', 'indentfirst',
  'independent', 'indirectness', 'inductive', 'inf', 'infra', 'infty', 'initiation', 'input', 'intellidocs',
  'inputenc', 'instrument', 'instrumentation', 'int', 'integration', 'interpretivism', 'inverse',
  'investigation', 'iota', 'isbn', 'issn', 'jabref', 'jackknife', 'jbi', 'jenkins', 'jest',
  'julia', 'kappa', 'kendall', 'kendalltau', 'keywords', 'kolmogorov', 'kruskal', 'kubernetes',
  'kurtosis', 'kustomize', 'label', 'lambda', 'latex', 'lawxiv', 'lemma', 'leptokurtic', 'levene',
  'likelihood', 'likert', 'lim', 'liminf', 'limsup', 'listings', 'listoffigures', 'listoftables',
  'log', 'logistic', 'logit', 'loglog', 'longitudinal', 'longtable', 'loo', 'lstlisting', 'mae',
  'makeidx', 'maketitle', 'mancova', 'mann', 'manova', 'map', 'mape', 'mathbb', 'mathbf',
  'mathcal', 'mathfrak', 'mathit', 'mathscr', 'mathsf', 'mathtools', 'mathtt', 'matlab', 'mauchly',
  'max', 'maxqda', 'mba', 'mcmc', 'mcnemar', 'measurement', 'mediation', 'medline', 'medrxiv',
  'mendeley', 'mesokurtic', 'methodologies', 'methodology', 'metropolis', 'microtype', 'miktex',
  'min', 'minted', 'mit', 'mla', 'mle', 'moderation', 'mom', 'mpa', 'mph', 'mphil', 'mrs', 'msc',
  'multicollinearity', 'multicolumn', 'multidimensional', 'multinomial', 'multirow', 'nabla',
  'nature', 'nber', 'nexists', 'nomencl', 'nonexperimental', 'nonparametric', 'nose', 'notin',
  'npm', 'nvivo', 'oint', 'omega', 'omicron', 'online', 'ontology', 'operationalization',
  'operationalize', 'operationalized', 'orcid', 'ordinal', 'overleaf', 'oxford', 'pageref',
  'paired', 'paperpile', 'papers', 'paradigm', 'paragraph', 'parametric', 'part', 'partial',
  'participatory', 'passim', 'pca', 'pdfpages', 'pearson', 'peerj', 'percentile', 'pgfplots',
  'phd', 'phenomenology', 'phi', 'philpapers', 'physics', 'pilot', 'piloting', 'pip',
  'platykurtic', 'plos', 'pmc', 'pmid', 'poisson', 'polychoric', 'polytomous', 'positionality',
  'positivism', 'posterior', 'postpositivism', 'posttest', 'power', 'pragmatism', 'precision',
  'predictive', 'preface', 'pretest', 'prettier', 'printindex', 'prior', 'prisma', 'probit',
  'prod', 'prof', 'prometheus', 'proof', 'proposition', 'psi', 'psyarxiv', 'psychometric',
  'psychometrics', 'psycinfo', 'pubmed', 'pytest', 'python', 'qed', 'qiqqa', 'quade',
  'qualitative', 'quantitative', 'quasi', 'quirkos', 'readcube', 'recall', 'ref', 'reflexivity',
  'refworks', 'regression', 'reject', 'reliability', 'remark', 'repec', 'replicability',
  'reproducibility', 'researcherid', 'resources', 'resp', 'rev', 'rho', 'rmsle', 'robins', 'robs',
  'robustness', 'roc', 'sage', 'sas', 'scd', 'scheffe', 'science', 'scopus', 'sec', 'section',
  'sem', 'setminus', 'setspace', 'shapiro', 'sharelatex', 'sigma', 'significance', 'singularity',
  'siunitx', 'skewness', 'smape', 'smirnov', 'socarxiv', 'software', 'spearman', 'sphericity',
  'springer', 'spss', 'sqrt', 'square', 'ssrn', 'stata', 'stationarity', 'subcaption', 'subfig',
  'subparagraph', 'subsection', 'subset', 'subseteq', 'subsubsection', 'sum', 'sup', 'supervision',
  'supplement', 'supplementary', 'supra', 'supset', 'supseteq', 'table', 'tableofcontents',
  'tabular', 'tag', 'tau', 'taylor', 'tbl', 'terraform', 'tetrachoric', 'tex', 'texlive', 'textbf',
  'textit', 'texttt', 'thanks', 'theorem', 'theoretical', 'therefore', 'theta', 'tikz', 'title',
  'titlesec', 'tox', 'transferability', 'travis', 'triangulation', 'tukey', 'turabian',
  'uclm', 'underline', 'unidimensional', 'unittest', 'upsilon', 'url', 'usepackage', 'validation',
  'validity', 'vancouver', 'variable', 'variables', 'verbatim', 'vide', 'visualization', 'viz',
  'vol', 'vox', 'voxeu', 'wallis', 'webpack', 'wem', 'whitney', 'wilcoxon', 'wiley', 'wilk',
  'woolf', 'wos', 'writelatex', 'xcolor', 'yarn', 'zeta', 'zotero',
]

/** Acronyms written in capitals in academic text (Harper's dictionary is case-sensitive for them). */
export const ACADEMIC_ACRONYMS: readonly string[] = [
  'ANOVA', 'MANOVA', 'ANCOVA', 'MANCOVA', 'PCA', 'EFA', 'CFA', 'SEM', 'AIC', 'BIC', 'MCMC', 'MLE', 'FDR',
  'HPD', 'DOI', 'ISBN', 'ISSN', 'PMID', 'PMC', 'ORCID', 'SSRN', 'NBER', 'LaTeX', 'BibTeX',
]

/**
 * Names written with their own capitals: the product a manuscript describes and its school. Harper
 * reads a lowercase entry as allowing only lowercase or sentence-start capitals, so "IntelliDocs"
 * mid-sentence needs its exact spelling.
 */
export const PROPER_NAMES: readonly string[] = ['IntelliDocs', 'UCLM']

/**
 * Everything Harper should accept. Words go in lowercase only: Harper already accepts a lowercase
 * word capitalised at the start of a sentence, while a capitalised entry ("Heteroscedasticity")
 * reads as a proper noun and makes the lowercase spelling an error.
 */
export function academicDictionary(): string[] {
  return [...ACADEMIC_WORDS, ...ACADEMIC_ACRONYMS, ...PROPER_NAMES]
}

const ROMAN_NUMERAL = /^(?=[mdclxvi])m{0,4}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/i

/**
 * Whether a flagged span is a roman numeral ("II", "iv", "(xii)"): chapter, part and page numbers
 * are never spelling or grammar mistakes.
 */
export function isRomanNumeral(text: string): boolean {
  return ROMAN_NUMERAL.test(text.trim().replace(/^[([]+|[)\].,:;]+$/g, ''))
}
