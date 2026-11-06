import csv
import subprocess
from pathlib import Path

from clues import guess_from_last_year
from hours import shown_on_google
from load import load_everything

ROOT = Path(__file__).parents[2]
DATASET = ROOT / "data" / "fonecta-connect-suggests-2026"
QUESTIONS = DATASET / "evaluation" / "targets_2026.csv"
OUTPUT = ROOT / "predictions_2026.csv"


def main():
    data = load_everything()

    with open(QUESTIONS, encoding="utf-8") as questions_file:
        questions = list(csv.DictReader(questions_file))

    with open(OUTPUT, "w", newline="", encoding="utf-8") as output_file:
        writer = csv.writer(output_file)
        writer.writerow(["entity_id", "date", "action", "hours", "confidence"])

        for question in questions:
            business = data["businesses"][question["entity_id"]]
            shown = shown_on_google(business, question["date"])
            guess = guess_from_last_year(data, business, question["day_key"], question["date"])

            if guess and guess != shown:
                writer.writerow([question["entity_id"], question["date"], "SUGGEST", guess, ""])


    print(f"Wrote {len(questions)} rows to {OUTPUT.name}")

    subprocess.run(["python3", DATASET / "evaluation" / "evaluate.py", "--predictions", OUTPUT])


if __name__ == "__main__":
    main()
