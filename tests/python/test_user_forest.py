"""A user's own RandomForest, fine-tuned on their labeled feedback, takes part in /predict's Tier 2."""

import asyncio
import json
import os
import pickle
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml" / "src"))
sys.path.insert(0, str(ROOT / "ml"))
sys.path.insert(0, str(ROOT / "ml" / "training"))

import fine_tuner  # noqa: E402
import main  # noqa: E402
import storage  # noqa: E402
import user_forest  # noqa: E402

# Plain sentences no Tier 1 rule answers, so the RandomForest decides them.
SENTENCES = [
    "The respondents were asked to rate each statement on a five point scale.",
    "Data were gathered through an online survey distributed to the students.",
    "This chapter presents the analysis and interpretation of the gathered data.",
    "Each participant completed the questionnaire within twenty minutes.",
    "The researchers used purposive sampling to select the respondents.",
    "Results show that most students prefer automated formatting tools.",
]
PROBE = "The study was conducted during the second semester of the school year."


def _rows(texts: list[str]) -> tuple[list[str], list[list[float]]]:
    base = main.load_model_payload()
    columns = list(base["feature_columns"])
    rows = []
    for text in texts:
        row = main.build_feature_row(main.PredictRequest(text=text, genre="thesis")).reindex(columns=columns, fill_value=0)
        rows.append([float(v) for v in row.iloc[0].tolist()])
    return columns, rows


def _predict(text: str, **fields) -> main.PredictResponse:
    return asyncio.run(main.predict_format_core(main.PredictRequest(text=text, genre="thesis", **fields)))


def test_training_needs_enough_examples_and_more_than_one_format():
    assert not fine_tuner.can_train(["paragraph"] * 4)
    assert not fine_tuner.can_train(["paragraph"] * 9)
    assert fine_tuner.can_train(["paragraph"] * 4 + ["blockquote"])


def test_the_user_model_counts_for_more_as_it_learns_from_more_examples():
    assert user_forest.user_weight(0) == 0.0
    assert user_forest.user_weight(5) == pytest.approx(0.2)
    assert user_forest.user_weight(20) == pytest.approx(0.5)
    assert user_forest.user_weight(500) == user_forest.MAX_WEIGHT


def test_a_user_who_quotes_such_sentences_gets_blockquote_suggestions(monkeypatch):
    """Feedback that labels plain sentences as block quotes moves the prediction for a similar one;
    the baseline mode, and a user without a model, still get the base model's answer."""
    base_answer = _predict(PROBE, user_id="someone-else", isolation_mode="baseline")
    paragraphs = ["Introduction to the system.", "Summary of findings and recommendations for future work."]
    columns, rows = _rows(SENTENCES * 4 + paragraphs * 2)
    labels = ["blockquote"] * (len(SENTENCES) * 4) + ["paragraph"] * 4
    personal = fine_tuner.train_user_forest(columns, rows, labels)
    monkeypatch.setattr(main, "load_user_forest", lambda user_id, genre: personal if (user_id, genre) == ("u1", "thesis") else None)

    mine = _predict(PROBE, user_id="u1", isolation_mode="hybrid")
    assert mine.predicted_format == "blockquote"
    assert mine.genre_partition_hit is True
    assert _predict(PROBE, user_id="u1", isolation_mode="baseline").predicted_format == base_answer.predicted_format
    assert _predict(PROBE, user_id="u2", isolation_mode="hybrid").predicted_format == base_answer.predicted_format


def test_the_fine_tuner_saves_and_uploads_the_model(tmp_path):
    columns, rows = _rows(SENTENCES)
    examples = tmp_path / "examples.json"
    examples.write_text(json.dumps({"feature_columns": columns, "rows": rows, "labels": ["paragraph", "blockquote"] * 3}))
    script = (
        "import sys, runpy; sys.path.insert(0, r'%s'); import storage; "
        "storage.upload_user_forest = lambda path, user, genre: print('upload', user, genre) or True; "
        "sys.argv = ['fine_tuner.py', '--user-id', 'u1', '--genre', 'thesis', '--examples', r'%s']; "
        "runpy.run_path(r'%s', run_name='__main__')"
    ) % (ROOT / "ml", examples, ROOT / "ml" / "training" / "fine_tuner.py")
    env = {**os.environ, "USER_MODEL_DIR": str(tmp_path), "PYTHONIOENCODING": "utf-8"}
    done = subprocess.run([sys.executable, "-c", script], env=env, capture_output=True, text=True, cwd=str(ROOT / "ml"))
    assert done.returncode == 0, done.stderr
    assert "upload u1 thesis" in done.stdout
    saved = pickle.loads((tmp_path / "user_u1__thesis.forest.pkl").read_bytes())
    assert saved["n_examples"] == 6 and saved["feature_columns"] == columns


def test_storage_object_is_genre_scoped():
    assert storage.user_forest_object("u1", "thesis") == "u1/thesis.forest.pkl"


def test_fine_tune_trains_each_genre_on_its_own_blocks(monkeypatch):
    """Feedback from thesis documents never trains the memo model, and labels the base model cannot
    predict are left out."""
    runs = []

    def fake_run(command, **_kwargs):
        if "--examples" in command:
            genre = command[command.index("--genre") + 1]
            with open(command[command.index("--examples") + 1], encoding="utf-8") as handle:
                runs.append((genre, json.load(handle)["labels"]))
        return subprocess.CompletedProcess(command, 0)

    class InlineThread:
        def __init__(self, target, **_kwargs):
            self.target = target

        def start(self):
            self.target()

    import threading

    monkeypatch.setattr(subprocess, "run", fake_run)
    monkeypatch.setattr(threading, "Thread", InlineThread)
    examples = [
        main.FineTuneExample(text="CHAPTER I INTRODUCTION", label="heading1", genre="thesis"),
        main.FineTuneExample(text="Body of the thesis.", label="paragraph", genre="thesis"),
        main.FineTuneExample(text="MEMORANDUM", label="title", genre="memo"),
        main.FineTuneExample(text="Something", label="not_a_model_label", genre="memo"),
    ]
    asyncio.run(main.trigger_fine_tune(main.FineTuneRequest(user_id="u1", examples=examples)))
    assert sorted(runs) == [("memo", ["title"]), ("thesis", ["heading1", "paragraph"])]


@pytest.mark.parametrize("low_memory, lstm_runs", [(True, 0), (False, 1)])
def test_the_lstm_trains_only_where_torch_fits(monkeypatch, low_memory, lstm_runs):
    """torch takes ~500 MB: on a 512 MB host only the user's RandomForest is trained."""
    import threading

    commands = []
    monkeypatch.setattr(subprocess, "run", lambda command, **_k: commands.append(command) or subprocess.CompletedProcess(command, 0))
    monkeypatch.setattr(threading, "Thread", lambda target, **_k: type("T", (), {"start": lambda self: target()})())
    monkeypatch.setattr(main, "_low_memory_host", lambda: low_memory)
    examples = [main.FineTuneExample(text="CHAPTER I INTRODUCTION", label="heading1", genre="thesis")]
    asyncio.run(main.trigger_fine_tune(main.FineTuneRequest(user_id="u1", genre="thesis", examples=examples)))
    assert sum("lstm_trainer.py" in str(part) for command in commands for part in command) == lstm_runs
    assert sum("fine_tuner.py" in str(part) for command in commands for part in command) == 1
