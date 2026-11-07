"""Picks one option for a business on a day, or none, with a model learned from past seasons.

For each option the model predicts how many points suggesting it would earn: +1 if it turns out
right, -1 if it gets open/closed the wrong way round, -0.5 for messaging an owner whose hours were
already right, and so on. The best option is suggested if that number is above zero. Otherwise
staying quiet is the better bet.

The model is a set of decision trees in models/decider_<season>.json, made by train.py. Using it
needs only the standard library.
"""

import json
from functools import lru_cache
from pathlib import Path

MODELS = Path(__file__).parent / "models"

# Suggest only when the expected points are above this.
MIN_EXPECTED_POINTS = 0.0


def choose(options, season):
    """(option, expected points) for the option worth suggesting, or None to stay quiet."""
    model = load_model(season)
    best_option = None
    best_points = None
    for option in options:
        row = [option["features"][name] for name in model["features"]]
        points = model["predict"](row)
        if best_points is None or points > best_points:
            best_option = option
            best_points = points

    if best_option is None or best_points <= MIN_EXPECTED_POINTS:
        return None
    return best_option, best_points


def confidence(expected_points):
    """Expected points as a confidence from 0 to 1. An option that is right with chance p and
    wrong otherwise earns 2p - 1 points on average, so p = (points + 1) / 2."""
    return max(0.0, min(1.0, (expected_points + 1) / 2))


@lru_cache(maxsize=None)
def load_model(season):
    """{"features": [names in the order predict() expects them], "predict": function}."""
    path = MODELS / f"decider_{season}.json"
    if not path.exists():
        raise SystemExit(f"No model in {path}. Make it with: uv run apps/predictor/train.py")
    saved = json.loads(path.read_text(encoding="utf-8"))
    return {"features": saved["features"], "predict": make_predict_function(saved)}


def make_predict_function(saved):
    """Turns the saved trees into one Python function.

    A 2026 run asks for about 34,000 predictions, each going through 900 trees. Following the trees
    node by node in a loop took most of a run's time. Written out as nested if statements and compiled
    once, the same comparisons run about four times as fast, which halves a whole run. For a tree with
    one split the code is:

        if x[12] <= 0.5:
            total += 0.031
        else:
            total += -0.087

    Each node in the saved trees is [feature, threshold, left child, right child, value], where
    feature -1 marks a leaf. The saved models are averaged, so every value is divided by their number.
    """
    model_count = len(saved["models"])
    baseline = 0.0
    for model in saved["models"]:
        baseline += model["baseline"] / model_count

    lines = ["def predict(x):", f"    total = {baseline!r}"]
    for model in saved["models"]:
        for tree in model["trees"]:
            write_node(lines, tree, 0, 1, model_count)
    lines.append("    return total")

    namespace = {}
    exec(compile("\n".join(lines), "decider", "exec"), namespace)
    return namespace["predict"]


def write_node(lines, tree, index, depth, model_count):
    feature, threshold, left, right, value = tree[index]
    indent = "    " * depth
    if feature < 0:
        lines.append(f"{indent}total += {value / model_count!r}")
        return
    lines.append(f"{indent}if x[{feature}] <= {threshold!r}:")
    write_node(lines, tree, left, depth + 1, model_count)
    lines.append(f"{indent}else:")
    write_node(lines, tree, right, depth + 1, model_count)
