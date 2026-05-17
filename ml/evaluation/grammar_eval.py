import os
import pandas as pd
from grammar.grammar_checker import score_text


DATASET_PATH = os.getenv(
    "GRAMMAR_DATASET_PATH",
    "ml/dataset/processed/grammar_examples.csv",
)


def main() -> None:
    """Evaluate grammar score differences on JFLEG pairs."""
    frame = pd.read_csv(DATASET_PATH)
    pairs = frame[["source", "target"]].dropna()
    if pairs.empty:
        raise ValueError("No grammar pairs found in dataset.")

    sample = pairs.sample(n=min(len(pairs), 2000), random_state=42)

    wins = 0
    margins = []

    for _, row in sample.iterrows():
        source = str(row["source"])
        target = str(row["target"])
        source_score = score_text(source)
        target_score = score_text(target)
        if target_score > source_score:
            wins += 1
        margins.append(target_score - source_score)

    win_rate = wins / len(sample)
    avg_margin = sum(margins) / len(margins)

    print("=== Grammar Model Evaluation ===")
    print(f"Pairs evaluated: {len(sample)}")
    print(f"Target score > Source score: {win_rate:.2%}")
    print(f"Average margin (target - source): {avg_margin:.4f}")


if __name__ == "__main__":
    main()
