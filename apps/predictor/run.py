"""Answers every question of a season, writes the predictions file and scores it.

    python3 apps/predictor/run.py                 # 2026 season -> predictions_2026.csv
    python3 apps/predictor/run.py --season 2025   # back-test, as if today were 6 Nov 2025
"""

import argparse
import csv
import subprocess
import sys
from pathlib import Path

from clues import (
    flag_if_closed_for_good,
    guess_from_last_year,
    guess_from_mall,
    guess_from_peers,
    guess_from_reviews,
    guess_from_type_habits,
)
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", choices=SEASONS, default="2026")
    season = SEASONS[parser.parse_args().season]

    data = load_everything(season["snapshot"])
    with open(season["questions"], encoding="utf-8") as file:
        questions = list(csv.DictReader(file))

    with open(season["output"], "w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["entity_id", "date", "action", "hours", "confidence"])
        for question in questions:
            answer = decide(data, season, question)
            if answer:
                writer.writerow([question["entity_id"], question["date"], answer["action"], answer.get("hours", ""), answer.get("confidence", "")])

    print(f"Wrote {season['output'].name}")
    subprocess.run([
        sys.executable, DATASET / "evaluation" / "evaluate.py",
        "--predictions", season["output"],
        "--labels", season["answers"],
    ])


def decide(data, season, question):
    """What to do for one business on one day: a FLAG, a SUGGEST with hours, or None to stay quiet."""
    business = data["businesses"][question["entity_id"]]
    holiday = question["day_key"]
    day = question["date"]

    flag = flag_if_closed_for_good(data, business)
    if flag:
        return flag

    guess = combine([
        guess_from_mall(data, business, day),
        guess_from_last_year(data, business, holiday, day),
        guess_from_reviews(data, business, holiday),
        guess_from_peers(data, business, holiday),
        guess_from_type_habits(data, business, holiday),
    ])
    if guess is None:
        return None

    if season["is_back_test"]:
        shown = shown_on_google_back_then(data, business, day)
    else:
        shown = shown_on_google_now(business, day)

    if guess["hours"] == shown:
        return None  # Google already shows it
    return dict(guess, action="SUGGEST")


if __name__ == "__main__":
    main()
