"""Puts a run's predictions in the web app's database, where the dashboard shows them.

Wrangler does the writing, the same way the dataset gets loaded: the database belongs to the web app,
which may be running, and the deployed one can't be reached any other way.
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from load import database

WEB_APP = Path(__file__).parents[1] / "web"


def save_predictions(predictions, target):
    """Replace the prediction table in the "local" or "remote" database with these predictions."""
    if target == "remote":
        predictions = only_shown_businesses(predictions)

    with tempfile.NamedTemporaryFile("w", suffix=".sql", encoding="utf-8") as file:
        file.write("DELETE FROM prediction;\n")
        for prediction in predictions:
            file.write(insert_statement(prediction))
        file.flush()

        done = subprocess.run(
            ["pnpm", "exec", "wrangler", "d1", "execute", "DB", f"--{target}", "--yes", "--file", file.name],
            cwd=WEB_APP,
            stdout=subprocess.PIPE,
            text=True,
        )
    if done.returncode != 0:
        sys.exit(f"Saving the predictions failed:\n{done.stdout}")
    print(f"Saved {len(predictions)} predictions to the {target} database")


def only_shown_businesses(predictions):
    """The deployed database only has the demo businesses and those from Yext, so the others have nowhere to go."""
    shown = {row["id"] for row in database().execute("SELECT id FROM entity WHERE split IN ('demo', 'yext')")}
    return [prediction for prediction in predictions if prediction["question"]["entity_id"] in shown]


def insert_statement(prediction):
    values = [
        prediction["question"]["entity_id"],
        prediction["question"]["date"],
        prediction["question"]["day_key"],
        prediction["action"],
        prediction["shown"],
        prediction.get("hours"),
        prediction.get("confidence"),
        json.dumps(prediction["reasons"], ensure_ascii=False),
    ]
    columns = "entity_id, date, day_key, action, shown_hours, hours, confidence, reasons"
    # A business from Yext may not have been taken on in the other database yet.
    exists = f"SELECT 1 FROM entity WHERE id = {sql_value(values[0])}"
    return (
        f"INSERT INTO prediction ({columns}) SELECT {', '.join(map(sql_value, values))} WHERE EXISTS ({exists});\n"
    )


def sql_value(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + value.replace("'", "''") + "'"
