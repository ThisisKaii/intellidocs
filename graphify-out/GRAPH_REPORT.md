# Graph Report - intellidocs  (2026-05-02)

## Corpus Check
- 103 files · ~44,666 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 463 nodes · 559 edges · 22 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 35 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]

## God Nodes (most connected - your core abstractions)
1. `normalizeBlock()` - 12 edges
2. `getRedisClient()` - 9 edges
3. `main()` - 8 edges
4. `consumeAIQuota()` - 7 edges
5. `predictFormatting()` - 7 edges
6. `chatWithAI()` - 7 edges
7. `buildChatContext()` - 7 edges
8. `extract_line_from_spans()` - 7 edges
9. `build_training_row()` - 7 edges
10. `extract_academic_examples()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `handleSubmit()` --calls--> `login()`  [INFERRED]
  frontend/src/pages/Login.tsx → server/src/controllers/authController.ts
- `handleSubmit()` --calls--> `login()`  [INFERRED]
  frontend/src/pages/Register.tsx → server/src/controllers/authController.ts
- `handleClick()` --calls--> `restoreSelection()`  [INFERRED]
  frontend/src/components/editor/Toolbar.tsx → frontend/src/components/editor/SelectionManager.ts
- `handlePreviewApply()` --calls--> `restoreSelection()`  [INFERRED]
  frontend/src/components/editor/AIChatbot.tsx → frontend/src/components/editor/SelectionManager.ts
- `applyPromptFormat()` --calls--> `restoreSelection()`  [INFERRED]
  frontend/src/pages/Document.tsx → frontend/src/components/editor/SelectionManager.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (43): build_context(), build_training_row(), classify_page_type(), ensure_parent_directory(), estimate_body_font_size(), extract_academic_examples(), extract_line_from_spans(), extract_pdf_lines() (+35 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (19): createBehaviorEvent(), applyPromptFormat(), findEditableBlock(), getPlainText(), handleContentChange(), handleFormat(), handleGrammarApply(), handleManualSave() (+11 more)

### Community 2 - "Community 2"
Cohesion: 0.15
Nodes (21): requestFormatPrediction(), requestGrammarCheck(), requestSpellingCheck(), enforceQuota(), getText(), getUserId(), grammarCheck(), predictFormatting() (+13 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (26): build_issue(), build_training_frame(), detect_article_mismatch(), detect_issues(), detect_repeated_words(), detect_sentence_boundary_issues(), detect_subject_verb_mismatch(), evaluate_text() (+18 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (13): blockquote(), bulletList(), clearFormatting(), codeBlock(), getCurrentBlockTag(), heading1(), heading2(), heading3() (+5 more)

### Community 5 - "Community 5"
Cohesion: 0.13
Nodes (16): buildBehaviorSummary(), extractFormatFromAction(), getBehaviorSummary(), incrementCount(), logBehaviorEvent(), triggerAggregation(), triggerFeatureExport(), triggerFeatureExtraction() (+8 more)

### Community 6 - "Community 6"
Cohesion: 0.16
Nodes (16): buildHistoryMessages(), chatWithAI(), detectFormattingPreview(), getProviderSummary(), buildAIChatSystemPrompt(), formatRejectedFormattingPreviews(), buildChatContext(), decodeHtmlEntities() (+8 more)

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (11): formatPreviewLabel(), handlePreviewApply(), hasRejectedPreview(), send(), clearSelection(), getSelectedText(), getSelection(), hasSelection() (+3 more)

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (16): BaseModel, build_feature_row(), grammar_check(), health_check(), load_model_payload(), predict_format(), PredictRequest, PredictResponse (+8 more)

### Community 9 - "Community 9"
Cohesion: 0.18
Nodes (16): build_formatting_rows(), build_grammar_rows(), ensure_directory(), infer_format_label(), load_jsonl(), main(), preprocess_jfleg(), preprocess_wikitext() (+8 more)

### Community 10 - "Community 10"
Cohesion: 0.19
Nodes (14): evaluate_model(), load_training_data(), main(), Load the processed formatting dataset from disk., Select numeric feature columns used for model training., Split the dataset into train and validation sets., Train a simple baseline formatting classifier., Evaluate the model on the validation split. (+6 more)

### Community 11 - "Community 11"
Cohesion: 0.22
Nodes (14): download_jfleg(), download_wikitext(), ensure_directory(), main(), Create a directory if it does not already exist., Save each split in a dataset dictionary as JSONL files., Write simple metadata about the downloaded datasets., Download WikiText-103 raw and save it locally. (+6 more)

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (14): build_issue(), check_spelling(), edit_distance(), extract_words(), is_reliable_correction(), main(), Extract candidate words from text for spell checking., Build a structured spelling issue payload. (+6 more)

### Community 13 - "Community 13"
Cohesion: 0.15
Nodes (3): login(), handleSubmit(), handleSubmit()

### Community 14 - "Community 14"
Cohesion: 0.36
Nodes (8): AIClientError, buildBody(), chat(), getConfig(), getProviderSummary(), readErrorDetails(), readText(), stream()

### Community 18 - "Community 18"
Cohesion: 0.6
Nodes (5): collect_events(), ensure_schema(), main(), parse_timestamp(), run_once()

### Community 21 - "Community 21"
Cohesion: 0.7
Nodes (4): ensure_export_dir(), export_features(), main(), table_exists()

### Community 22 - "Community 22"
Cohesion: 0.7
Nodes (4): ensure_feature_table(), extract_features(), main(), overwrite_features()

### Community 23 - "Community 23"
Cohesion: 0.83
Nodes (3): getAppParams(), getAppParamValue(), toSnakeCase()

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (2): buildGrammarResult(), runCheck()

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (2): fetchAPI(), getAuthToken()

### Community 29 - "Community 29"
Cohesion: 0.67
Nodes (1): cn()

## Knowledge Gaps
- **70 isolated node(s):** `Load the trained base formatting model from disk.`, `Build the same numeric features used during base model training.`, `Return a simple welcome payload.`, `Return a health check payload.`, `Predict a formatting label for the given text.` (+65 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 27`** (3 nodes): `buildGrammarResult()`, `runCheck()`, `GrammarPanel.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (3 nodes): `api.ts`, `fetchAPI()`, `getAuthToken()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (3 nodes): `utils.js`, `utils.ts`, `cn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `evaluate_text()` connect `Community 3` to `Community 8`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `grammar_check()` connect `Community 8` to `Community 3`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `consumeAIQuota()` connect `Community 2` to `Community 6`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `getRedisClient()` (e.g. with `appendBehaviorEvent()` and `getBehaviorEvents()`) actually correct?**
  _`getRedisClient()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `consumeAIQuota()` (e.g. with `getRedisClient()` and `enforceQuota()`) actually correct?**
  _`consumeAIQuota()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `predictFormatting()` (e.g. with `getCachedSuggestion()` and `predictFormat()`) actually correct?**
  _`predictFormatting()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Load the trained base formatting model from disk.`, `Build the same numeric features used during base model training.`, `Return a simple welcome payload.` to the rest of the system?**
  _70 weakly-connected nodes found - possible documentation gaps or missing edges._