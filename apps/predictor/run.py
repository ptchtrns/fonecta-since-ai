"""Answers every question of a season, writes the predictions file and scores it.

    python3 apps/predictor/run.py                 # 2026 season -> predictions_2026.csv
    python3 apps/predictor/run.py --season 2025   # back-test, as if today were 6 Nov 2025
    python3 apps/predictor/run.py --save local    # also put the 2026 predictions on the dashboard
"""

import argparse
import csv
import subprocess
import sys
from pathlib import Path

from clues import (
    flag_if_closed_for_good,
    guess_from_google_edits,
    guess_from_last_year,
    guess_from_mall,
    guess_from_peers,
    guess_from_reviews,
    guess_from_seasonal_break,
    guess_from_snow,
    guess_from_type_habits,
)
from combine import combine
from hours import normal_hours, shown_on_google_back_then, shown_on_google_now
from load import load_everything, load_questions, load_yext_questions
from save import save_predictions

# The web app's key for its question about a business that may have shut down, where other answers have a date.
CLOSED_FOR_GOOD = "closed-for-good"

ROOT = Path(__file__).parents[2]
DATASET = ROOT / "data" / "fonecta-connect-suggests-2026"

SEASONS = {
    "2026": {
        "snapshot": "2026-11-06",
        "is_back_test": False,
        "answers": DATASET / "labels" / "dev_labels_2026.csv",
        "output": ROOT / "predictions_2026.csv",
    },
    "2025": {
        "snapshot": "2025-11-06",
        "is_back_test": True,
        "answers": DATASET / "labels" / "dev_labels_2025_backtest.csv",
        "output": ROOT / "predictions_2025_backtest.csv",
    },
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", choices=SEASONS, default="2026")
    parser.add_argument("--save", choices=["local", "remote"], help="which database the dashboard should show this in")
    args = parser.parse_args()
    if args.save and args.season != "2026":
        parser.error("--save is only for the 2026 season: a back-test isn't something to show owners")
    season = SEASONS[args.season]

    data = load_everything(season["snapshot"], include_live_answers=not season["is_back_test"])
    questions = load_questions(int(args.season))

    predictions = []
    with open(season["output"], "w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["entity_id", "date", "action", "hours", "confidence"])
        for question in questions:
            answer = decide(data, season, question)
            if answer:
                hours = answer.get("hours", "")
                confidence = answer.get("confidence", "")
                writer.writerow([question["entity_id"], question["date"], answer["action"], hours, confidence])
                predictions.append(dict(answer, question=question))

    print(f"Wrote {season['output'].name}")
    if args.save:
        # Businesses from the Yext account are shown on the dashboard, but they aren't in the file or the score.
        from_yext = [
            dict(answer, question=question)
            for question in load_yext_questions(int(args.season))
            if (answer := decide(data, season, question))
        ]
        if from_yext:
            print(f"{len(from_yext)} suggestions for businesses from Yext")
        save_predictions(predictions + from_yext, args.save)
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

    business_id = business["meta"]["id"]
    answered = data["owner_answers"]["answered"]
    rejected = data["owner_answers"]["rejected"][(business_id, holiday)]

    if season["is_back_test"]:
        shown = shown_on_google_back_then(data, business, day)
    else:
        shown = shown_on_google_now(business, day)

    if (business_id, CLOSED_FOR_GOOD) not in answered:
        flag = flag_if_closed_for_good(data, business)
        if flag:
            return dict(flag, shown=shown)

    if (business_id, day) in answered:
        return None  # the owner has already answered for this day, and they have the last word
    if shown != normal_hours(data, business, day):
        return None  # the owner has already entered hours for this day; we don't second-guess them

    guesses = [
        guess_from_mall(data, business, day),
        guess_from_last_year(data, business, holiday, day),
        guess_from_reviews(data, business, holiday, day),
        guess_from_peers(data, business, holiday),
        guess_from_type_habits(data, business, holiday),
        guess_from_google_edits(data, business, holiday),
        guess_from_snow(data, business, day),
        guess_from_seasonal_break(data, business, day),
    ]
    # Never suggest hours the owner already said no to for this holiday.
    guess = combine([guess for guess in guesses if guess and guess["hours"] not in rejected])
    if guess is None:
        return None

    if guess["hours"] == shown:
        return None  # Google already shows it
    return dict(guess, action="SUGGEST", shown=shown)


if __name__ == "__main__":
    main()
