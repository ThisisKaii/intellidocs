# Manuscript Training Data

Place your research paper/manuscript files here for base model training.

Supported formats:
- `.pdf` — Will be extracted using PyMuPDF
- `.docx` — Will be extracted using python-docx
- `.txt` — Plain text, read directly

The base trainer (`ml/training/base_trainer.py`) will read files from this
directory and extract formatting features for training the RandomForest model.

This replaces the previous approach of training on WikiText-103 online datasets.
