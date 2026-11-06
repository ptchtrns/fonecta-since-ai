"""Reads the challenge data files and groups the rows so they can be looked up by business."""

import csv
import json
from collections import defaultdict
from pathlib import Path

DATA = Path(__file__).parents[2] / "data" / "fonecta-connect-suggests-2026" / "data"


def load_businesses():
    """Load every business and shopping centre.

    Returns {business_id: business}, where business is the entity from entities.json.
    """
    with open(DATA / "entities.json", encoding="utf-8") as file:
        businesses = json.load(file)["response"]["entities"]

    by_id = {}
    for business in businesses:
        by_id[business["meta"]["id"]] = business
    return by_id


def load_holiday_history():
    """Load every special-day entry owners have made since 2024.

    Returns {(business_id, holiday): [entries]}. Entries are in the order they were entered,
    so when an owner changed their mind about a date, the later entry comes last.
    """
    history = defaultdict(list)

    with open(DATA / "holiday_hours_history.jsonl", encoding="utf-8") as file:
        for line in file:
            entry = json.loads(line)
            key = (entry["entity_id"], entry["day_key"])
            history[key].append(entry)

    for entries in history.values():
        entries.sort(key=lambda entry: entry["entered_at"])
    return history


def load_regular_hours_history():
    """Load every published version of each business's normal weekly hours.

    Returns {business_id: [versions]}, oldest first. The first version is always "before-2024".
    """
    history = defaultdict(list)

    with open(DATA / "regular_hours_history.jsonl", encoding="utf-8") as file:
        for line in file:
            version = json.loads(line)
            history[version["entity_id"]].append(version)
    return history


def load_peers():
    """Load what similar businesses entered on each holiday.

    Returns {(country, city_size, business_type, holiday): stats}. All stats are strings.
    """
    peers = {}

    with open(DATA / "peer_benchmarks.csv", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            key = (row["country"], row["city_tier"], row["segment"], row["day_key"])
            peers[key] = row
    return peers


def load_city_sizes():
    """Load the size class of each city, e.g. {"Helsinki": "capital"}."""
    city_sizes = {}

    with open(DATA / "cities.csv", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            city_sizes[row["city"]] = row["city_tier"]
    return city_sizes


def load_holiday_dates():
    """Load the date of each holiday in every year, e.g. {("FI", "XMAS_EVE"): ["2024-12-24", ...]}."""
    dates = defaultdict(list)

    with open(DATA / "calendar_special_days.csv", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            dates[(row["country"], row["day_key"])].append(row["date"])
    return dates


def load_google_user_edits():
    """Load the edits Google, Apple and Bing users have suggested.

    Returns {business_id: [edits]}. Roughly half of them are wrong.
    """
    with open(DATA / "publisher_suggestions.json", encoding="utf-8") as file:
        edits = json.load(file)["response"]["suggestions"]

    by_business = defaultdict(list)
    for edit in edits:
        by_business[edit["locationId"]].append(edit)
    return by_business


def load_reviews():
    """Load customer reviews, returned as {business_id: [reviews]}."""
    with open(DATA / "reviews.json", encoding="utf-8") as file:
        reviews = json.load(file)["response"]["reviews"]

    by_business = defaultdict(list)
    for review in reviews:
        by_business[review["locationId"]].append(review)
    return by_business


def group_by_date(holiday_history):
    """Regroup the holiday history by exact date instead of by holiday.

    Returns {(business_id, date): [entries]}, in the order they were entered.
    """
    by_date = defaultdict(list)
    for entries in holiday_history.values():
        for entry in entries:
            by_date[(entry["entity_id"], entry["date"])].append(entry)
    return by_date


def load_everything(snapshot):
    """Load every data file once into one dict, e.g. data["businesses"]["FI-D0001"].

    snapshot is the date the run pretends is today. Nothing entered after it may be used.
    """
    holiday_history = load_holiday_history()
    return {
        "snapshot": snapshot,
        "businesses": load_businesses(),
        "holiday_history": holiday_history,
        "holiday_history_by_date": group_by_date(holiday_history),
        "regular_hours_history": load_regular_hours_history(),
        "peers": load_peers(),
        "city_sizes": load_city_sizes(),
        "holiday_dates": load_holiday_dates(),
        "google_user_edits": load_google_user_edits(),
        "reviews": load_reviews(),
    }
