"""Loads the challenge data, keeping only what Connect knew on the snapshot date.

Everything entered, published or written on or after the snapshot is dropped here, so no clue
can accidentally look into the future.
"""

import csv
import json
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

from hours import published_breaks

DATA = Path(__file__).parents[2] / "data" / "fonecta-connect-suggests-2026" / "data"
LABELS = DATA.parent / "labels"


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


def load_businesses():
    """Every business and shopping centre from entities.json, by business ID."""
    businesses = {}
    for business in read_json("entities.json")["response"]["entities"]:
        businesses[business["meta"]["id"]] = business
    return businesses


def load_holiday_history(snapshot):
    """Special-day hours owners entered, by (business ID, holiday), in the order they were entered.

    When an owner changed their mind about a date, the later entry comes last.
    """
    history = defaultdict(list)
    for entry in read_jsonl("holiday_hours_history.jsonl"):
        if entry["entered_at"] < snapshot:
            history[(entry["entity_id"], entry["day_key"])].append(entry)

    for entries in history.values():
        entries.sort(key=lambda entry: entry["entered_at"])
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

    The first version is always "before-2024".
    """
    history = defaultdict(list)
    for version in read_jsonl("regular_hours_history.jsonl"):
        if version["effective_from"] == "before-2024" or version["effective_from"] < snapshot:
            history[version["entity_id"]].append(version)
    return history


def find_seasonal_types(businesses, regular_hours_history, min_businesses=3):
    """Business types where at least min_businesses businesses have published a seasonal break."""
    with_breaks = defaultdict(int)
    for business_id, versions in regular_hours_history.items():
        if published_breaks(versions):
            with_breaks[businesses[business_id]["c_segment"]] += 1
    return {business_type for business_type, count in with_breaks.items() if count >= min_businesses}


def load_peers():
    """What similar businesses entered on each holiday, by (country, city size, business type, holiday).

    All values are strings, as in the CSV.
    """
    peers = {}
    for row in read_csv(DATA / "peer_benchmarks.csv"):
        peers[(row["country"], row["city_tier"], row["segment"], row["day_key"])] = row
    return peers


def load_city_sizes():
    """City name to size class, e.g. "Helsinki" -> "capital"."""
    city_sizes = {}
    for row in read_csv(DATA / "cities.csv"):
        city_sizes[row["city"]] = row["city_tier"]
    return city_sizes


def load_holiday_calendar():
    """Which holiday a date is in each country, e.g. ("FI", "2025-12-26") -> "BOXING_DAY"."""
    holiday_on = {}
    for row in read_csv(DATA / "calendar_special_days.csv"):
        holiday_on[(row["country"], row["date"])] = row["day_key"]
    return holiday_on


def load_snow_depth(snapshot):
    """Snow depth in cm by (city, date): measured before the snapshot, or forecast for up to 10 days after it."""
    last_forecast_day = (date.fromisoformat(snapshot) + timedelta(days=10)).isoformat()

    snow_depth = {}
    for row in read_csv(DATA / "weather_daily.csv"):
        measured = row["is_forecast"] == "0" and row["date"] < snapshot
        forecast = row["is_forecast"] == "1" and snapshot <= row["date"] <= last_forecast_day
        if measured or forecast:
            snow_depth[(row["city"], row["date"])] = float(row["snow_depth_cm"])
    return snow_depth


def load_snow_chance():
    """The long-term chance of at least 10 cm of snow, by (city, month, day)."""
    snow_chance = {}
    for row in read_csv(DATA / "weather_normals.csv"):
        snow_chance[(row["city"], int(row["month"]), int(row["day"]))] = float(row["p_snow_depth_ge_10cm"])
    return snow_chance


def load_true_closures(businesses, snapshot):
    """How often each dev business was really closed on each holiday, from the training data.

    Returns {(country, business type, holiday): {business ID: [days, closed days]}}.
    """
    closures = defaultdict(dict)
    for row in read_csv(LABELS / "dev_truth_history.csv"):
        if row["date"] >= snapshot:
            continue

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
    for row in read_csv(LABELS / "dev_truth_history.csv"):
        if row["date"] >= snapshot:
            continue

        group = (businesses[row["entity_id"]]["c_segment"], int(row["date"][5:7]))
        counts = closures[group].setdefault(row["entity_id"], [0, 0])
        counts[0] += 1
        if row["truth_hours"] == "closed":
            counts[1] += 1
    return closures


def load_google_user_edits(snapshot):
    """Edits Google, Apple and Bing users suggested before the snapshot, by business ID.

    About half of them are wrong. Their status may have been decided after the snapshot.
    """
    edits = defaultdict(list)
    for edit in read_json("publisher_suggestions.json")["response"]["suggestions"]:
        if edit["dateCreated"] < snapshot:
            edits[edit["locationId"]].append(edit)
    return edits


def load_reviews(snapshot):
    """Reviews written before the snapshot, by business ID. Each gets a "written_on" date."""
    snapshot_date = date.fromisoformat(snapshot)

    reviews = defaultdict(list)
    for review in read_json("reviews.json")["response"]["reviews"]:
        review["written_on"] = date.fromtimestamp(review["publisherDate"] / 1000)
        if review["written_on"] < snapshot_date:
            reviews[review["locationId"]].append(review)
    return reviews


def read_json(name):
    with open(DATA / name, encoding="utf-8") as file:
        return json.load(file)


def read_jsonl(name):
    with open(DATA / name, encoding="utf-8") as file:
        return [json.loads(line) for line in file]


def read_csv(path):
    with open(path, encoding="utf-8") as file:
        return list(csv.DictReader(file))
