import argparse
import csv
import subprocess
from pathlib import Path

from clues import guess_from_last_year, guess_from_peers
from hours import shown_on_google
from load import load_everything

ROOT = Path(__file__).parents[2]
DATASET = ROOT / "data" / "fonecta-connect-suggests-2026"

SEASONS = {
    "2026": {
        "snapshot": "2026-11-06",
        "questions": DATASET / "evaluation" / "targets_2026.csv",
        "answers": DATASET / "labels" / "dev_labels_2026.csv",
        "output": ROOT / "predictions_2026.csv",
    },
    "2025": {
        "snapshot": "2025-11-06",
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

    with open(season["questions"], encoding="utf-8") as questions_file:
        questions = list(csv.DictReader(questions_file))

    with open(season["output"], "w", newline="", encoding="utf-8") as output_file:
        writer = csv.writer(output_file)
        writer.writerow(["entity_id", "date", "action", "hours", "confidence"])

        for question in questions:
            business = data["businesses"][question["entity_id"]]
            shown = shown_on_google(data, business, question["date"])
            guess = (
                guess_from_last_year(data, business, question["day_key"], question["date"])
                or guess_from_peers(data, business, question["day_key"])
            )

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
