# IntelliDocs Baseline Accuracy Metrics

> Generated: 2026-10-16 22:32 UTC by `ml/tests/benchmark_accuracy.py`
> Purpose: empirical pre-training baselines for the thesis (RQ1/RQ5), captured before any per-user fine-tuning.

## 1. Formatting Model: WikiText-103 Held-Out Test Split

- Model artifact: `ml/models/base_model.pkl` (36.62 MB, sha256 87dc2e60b19f41d2)
- Samples evaluated: 2,891 non-empty test paragraphs
- Protocol: labels from `infer_format_label` (the same labeling rule used to build the training CSV); features from the training-time encoding (text features plus zeroed PDF-layout columns). RandomForest tier only; the DistilBERT cascade and per-user LSTM are excluded.

| Metric | Value |
|---|---|
| Top-1 accuracy | 99.9% |
| Top-3 accuracy | 100.0% |

| Category | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| blockquote | n/a | n/a | n/a | 0 |
| caption | n/a | n/a | n/a | 0 |
| code_block | n/a | n/a | n/a | 0 |
| heading1 | 1.000 | 1.000 | 1.000 | 62 |
| heading2 | 1.000 | 1.000 | 1.000 | 302 |
| heading3 | 1.000 | 1.000 | 1.000 | 342 |
| ordered_list | n/a | n/a | n/a | 0 |
| paragraph | 1.000 | 0.999 | 1.000 | 2168 |
| reference_entry | n/a | n/a | n/a | 0 |
| title | 0.895 | 1.000 | 0.944 | 17 |
| unordered_list | n/a | n/a | n/a | 0 |

**Limitations.** The near-ceiling accuracy is expected and must be read carefully: the ground-truth labels are produced by a deterministic surface rule (`infer_format_label`) whose signals (leading `=` markers, bullet characters, case) are also present in the feature vector, so the model is mostly re-learning that rule on unseen text. This table therefore measures rule agreement, not human-annotated formatting accuracy. The category F1s cover only WikiText-representable classes; `blockquote`, `caption`, `code_block`, `ordered_list`, `reference_entry`, and `unordered_list` have no test samples under this rule (marked n/a). True prediction accuracy for RQ1 comes from the per-user accept/reject loop after fine-tuning.

## 2. Grammar Checker: JFLEG Test Split

- Model artifact: `ml/models/grammar_model.pkl` (0.57 MB, sha256 30eb6aadcb94e3ed)
- Sentences evaluated: 747
- Protocol: `detect_issues` edits applied once at first occurrence; corpus GLEU against all four JFLEG references (nltk); word-level edit precision/recall against reference #1 via difflib opcode alignment.

| Metric | Value |
|---|---|
| GLEU (system corrections) | 0.7734 |
| GLEU (uncorrected source baseline) | 0.7723 |
| Edit precision | 0.958 |
| Edit recall | 0.249 |
| Edit F1 | 0.395 |
| Predicted / reference edits | 165 / 1,806 |
| Sentences with at least one detected issue | 20.6% |

**Limitations.** JFLEG references are heavily paraphrastic and contain 1,806 word-level edits in this split, while the rule pipeline proposes 165 (mostly capitalization and agreement fixes). High precision with low recall and only a marginal GLEU gain over the uncorrected source (+0.001) is the expected profile of a conservative rule checker against this benchmark; deep grammar correction is out of scope for the baseline.

## 3. Spell Checker: Labeled Typo Set + Clean Probes

| Metric | Value |
|---|---|
| Detection rate (25 misspellings) | 96.0% |
| Top-1 suggestion accuracy | 88.0% |
| Top-3 suggestion accuracy | 92.0% |
| False positives on clean text | 0 / 95 words (0.0% of unique words) |
| Throughput, error-heavy corpus | 5351.6 ms per 1,000 words (5,002-word JFLEG sample) |
| Throughput, clean acad. prose | 1.1 ms per 1,000 words (784-word sample) |

**Limitations.** The typo set is a curated 25-case probe, not a full spelling benchmark. The error-heavy throughput reflects candidate generation for every unknown word, so typical clean documents are roughly two orders of magnitude faster than the worst case.

## 4. Environment

- Python: 3.14.2
- scikit-learn: 1.9.0
- nltk: 3.10.0
- Datasets: `ml/dataset/raw/wikitext-103/test.jsonl` (4,358 rows), `ml/dataset/raw/jfleg/test.jsonl` (748 sentences)
