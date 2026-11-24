"""Blending a user's fine-tuned RandomForest with the base model in the prediction cascade's Tier 2.

The user's model (training/fine_tuner.py) learns from their labeled feedback in the base model's
feature space. Its vote counts for more the more examples it has learned from, so a handful of
accepted or rejected suggestions nudges the base model rather than overruling it:

    p(label) = (1 - w) * p_base(label) + w * p_user(label),   w = min(MAX_WEIGHT, n / (n + PRIOR_EXAMPLES))
"""

from __future__ import annotations

from typing import Any, Sequence, Tuple

# With n labeled blocks the user's model weighs n / (n + 20): 5 examples give 0.2, 20 give 0.5.
PRIOR_EXAMPLES = 20.0
MAX_WEIGHT = 0.6


def user_weight(n_examples: int) -> float:
    """How much the user's model counts against the base model, from how many examples it learned."""
    if n_examples <= 0:
        return 0.0
    return min(MAX_WEIGHT, n_examples / (n_examples + PRIOR_EXAMPLES))


def blend(base_labels: Sequence[str], base_probabilities: Sequence[float], personal: dict[str, Any], features: Any) -> Tuple[str, float]:
    """The label and confidence after blending the user's model into the base model's probabilities.

    `features` is the block's feature frame; it is aligned to the user's model's own columns.
    `base_labels` and `base_probabilities` are the answer so far: the base RandomForest's
    distribution, or Tier 3's single label and confidence when it took over. A label the user's
    model prefers but the answer so far lacks still competes with its user share.
    """
    weight = user_weight(int(personal.get("n_examples", 0)))
    combined = {label: float(p) for label, p in zip(base_labels, base_probabilities)}
    if weight > 0:
        model = personal["model"]
        row = features.reindex(columns=list(personal["feature_columns"]), fill_value=0)
        user_probabilities = {str(label): float(p) for label, p in zip(model.classes_, model.predict_proba(row)[0])}
        labels = set(combined) | set(user_probabilities)
        combined = {label: (1 - weight) * combined.get(label, 0.0) + weight * user_probabilities.get(label, 0.0) for label in labels}
    label = max(combined, key=lambda key: combined[key])
    return label, combined[label]
