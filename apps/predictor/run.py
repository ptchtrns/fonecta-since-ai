"""Answers every target question, writes the predictions file and scores it.

Usage: python3 apps/predictor/run.py [--season 2026|2025]
"""

import argparse
import csv
import subprocess
from pathlib import Path

from clues import guess_from_last_year, guess_from_mall, guess_from_peers, guess_from_reviews
from combine import combine
from hours import shown_on_google_back_then, shown_on_google_now
from load import load_everything

ROOT = Path(__file__).parents[2]
DATASET = ROOT / "data" / "fonecta-connect-suggests-2026"

SEASONS = {
    "2026": {
        "snapshot": "2026-11-06",
        "is_back_test": False,
        "questions": DATASET / "evaluation" / "targets_2026.csv",
        "answers": DATASET / "labels" / "dev_labels_2026.csv",
        "output": ROOT / "predictions_2026.csv",
    },
    "2025": {
        "snapshot": "2025-11-06",
        "is_back_test": True,
        "questions": DATASET / "evaluation" / "targets_2025_backtest.csv",
        "answers": DATASET / "labels" / "dev_labels_2025_backtest.csv",
        "output": ROOT / "predictions_2025_backtest.csv",
    },
}


def main():
    """Predict an action for each question in the season and run the official scorer on the result."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", choices=SEASONS, default="2026")
    season = SEASONS[parser.parse_args().season]

    data = load_everything(season["snapshot"])

    with open(season["questions"], encoding="utf-8") as questions_file:
        questions = list(csv.DictReader(questions_file))

    with open(season["output"], "w", newline="", encoding="utf-8") as output_file:
        writer = csv.writer(output_file)
        writer.writerow(["entity_id", "date", "action", "hours", "confidence"])

        for question in questions:
            business = data["businesses"][question["entity_id"]]
            if season["is_back_test"]:
                shown = shown_on_google_back_then(data, business, question["date"])
            else:
                shown = shown_on_google_now(business, question["date"])

            guess = combine([
                guess_from_mall(data, business, question["date"]),
                guess_from_last_year(data, business, question["day_key"], question["date"]),
                guess_from_reviews(data, business, question["day_key"]),
                guess_from_peers(data, business, question["day_key"]),
            ])

            if guess and guess["hours"] != shown:
                writer.writerow([question["entity_id"], question["date"], "SUGGEST", guess["hours"], guess["confidence"]])

    print(f"Wrote {len(questions)} rows to {season['output'].name}")

    subprocess.run([
        "python3", DATASET / "evaluation" / "evaluate.py",
        "--predictions", season["output"],
        "--labels", season["answers"],
    ])


if __name__ == "__main__":
    main()
