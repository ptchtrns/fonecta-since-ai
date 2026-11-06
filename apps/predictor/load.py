import csv
import json
from collections import defaultdict
from pathlib import Path

DATA = Path(__file__).parents[2] / "data" / "fonecta-connect-suggests-2026" / "data"


def load_businesses():
    """Returns {business_id: business}"""
    with open(DATA / "entities.json", encoding="utf-8") as file:
        businesses = json.load(file)["response"]["entities"]

    by_id = {}
    for business in businesses:
        by_id[business["meta"]["id"]] = business
    return by_id


def load_holiday_history():
    """Returns {(business_id, holiday): [past entries, oldest first]}"""
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
    """Returns {business_id: [regular hours versions]}"""
    history = defaultdict(list)

    with open(DATA / "regular_hours_history.jsonl", encoding="utf-8") as file:
        for line in file:
            version = json.loads(line)
            history[version["entity_id"]].append(version)
    return history


def load_peers():
    """Returns {(country, city_size, business_type, holiday): stats}"""
    peers = {}

    with open(DATA / "peer_benchmarks.csv", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            key = (row["country"], row["city_tier"], row["segment"], row["day_key"])
            peers[key] = row
    return peers


def load_city_sizes():
    """Returns {city_name: city_size}  e.g. {"Helsinki": "capital"}"""
    city_sizes = {}

    with open(DATA / "cities.csv", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            city_sizes[row["city"]] = row["city_tier"]
    return city_sizes


def load_holiday_dates():
    """Returns {(country, holiday): [dates]}  e.g. {("FI", "XMAS_EVE"): ["2024-12-24", ...]}"""
    dates = defaultdict(list)

    with open(DATA / "calendar_special_days.csv", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            dates[(row["country"], row["day_key"])].append(row["date"])
    return dates


def load_google_user_edits():
    """Returns {business_id: [edits suggested by Google users]}"""
    with open(DATA / "publisher_suggestions.json", encoding="utf-8") as file:
        edits = json.load(file)["response"]["suggestions"]

    by_business = defaultdict(list)
    for edit in edits:
        by_business[edit["locationId"]].append(edit)
    return by_business


def load_reviews():
    """Returns {business_id: [reviews]}"""
    with open(DATA / "reviews.json", encoding="utf-8") as file:
        reviews = json.load(file)["response"]["reviews"]

    by_business = defaultdict(list)
    for review in reviews:
        by_business[review["locationId"]].append(review)
    return by_business


def load_everything():
    """Loads every data file once. Returns a dict, e.g. data["businesses"]["FI-D0001"]"""
    return {
        "businesses": load_businesses(),
        "holiday_history": load_holiday_history(),
        "regular_hours_history": load_regular_hours_history(),
        "peers": load_peers(),
        "city_sizes": load_city_sizes(),
        "holiday_dates": load_holiday_dates(),
        "google_user_edits": load_google_user_edits(),
        "reviews": load_reviews(),
    }
