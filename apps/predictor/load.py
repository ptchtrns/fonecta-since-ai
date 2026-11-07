"""Loads the challenge data from the web app's local database, keeping only what Connect knew on the snapshot date.

Everything entered, published or written on or after the snapshot is dropped here, so no clue
can accidentally look into the future.

The only answers in the database are in dev_truth_history, which is training data, used here only
for days before the snapshot.
"""

import json
import os
import sqlite3
from collections import defaultdict
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

from hours import published_breaks

D1_FOLDER = Path(__file__).parents[1] / "web" / ".wrangler" / "state" / "v3" / "d1" / "miniflare-D1DatabaseObject"
ALL_BUSINESSES = 3032
HOW_TO_FILL = "Fill it from the repo root with: pnpm db:migrate && pnpm db:seed"


def load_everything(snapshot):
    """Load all the data the clues use. snapshot is the date the run pretends is today."""
    businesses = load_businesses()
    holiday_history = load_holiday_history(snapshot)
    regular_hours_history = load_regular_hours_history(snapshot)
    return {
        "snapshot": snapshot,
        "businesses": businesses,
        "holiday_history": holiday_history,
        "holiday_history_by_date": group_by_date(holiday_history),
        "holiday_history_by_business": group_by_business(holiday_history),
        "last_owner_entry": last_entry_per_business(holiday_history),
        "regular_hours_history": regular_hours_history,
        "seasonal_types": find_seasonal_types(businesses, regular_hours_history),
        "peers": load_peers(),
        "city_sizes": load_city_sizes(),
        "true_closures": load_true_closures(businesses, snapshot),
        "true_closures_by_month": load_true_closures_by_month(businesses, snapshot),
        "google_user_edits": load_google_user_edits(snapshot),
        "holiday_on": load_holiday_calendar(),
        "snow_depth": load_snow_depth(snapshot),
        "snow_chance": load_snow_chance(),
        "reviews": load_reviews(snapshot),
    }


def load_questions(season):
    """Every (business, day) the season has to answer, in the order of the organisers' targets file."""
    return database().execute(
        "SELECT entity_id, date, day_key FROM evaluation_target WHERE season = ? ORDER BY rowid",
        (season,),
    ).fetchall()


def load_yext_questions(season):
    """The season's special days for businesses taken on from the team's Yext account.

    They aren't in the organisers' targets, so they get every holiday, eve and commercial day that the targets
    ask about in their country. Local events and school breaks are left out: they belong to particular cities.
    """
    return database().execute(
        """SELECT business.id AS entity_id, days.date, days.day_key
           FROM entity business
           JOIN (SELECT DISTINCT target.country, target.date, target.day_key
                 FROM evaluation_target target
                 JOIN calendar_special_day calendar
                   ON calendar.country = target.country AND calendar.date = target.date
                 WHERE target.season = ?) days
             ON days.country = business.country
           WHERE business.split = 'yext'
           ORDER BY business.id, days.date""",
        (season,),
    ).fetchall()


def load_businesses():
    """Every business and shopping centre by business ID, in the shape of the Yext entity they came from."""
    businesses = {}
    for row in database().execute("SELECT * FROM entity"):
        business = {
            "meta": {"id": row["id"], "countryCode": row["country"], "language": row["language"]},
            "name": row["name"],
            "c_segment": row["segment"],
            "address": {"city": row["city"]},
            "closed": bool(row["closed"]),
            "hours": json.loads(row["hours"]),
        }
        if row["shopping_centre_id"]:
            business["c_shoppingCenterEntityId"] = row["shopping_centre_id"]
        businesses[row["id"]] = business
    return businesses


def load_holiday_history(snapshot):
    """Special-day hours owners entered, by (business ID, holiday), in the order they were entered.

    When an owner changed their mind about a date, the later entry comes last.
    """
    history = defaultdict(list)
    rows = database().execute(
        """SELECT entity_id, date, day_key, holiday_hours, entered_at, source
           FROM holiday_hours_history
           WHERE entered_at < ?
           ORDER BY entity_id, day_key, entered_at, date""",
        (snapshot,),
    )
    for row in rows:
        entry = dict(row)
        entry["holidayHours"] = json.loads(entry.pop("holiday_hours"))
        history[(row["entity_id"], row["day_key"])].append(entry)
    return history


def group_by_date(holiday_history):
    """The same entries, by (business ID, date) instead of by holiday."""
    by_date = defaultdict(list)
    for entries in holiday_history.values():
        for entry in entries:
            by_date[(entry["entity_id"], entry["date"])].append(entry)
    return by_date


def group_by_business(holiday_history):
    """The same entries, by business ID only."""
    by_business = defaultdict(list)
    for (business_id, _), entries in holiday_history.items():
        by_business[business_id].extend(entries)
    return by_business


def last_entry_per_business(holiday_history):
    """The day each business last entered any special hours, by business ID."""
    last_entry = {}
    for (business_id, _), entries in holiday_history.items():
        for entry in entries:
            last_entry[business_id] = max(last_entry.get(business_id, ""), entry["entered_at"][:10])
    return last_entry


def load_regular_hours_history(snapshot):
    """Each business's published weekly hours, by business ID, oldest version first.

    The first version is always "before-2024", which a plain sort would put after the dates.
    """
    history = defaultdict(list)
    rows = database().execute(
        """SELECT entity_id, effective_from, hours
           FROM regular_hours_history
           WHERE effective_from = 'before-2024' OR effective_from < ?
           ORDER BY entity_id, effective_from = 'before-2024' DESC, effective_from""",
        (snapshot,),
    )
    for row in rows:
        history[row["entity_id"]].append(dict(row, hours=json.loads(row["hours"])))
    return history


def find_seasonal_types(businesses, regular_hours_history, min_businesses=3):
    """Business types where at least min_businesses businesses have published a seasonal break."""
    with_breaks = defaultdict(int)
    for business_id, versions in regular_hours_history.items():
        if published_breaks(versions):
            with_breaks[businesses[business_id]["c_segment"]] += 1
    return {business_type for business_type, count in with_breaks.items() if count >= min_businesses}


def load_peers():
    """What similar businesses entered on each holiday, by (country, city size, business type, holiday)."""
    peers = {}
    for row in database().execute("SELECT * FROM peer_benchmark"):
        peers[(row["country"], row["city_tier"], row["segment"], row["day_key"])] = dict(row)
    return peers


def load_city_sizes():
    """City name to size class, e.g. "Helsinki" -> "capital"."""
    return {row["name"]: row["city_tier"] for row in database().execute("SELECT name, city_tier FROM city")}


def load_holiday_calendar():
    """Which holiday a date is in each country, e.g. ("FI", "2025-12-26") -> "BOXING_DAY"."""
    holiday_on = {}
    for row in database().execute("SELECT country, date, day_key FROM calendar_special_day"):
        holiday_on[(row["country"], row["date"])] = row["day_key"]
    return holiday_on


def load_snow_depth(snapshot):
    """Snow depth in cm by (city, date): measured before the snapshot, or forecast for up to 10 days after it."""
    last_forecast_day = (date.fromisoformat(snapshot) + timedelta(days=10)).isoformat()

    snow_depth = {}
    rows = database().execute(
        """SELECT city, date, snow_depth_cm
           FROM weather_daily
           WHERE (is_forecast = 0 AND date < ?) OR (is_forecast = 1 AND date BETWEEN ? AND ?)""",
        (snapshot, snapshot, last_forecast_day),
    )
    for row in rows:
        snow_depth[(row["city"], row["date"])] = float(row["snow_depth_cm"])
    return snow_depth


def load_snow_chance():
    """The long-term chance of at least 10 cm of snow, by (city, month, day)."""
    snow_chance = {}
    for row in database().execute("SELECT city, month, day, p_snow_depth_ge_10cm FROM weather_normal"):
        snow_chance[(row["city"], row["month"], row["day"])] = row["p_snow_depth_ge_10cm"]
    return snow_chance


def load_true_closures(businesses, snapshot):
    """How often each dev business was really closed on each holiday, from the training data.

    Returns {(country, business type, holiday): {business ID: [days, closed days]}}.
    """
    closures = defaultdict(dict)
    for row in true_history_before(snapshot):
        business = businesses[row["entity_id"]]
        group = (business["meta"]["countryCode"], business["c_segment"], row["day_key"])
        counts = closures[group].setdefault(row["entity_id"], [0, 0])
        counts[0] += 1
        if row["truth_hours"] == "closed":
            counts[1] += 1
    return closures


def load_true_closures_by_month(businesses, snapshot):
    """Like load_true_closures, but by month instead of holiday, to see which types close for a season.

    Returns {(business type, month): {business ID: [days, closed days]}}.
    """
    closures = defaultdict(dict)
    for row in true_history_before(snapshot):
        group = (businesses[row["entity_id"]]["c_segment"], int(row["date"][5:7]))
        counts = closures[group].setdefault(row["entity_id"], [0, 0])
        counts[0] += 1
        if row["truth_hours"] == "closed":
            counts[1] += 1
    return closures


def true_history_before(snapshot):
    return database().execute(
        "SELECT entity_id, date, day_key, truth_hours FROM dev_truth_history WHERE date < ?",
        (snapshot,),
    )


def load_google_user_edits(snapshot):
    """Edits Google, Apple and Bing users suggested before the snapshot, by business ID.

    About half of them are wrong. Their status may have been decided after the snapshot.
    """
    edits = defaultdict(list)
    rows = database().execute(
        """SELECT entity_id, date_created, field_name, status, suggested_content
           FROM publisher_suggestion
           WHERE date_created < ?
           ORDER BY id""",
        (snapshot,),
    )
    for row in rows:
        edits[row["entity_id"]].append({
            "dateCreated": row["date_created"],
            "fieldName": row["field_name"],
            "status": row["status"],
            "suggestedContent": row["suggested_content"],
        })
    return edits


def load_reviews(snapshot):
    """Reviews written before the snapshot, by business ID. Each gets a "written_on" date.

    A review with only a rating has None as its content.
    """
    snapshot_date = date.fromisoformat(snapshot)

    reviews = defaultdict(list)
    rows = database().execute(
        "SELECT entity_id, rating, content, publisher_date FROM review ORDER BY entity_id, publisher_date, id"
    )
    for row in rows:
        written_on = date.fromtimestamp(row["publisher_date"] / 1000)
        if written_on < snapshot_date:
            reviews[row["entity_id"]].append({
                "rating": row["rating"],
                "content": row["content"],
                "written_on": written_on,
            })
    return reviews


@lru_cache(maxsize=1)
def database():
    """A read-only connection to the local database, after checking that it holds the full dataset."""
    path = database_path()
    try:
        connection = sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True)
        connection.row_factory = sqlite3.Row
        businesses = connection.execute("SELECT COUNT(*) FROM entity").fetchone()[0]
        has_training_data = connection.execute("SELECT EXISTS (SELECT 1 FROM dev_truth_history)").fetchone()[0]
    except sqlite3.OperationalError as error:
        raise SystemExit(f"Can't read the database at {path} ({error}). {HOW_TO_FILL}")

    # The limited set would quietly give worse guesses and overwrite predictions_2026.csv with a tiny file.
    if businesses < ALL_BUSINESSES or not has_training_data:
        raise SystemExit(f"The database holds {businesses} businesses, not the full dataset. {HOW_TO_FILL}")
    return connection


def database_path():
    """PREDICTOR_DB if set, otherwise the only database in the web app's local D1 folder."""
    if os.environ.get("PREDICTOR_DB"):
        return Path(os.environ["PREDICTOR_DB"]).resolve()

    found = [path for path in D1_FOLDER.glob("*.sqlite") if path.name != "metadata.sqlite"]
    if not found:
        raise SystemExit(f"No database in {D1_FOLDER}. {HOW_TO_FILL}")
    if len(found) > 1:
        raise SystemExit(f"Several databases in {D1_FOLDER}, set PREDICTOR_DB to the right one.")
    return found[0]
