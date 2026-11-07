"""Answers every question of a season, writes the predictions file and scores it.

    python3 apps/predictor/run.py                     # 2026 season -> predictions_2026.csv
    python3 apps/predictor/run.py --season 2025       # back-test, as if today were 6 Nov 2025
    python3 apps/predictor/run.py --save local        # also put the 2026 predictions on the dashboard
    python3 apps/predictor/run.py --business FI-D0001 # one business's 2026 predictions as JSON, nothing written
"""

import argparse
import csv
import json
import subprocess
import sys
from pathlib import Path

from clues import flag_if_closed_for_good
from decider import choose, confidence
from hours import normal_hours, shown_on_google_back_then, shown_on_google_now
from load import load_business_questions, load_everything, load_questions, load_yext_questions
from options import options_for, weak_closed_reason
from save import save_predictions

# The web app's key for its question about a business that may have shut down, where other answers have a date.
CLOSED_FOR_GOOD = "closed-for-good"

# first_checks' answer when the owner has already decided this day.
QUIET = "quiet"

ROOT = Path(__file__).parents[2]
DATASET = ROOT / "data" / "fonecta-connect-suggests-2026"

SEASONS = {
    "2026": {
        "name": "2026",
        "snapshot": "2026-11-06",
        "is_back_test": False,
        "answers": DATASET / "labels" / "dev_labels_2026.csv",
        "output": ROOT / "predictions_2026.csv",
    },
    "2025": {
        "name": "2025",
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
    parser.add_argument("--business", help="print one business's 2026 predictions as JSON instead")
    args = parser.parse_args()
    if args.business:
        print(json.dumps(predict_business(args.business), ensure_ascii=False, indent=2))
        return
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


def predict_business(business_id):
    """Fresh 2026 predictions for one business, for the worker to run after its owner answers a suggestion.

    The data is loaded again on every call, so the owner's latest answers are always included.
    Returns [{"date", "day_key", "action", "shown", "hours", "confidence", "reasons"}], one per day that
    needs a suggestion or a flag.
    """
    season = SEASONS["2026"]
    data = load_everything(season["snapshot"], include_live_answers=True)
    if business_id not in data["businesses"]:
        raise ValueError(f"No business with the ID {business_id}")

    predictions = []
    for question in load_business_questions(2026, business_id):
        answer = decide(data, season, question)
        if answer is None:
            continue
        predictions.append({
            "date": question["date"],
            "day_key": question["day_key"],
            "action": answer["action"],
            "shown": answer["shown"],
            "hours": answer.get("hours"),
            "confidence": answer.get("confidence"),
            "reasons": answer["reasons"],
        })
    return predictions


def decide(data, season, question):
    """What to do for one business on one day: a FLAG, a SUGGEST with hours, or None to stay quiet."""
    answer, shown, rejected = first_checks(data, season, question)
    if answer == QUIET:
        return None
    if answer:
        return answer

    business = data["businesses"][question["entity_id"]]
    options = options_for(data, business, question, shown, rejected)
    chosen = choose(options, season["name"])
    if chosen is None:
        return None  # no option is likely enough to be worth a message

    option, expected = chosen
    # Every clue that proposed these hours gives its own reason, so the owner may see several.
    reasons = [guess["reason"] for guess in option["guesses"]]
    if not reasons:
        reasons = [weak_closed_reason(option["features"])]
    return {
        "action": "SUGGEST",
        "hours": option["hours"],
        "confidence": round(confidence(expected), 3),
        "reasons": reasons,
        "shown": shown,
    }


def first_checks(data, season, question):
    """(answer, shown, rejected) before any options are weighed.

    answer is a FLAG for a business that seems to have shut down, QUIET when the owner has already
    decided this day, or None when the options need weighing. shown is what Google shows for the day,
    and rejected the hours the owner already said no to for this holiday.
    """
    business = data["businesses"][question["entity_id"]]
    business_id = business["meta"]["id"]
    day = question["date"]
    answered = data["owner_answers"]["answered"]
    rejected = data["owner_answers"]["rejected"][(business_id, question["day_key"])]

    if season["is_back_test"]:
        shown = shown_on_google_back_then(data, business, day)
    else:
        shown = shown_on_google_now(business, day)

    if (business_id, CLOSED_FOR_GOOD) not in answered:
        flag = flag_if_closed_for_good(data, business)
        if flag:
            return dict(flag, shown=shown), shown, rejected

    if (business_id, day) in answered:
        return QUIET, shown, rejected  # the owner has already answered for this day, and they have the last word
    if shown != normal_hours(data, business, day):
        return QUIET, shown, rejected  # the owner has already entered hours for this day; we don't second-guess them
    return None, shown, rejected


if __name__ == "__main__":
    main()
