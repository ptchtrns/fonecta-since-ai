#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy>=1.26", "scikit-learn>=1.5,<1.10"]
# ///
"""Teaches the decider which options turn out right, from seasons that ended before the snapshot.

    uv run apps/predictor/train.py           # both models, about two minutes
    uv run apps/predictor/train.py --check   # also score each season on dev businesses the model never saw

Each model only learns from what was known before its own snapshot:
- decider_2026.json: the dev businesses' true hours in the 2024 and 2025 seasons and three springs, and
  the 2025 pilot's answers from businesses outside dev (decided in December 2025).
- decider_2025.json, for the back-test: the 2024 season and the springs of 2024 and 2025.

A past season is replayed from its own snapshot date with the same clues and options as run.py, and
every option is scored the way the organisers' scorer would have scored it. Training needs
scikit-learn. The saved model is plain JSON that decider.py reads with the standard library.
"""

import argparse
import csv
import json
import sys
import tempfile
import zlib
from pathlib import Path

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor

import ai
import run
from decider import MIN_EXPECTED_POINTS, MODELS, make_predict_function
from load import database, load_everything, load_questions
from options import options_for

sys.path.insert(0, str(run.DATASET / "evaluation"))
from evaluate import score  # noqa: E402  the organisers' scorer, which lives in the dataset folder

# (snapshot, first day, last day). The spring snapshots fall before Easter.
WINDOWS = {
    "winter2024": ("2024-11-06", "2024-11-07", "2025-01-06"),
    "winter2025": ("2025-11-06", "2025-11-07", "2026-01-06"),
    "spring2024": ("2024-03-15", "2024-03-15", "2024-06-30"),
    "spring2025": ("2025-04-01", "2025-04-01", "2025-06-30"),
    "spring2026": ("2026-03-20", "2026-03-20", "2026-06-30"),
    "pilot2025": ("2025-11-06", "2025-11-07", "2026-01-06"),
}
TRAINING = {
    "2026": ["winter2024", "winter2025", "spring2024", "spring2025", "spring2026", "pilot2025"],
    "2025": ["winter2024", "spring2024", "spring2025"],
}

# Chosen on dev businesses the model never saw, in both seasons.
PARAMS = dict(max_iter=300, learning_rate=0.05, max_leaf_nodes=15, min_samples_leaf=50, l2_regularization=1.0)
SEEDS = 3  # models averaged, which steadies the result
FOLDS = 5


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="score each season on businesses the model never saw")
    args = parser.parse_args()
    only_cached_ai_answers()

    examples = {}
    for name in WINDOWS:
        examples[name] = build_examples(name)

    MODELS.mkdir(exist_ok=True)
    for season, windows in TRAINING.items():
        rows = rows_from(examples, windows)
        features = sorted(rows[0]["features"])
        models = fit(rows, features)
        saved = export(models, features, rows)
        path = MODELS / f"decider_{season}.json"
        path.write_text(json.dumps(saved, separators=(",", ":")), encoding="utf-8")
        print(f"{path.name}: {len(rows)} options from {', '.join(windows)}")

    if args.check:
        for season, windows in TRAINING.items():
            predictions, data = check(season, rows_from(examples, windows))
            report(season, predictions, data)


def only_cached_ai_answers():
    """A few reviews from the old seasons were never read. Treat them as unread instead of paying to read them."""
    ask = ai.ask

    def ask_if_cached(question, instructions, model=ai.MODEL):
        if ai.is_cached(question, instructions, model):
            return ask(question, instructions, model)
        return {}

    ai.ask = ask_if_cached


def rows_from(examples, windows):
    rows = []
    for name in windows:
        rows.extend(examples[name])
    return rows


def build_examples(name):
    """One row per option the predictor would have weighed in this window, with the points it would have earned.

    "dev_business" is the dev business a row belongs to, so the check can hold it out. Pilot rows come
    from businesses outside dev and are never held out.
    """
    snapshot, first, last = WINDOWS[name]
    data = load_everything(snapshot)
    season = {"name": None, "snapshot": snapshot, "is_back_test": True}

    rows = []
    for question, truth, declined in questions(name, first, last):
        answer, shown, rejected = run.first_checks(data, season, question)
        if answer:
            continue
        business = data["businesses"][question["entity_id"]]
        for option in options_for(data, business, question, shown, rejected):
            if declined is None:
                earned = points(truth, shown, option["hours"])
            elif option["hours"] == declined:
                # The owner only said what was wrong, not what was right. Score it as if Google was right.
                earned = points(shown, shown, option["hours"])
            else:
                continue

            dev_business = None
            if name != "pilot2025":
                dev_business = question["entity_id"]
            rows.append({"dev_business": dev_business, "features": option["features"], "points": earned})
    return rows


def questions(name, first, last):
    """(question, true hours, declined hours) for every day of the window with a known outcome."""
    if name == "pilot2025":
        yield from pilot_questions()
        return
    rows = database().execute(
        """SELECT entity_id, date, day_key, truth_hours FROM dev_truth_history
           WHERE date BETWEEN ? AND ? AND day_key IS NOT NULL ORDER BY entity_id, date""",
        (first, last),
    )
    for row in rows:
        question = {"entity_id": row["entity_id"], "date": row["date"], "day_key": row["day_key"]}
        yield question, row["truth_hours"], None


def pilot_questions():
    """The pilot's answers from businesses outside dev. The dev ones are already in the true hours."""
    rows = database().execute(
        """SELECT p.entity_id, p.date, p.day_key, p.decision, p.suggested_hours, p.final_hours
           FROM pilot_decision p JOIN entity e ON e.id = p.entity_id
           WHERE e.split != 'dev' AND p.decision IN ('ACCEPTED', 'EDITED', 'REJECTED')"""
    )
    for row in rows:
        question = {"entity_id": row["entity_id"], "date": row["date"], "day_key": row["day_key"]}
        if row["decision"] == "ACCEPTED":
            yield question, row["suggested_hours"], None
        elif row["decision"] == "EDITED":
            yield question, row["final_hours"], None
        else:
            yield question, None, row["suggested_hours"]


def points(truth, shown, hours):
    """What suggesting these hours would earn, as in the organisers' evaluate.py."""
    change_needed = truth != shown
    wrong_state = (hours == "closed") != (truth == "closed")
    if change_needed:
        if hours == truth:
            return 1.0
        if wrong_state:
            return -1.0
        if near(hours, truth):
            return 0.6
        return 0.2
    if hours == shown:
        return -0.1
    if wrong_state:
        return -1.0
    return -0.5


def near(hours, other, tolerance=30):
    """Both opening and closing within tolerance minutes, as in evaluate.py."""
    opens, closes = first_and_last_minute(hours)
    other_opens, other_closes = first_and_last_minute(other)
    return abs(opens - other_opens) <= tolerance and abs(closes - other_closes) <= tolerance


def first_and_last_minute(hours):
    """(opening, closing) in minutes after midnight. Closing past midnight counts as the next day."""
    intervals = hours.split(",")
    opens = to_minutes(intervals[0].split("-")[0])
    closes = to_minutes(intervals[-1].split("-")[1])
    if closes <= opens:
        closes += 24 * 60
    return opens, closes


def to_minutes(time):
    hours, minutes = time.split(":")
    return int(hours) * 60 + int(minutes)


def fit(rows, features):
    X = as_matrix([row["features"] for row in rows], features)
    y = np.array([row["points"] for row in rows])
    models = []
    for seed in range(SEEDS):
        models.append(HistGradientBoostingRegressor(random_state=seed, **PARAMS).fit(X, y))
    return models


def as_matrix(feature_dicts, features):
    table = []
    for values in feature_dicts:
        table.append([values[name] for name in features])
    return np.array(table, dtype=float)


def export(models, features, rows):
    """The trees in the format decider.py reads, checked against scikit-learn's own predictions."""
    saved = {"features": features, "models": []}
    for model in models:
        # scikit-learn has no public way to read its histogram trees, so this uses its internal arrays.
        trees = []
        for (predictor,) in model._predictors:
            trees.append(export_tree(predictor.nodes))
        baseline = float(np.ravel(model._baseline_prediction)[0])
        saved["models"].append({"baseline": baseline, "trees": trees})

    sample = rows[:: max(1, len(rows) // 300)]
    X = as_matrix([row["features"] for row in sample], features)
    expected = sum(model.predict(X) for model in models) / len(models)
    predict = make_predict_function(saved)
    for row, value in zip(X.tolist(), expected):
        if abs(predict(row) - value) > 1e-6:
            sys.exit("The exported trees don't match scikit-learn's predictions")
    return saved


def export_tree(nodes):
    """[feature, threshold, left child, right child, value] per node, with feature -1 for a leaf."""
    tree = []
    for node in nodes:
        if node["is_leaf"]:
            tree.append([-1, 0.0, 0, 0, float(node["value"])])
        else:
            tree.append([int(node["feature_idx"]), float(node["num_threshold"]), int(node["left"]), int(node["right"]), 0.0])
    return tree


def check(season, training_rows):
    """The season's answers for the dev businesses, each decided by a model trained without it, and the data
    they were decided from: (predictions, data)."""
    settings = run.SEASONS[season]
    data = load_everything(settings["snapshot"], include_live_answers=not settings["is_back_test"])
    labelled = labelled_businesses(settings["answers"])

    features = sorted(training_rows[0]["features"])
    fold_models = []
    for fold in range(FOLDS):
        rows = [row for row in training_rows if row["dev_business"] is None or fold_of(row["dev_business"]) != fold]
        fold_models.append(fit(rows, features))

    predictions = {}
    for question in load_questions(int(season)):
        if question["entity_id"] not in labelled:
            continue
        key = (question["entity_id"], question["date"])
        answer, shown, rejected = run.first_checks(data, settings, question)
        if answer == run.QUIET:
            continue
        if answer:
            predictions[key] = (answer["action"], answer.get("hours", ""), None)
            continue

        business = data["businesses"][question["entity_id"]]
        options = options_for(data, business, question, shown, rejected)
        if options:
            models = fold_models[fold_of(question["entity_id"])]
            X = as_matrix([option["features"] for option in options], features)
            expected = sum(model.predict(X) for model in models) / len(models)
            best = int(expected.argmax())
            if expected[best] > MIN_EXPECTED_POINTS:
                predictions[key] = ("SUGGEST", options[best]["hours"], None)
                continue
        # As in run.py: where the decider stays quiet, the hours a customer wrote down.
        stated = run.stated_hours_suggestion(data, business, question, shown, rejected)
        if stated:
            predictions[key] = ("SUGGEST", stated["hours"], None)
    return predictions, data


def report(season, predictions, data):
    """Prints the score, and how often the suggestions were right, for all days and split by whether the owner had
    entered that holiday in an earlier year. Every answer an owner gives moves their days into "told before"."""
    settings = run.SEASONS[season]
    with open(settings["answers"], encoding="utf-8") as file:
        labels = list(csv.DictReader(file))

    told = set()
    for entries in data["holiday_history_by_business"].values():
        for entry in entries:
            if entry["date"] < settings["snapshot"]:
                told.add((entry["entity_id"], entry["day_key"]))
    groups = {"all": labels, "told before": [], "never told": []}
    for row in labels:
        if (row["entity_id"], row["day_key"]) in told:
            groups["told before"].append(row)
        else:
            groups["never told"].append(row)

    print(f"{season} on dev businesses the model never saw:")
    print(f"  {'':12} {'days':>6} {'score':>7} {'suggested':>10} {'exact hours':>12} {'open/closed right':>18}"
          f" {'closed doors prevented':>23}")
    with tempfile.TemporaryDirectory() as folder:
        for name, rows in groups.items():
            # The organisers' scorer reads its labels from a file.
            path = Path(folder) / "labels.csv"
            with open(path, "w", newline="", encoding="utf-8") as file:
                writer = csv.DictWriter(file, fieldnames=list(labels[0]))
                writer.writeheader()
                writer.writerows(rows)
            result = score(predictions, path)

            suggested = exact = right_state = 0
            for row in rows:
                prediction = predictions.get((row["entity_id"], row["date"]))
                if not prediction or prediction[0] != "SUGGEST":
                    continue
                suggested += 1
                if row["needs_action"] == "1" and prediction[1] == row["truth_hours"]:
                    exact += 1
                if (prediction[1] == "closed") == (row["truth_hours"] == "closed"):
                    right_state += 1
            print(f"  {name:12} {len(rows):>6} {result['score_0_100']:>6.2f}% {suggested:>10}"
                  f" {percent(exact, suggested):>12} {percent(right_state, suggested):>18}"
                  f" {result['closed_door_views_prevented_pct']:>22.1f}%")


def percent(count, total):
    if not total:
        return "-"
    return f"{100 * count / total:.0f}%"


def labelled_businesses(labels_path):
    with open(labels_path, encoding="utf-8") as file:
        return {row["entity_id"] for row in csv.DictReader(file)}


def fold_of(business_id):
    """Which of the FOLDS groups a business belongs to. The same business always lands in the same one."""
    return zlib.crc32(business_id.encode()) % FOLDS


if __name__ == "__main__":
    main()
