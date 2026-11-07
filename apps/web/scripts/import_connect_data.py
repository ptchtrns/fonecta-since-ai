#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["pyarrow>=14"]
# ///
"""Load the Connect Suggests dataset into D1.

    pnpm db:migrate && pnpm db:seed             # everything, local (3.5M rows, 272 MB)
    pnpm db:seed:limited                        # limited set, local
    pnpm --filter web db:seed:remote            # limited set, deployed database

The limited set (--limited) is small enough for D1's free plan: the demo businesses and shopping centres, with
weather and peer data limited to what they use, and analytics and daily weather limited to SUBSET_SINCE onwards.

Every dataset table is emptied and refilled, so it is safe to re-run. App tables (user, job, ...) are not
touched, except prediction: its rows go with their businesses, so save them again with the predictor's
run.py --save. Wrangler runs the generated SQL, so run this from anywhere; it switches to apps/web itself.
"""

import argparse
import csv
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import pyarrow.parquet as pq

WEB_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = WEB_DIR.parents[1] / "data" / "fonecta-connect-suggests-2026"

# D1 rejects statements over 100 KB. A file is one `wrangler d1 execute` call.
MAX_STATEMENT_BYTES = 90_000
MAX_FILE_BYTES = 64 * 1024 * 1024

# The limited set: which businesses, and how far back its daily tables go. This keeps last year's holidays.
SUBSET_SPLITS = ("demo", "reference")
SUBSET_SINCE = "2025-11-01"

data_dir = DEFAULT_DATA_DIR


def read_csv(path):
    with open(data_dir / path, newline="", encoding="utf-8") as f:
        yield from csv.DictReader(f)


def read_jsonl(path):
    with open(data_dir / path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def read_json(path):
    with open(data_dir / path, encoding="utf-8") as f:
        return json.load(f)


def to_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def blank_to_none(value):
    return None if value == "" else value


def to_bool(value):
    return int(value in ("1", "True"))


def cities():
    for r in read_csv("data/cities.csv"):
        yield {
            "name": r["city"],
            "country": r["country"],
            "lat": float(r["lat"]),
            "lon": float(r["lon"]),
            "city_tier": r["city_tier"],
        }


def categories():
    for r in read_csv("data/categories.csv"):
        yield {
            "id": r["id"],
            "segment": r["segment"],
            "name_fi": r["name_fi"],
            "name_sv": r["name_sv"],
            "name_nb": r["name_nb"],
            "name_en": r["name_en"],
            "archetype": r["archetype"],
        }


def calendar_special_days():
    for r in read_csv("data/calendar_special_days.csv"):
        yield {
            "country": r["country"],
            "date": r["date"],
            "weekday": r["weekday"],
            "day_key": r["day_key"],
            "day_class": r["day_class"],
            "day_type": r["day_type"],
            "name_local": r["name_local"],
            "name_en": r["name_en"],
            "official_public_holiday": to_bool(r["official_public_holiday"]),
        }


def school_breaks():
    for r in read_csv("data/school_breaks.csv"):
        yield {
            "country": r["country"],
            "school_year_start": int(r["school_year_start"]),
            "break_name": r["break"],
            "start_date": r["start"],
            "end_date": r["end"],
            "note": blank_to_none(r["note"]),
        }


def weather_daily():
    for r in read_csv("data/weather_daily.csv"):
        yield {
            "city": r["city"],
            "country": r["country"],
            "date": r["date"],
            "tmean_c": float(r["tmean_c"]),
            "tmin_c": float(r["tmin_c"]),
            "tmax_c": float(r["tmax_c"]),
            "precip_mm": float(r["precip_mm"]),
            "snow_depth_cm": int(r["snow_depth_cm"]),
            "is_forecast": to_bool(r["is_forecast"]),
        }


def weather_normals():
    for r in read_csv("data/weather_normals.csv"):
        yield {
            "city": r["city"],
            "country": r["country"],
            "month": int(r["month"]),
            "day": int(r["day"]),
            "tmean_normal_c": float(r["tmean_normal_c"]),
            "p_snow_depth_ge_10cm": float(r["p_snow_depth_ge_10cm"]),
        }


def local_events():
    for e in read_json("data/local_events.json")["data"]:
        lon, lat = e["location"]["position"]["coordinates"]
        yield {
            "id": e["@id"],
            "name_fi": e["name"]["fi"],
            "name_sv": e["name"]["sv"],
            "name_nb": e["name"]["nb"],
            "name_en": e["name"]["en"],
            "start_time": e["start_time"],
            "end_time": e["end_time"],
            "venue_name": e["location"]["name"]["en"],
            "city": e["location"]["address_locality"],
            "country": e["x_country"],
            "lat": lat,
            "lon": lon,
            "keywords": to_json(e["keywords"]),
            "expected_attendance": e["x_expected_attendance"],
        }


def peer_benchmarks():
    for r in read_csv("data/peer_benchmarks.csv"):
        closed_share = r["closed_share_among_entered"]
        yield {
            "country": r["country"],
            "city_tier": r["city_tier"],
            "segment": r["segment"],
            "day_key": r["day_key"],
            "n_entity_days": int(r["n_entity_days"]),
            "share_no_exception_entered": float(r["share_no_exception_entered"]),
            "share_entered_closed": float(r["share_entered_closed"]),
            "share_entered_special_hours": float(r["share_entered_special_hours"]),
            "share_entered_regular": float(r["share_entered_regular"]),
            "closed_share_among_entered": float(closed_share) if closed_share else None,
            "median_open_special": blank_to_none(r["median_open_special"]),
            "median_close_special": blank_to_none(r["median_close_special"]),
        }


def entities():
    splits = {r["entity_id"]: r["split"] for r in read_csv("data/splits.csv")}
    rows = read_json("data/entities.json")["response"]["entities"]
    # Shopping centres first, so the self-reference resolves across insert batches.
    rows.sort(key=lambda e: e.get("c_entityRole") != "SHOPPING_CENTRE")
    for e in rows:
        meta = e["meta"]
        category_ids = e["categoryIds"]
        if len(category_ids) != 1:
            raise ValueError(f"{meta['id']}: expected one category, got {category_ids}")
        yield {
            "id": meta["id"],
            "uid": meta["uid"],
            "account_id": meta["accountId"],
            "folder_id": meta["folderId"],
            "entity_type": meta["entityType"],
            "labels": to_json(meta["labels"]),
            "country": meta["countryCode"],
            "language": meta["language"],
            "snapshot_at": meta["timestamp"],
            "name": e["name"],
            "address_line1": e["address"]["line1"],
            "city": e["address"]["city"],
            "postal_code": e["address"]["postalCode"],
            "latitude": e["geocodedCoordinate"]["latitude"],
            "longitude": e["geocodedCoordinate"]["longitude"],
            "main_phone": e["mainPhone"],
            "website_url": e["websiteUrl"]["url"],
            "category_id": category_ids[0],
            "segment": e["c_segment"],
            "timezone": e["timezone"],
            "hours": to_json(e["hours"]),
            "closed": int(e["closed"]),
            "connect_product": e["c_connectProduct"],
            "connect_customer_since": e["c_connectCustomerSince"],
            "shopping_centre_id": e.get("c_shoppingCenterEntityId"),
            "entity_role": e.get("c_entityRole"),
            "split": splits[meta["id"]],
        }


def customer_contacts():
    for r in read_csv("data/customer_contacts.csv"):
        yield {
            "entity_id": r["entity_id"],
            "contact_first_name": r["contact_first_name"],
            "preferred_channel": r["preferred_channel"],
            "preferred_language": r["preferred_language"],
            "email": r["email"],
            "mobile": r["mobile"],
            "best_contact_window": r["best_contact_window"],
            "standing_permission_holidays": to_bool(r["standing_permission_holidays"]),
            "opted_out_of_suggestions": to_bool(r["opted_out_of_suggestions"]),
        }


def holiday_hours_history():
    for r in read_jsonl("data/holiday_hours_history.jsonl"):
        yield {
            "entity_id": r["entity_id"],
            "date": r["date"],
            "entered_at": r["entered_at"],
            "day_key": r["day_key"],
            "holiday_hours": to_json(r["holidayHours"]),
            "source": r["source"],
        }


def regular_hours_history():
    for r in read_jsonl("data/regular_hours_history.jsonl"):
        yield {
            "entity_id": r["entity_id"],
            "effective_from": r["effective_from"],
            "hours": to_json(r["hours"]),
        }


def publisher_suggestions():
    for r in read_json("data/publisher_suggestions.json")["response"]["suggestions"]:
        yield {
            "id": r["id"],
            "publisher_id": r["publisherId"],
            "entity_id": r["locationId"],
            "date_created": r["dateCreated"],
            "date_resolved": r["dateResolved"],
            "field_name": r["fieldName"],
            "status": r["status"],
            "resolved_by": r["resolvedBy"],
            "original_content": r["originalContent"],
            "suggested_content": r["suggestedContent"],
        }


def reviews():
    for r in read_json("data/reviews.json")["response"]["reviews"]:
        yield {
            "id": r["id"],
            "entity_id": r["locationId"],
            "account_id": r["accountId"],
            "rating": int(r["rating"]),
            "content": blank_to_none(r["content"]),
            "author_name": r["authorName"],
            "url": blank_to_none(r["url"]),
            "publisher_date": r["publisherDate"],
            "publisher_id": r["publisherId"],
            "last_yext_update_time": r["lastYextUpdateTime"],
            "status": r["status"],
            "comments": to_json(r["comments"]),
        }


def analytics_daily():
    parquet = pq.ParquetFile(data_dir / "data/analytics_daily.parquet")
    for batch in parquet.iter_batches(batch_size=50_000):
        for r in batch.to_pylist():
            yield {
                "entity_id": r["entity_id"],
                "date": r["date"].isoformat(),
                "google_search_queries": r["GOOGLE_SEARCH_QUERIES"],
                "google_search_views": r["GOOGLE_SEARCH_VIEWS"],
                "google_map_views": r["GOOGLE_MAP_VIEWS"],
                "google_customer_actions": r["GOOGLE_CUSTOMER_ACTIONS"],
                "google_phone_calls": r["GOOGLE_PHONE_CALLS"],
                "profile_views": r["PROFILE_VIEWS"],
            }


def listings():
    for r in read_json("data/listings.json")["listings"]:
        yield {
            "entity_id": r["entityId"],
            "publisher_id": r["publisherId"],
            "publisher_name": r["publisherName"],
            "status": r["status"],
            "typical_update_speed_seconds": r["typicalUpdateSpeedSeconds"],
            "listing_url": r["listingUrl"],
        }


def pilot_decisions():
    for r in read_csv("data/pilot_decision_log_2025.csv"):
        yield {
            "suggestion_id": r["suggestion_id"],
            "message_id": r["message_id"],
            "entity_id": r["entity_id"],
            "date": r["date"],
            "day_key": r["day_key"],
            "displayed_before": r["displayed_before"],
            "suggested_hours": r["suggested_hours"],
            "basis": r["basis"],
            "channel": r["channel"],
            "language": r["language"],
            "sent_at": r["sent_at"],
            "decision": r["decision"],
            "final_hours": blank_to_none(r["final_hours"]),
            "decided_at": blank_to_none(r["decided_at"]),
            "owner_comment": blank_to_none(r["owner_comment"]),
            "standing_permission_granted": to_bool(r["standing_permission_granted"]),
        }


def evaluation_targets():
    for season, path in ((2026, "evaluation/targets_2026.csv"), (2025, "evaluation/targets_2025_backtest.csv")):
        for r in read_csv(path):
            yield {
                "entity_id": r["entity_id"],
                "date": r["date"],
                "season": season,
                "day_key": r["day_key"],
                "day_type": r["day_type"],
                "event_id": blank_to_none(r["event_id"]),
                "country": r["country"],
                "split": r["split"],
            }


def dev_truth_history():
    for r in read_csv("labels/dev_truth_history.csv"):
        yield {
            "entity_id": r["entity_id"],
            "date": r["date"],
            "day_key": r["day_key"],
            "event_id": blank_to_none(r["event_id"]),
            "truth_hours": r["truth_hours"],
            "displayed_hours_that_day": r["displayed_hours_that_day"],
        }


# In foreign key order: parents before children. Emptying runs in reverse.
TABLES = {
    "city": cities,
    "category": categories,
    "calendar_special_day": calendar_special_days,
    "school_break": school_breaks,
    "weather_daily": weather_daily,
    "weather_normal": weather_normals,
    "local_event": local_events,
    "peer_benchmark": peer_benchmarks,
    "entity": entities,
    "customer_contact": customer_contacts,
    "holiday_hours_history": holiday_hours_history,
    "regular_hours_history": regular_hours_history,
    "publisher_suggestion": publisher_suggestions,
    "review": reviews,
    "analytics_daily": analytics_daily,
    "listing": listings,
    "pilot_decision": pilot_decisions,
    "evaluation_target": evaluation_targets,
    "dev_truth_history": dev_truth_history,
}


def subset_filter():
    """Return a predicate (table, row) -> bool that keeps only what the limited set needs."""
    tiers = {r["city"]: r["city_tier"] for r in read_csv("data/cities.csv")}
    ids = {r["entity_id"] for r in read_csv("data/splits.csv") if r["split"] in SUBSET_SPLITS}
    chosen = [e for e in read_json("data/entities.json")["response"]["entities"] if e["meta"]["id"] in ids]
    cities = {e["address"]["city"] for e in chosen}
    peer_cells = {(e["meta"]["countryCode"], tiers[e["address"]["city"]], e["c_segment"]) for e in chosen}

    def keep(table, row):
        if table == "entity":
            return row["id"] in ids
        if table == "peer_benchmark":
            return (row["country"], row["city_tier"], row["segment"]) in peer_cells
        if table in ("weather_daily", "weather_normal") and row["city"] not in cities:
            return False
        if table in ("weather_daily", "analytics_daily") and row["date"] < SUBSET_SINCE:
            return False
        return "entity_id" not in row or row["entity_id"] in ids

    return keep


def sql_value(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + value.replace("'", "''") + "'"


def insert_statements(table, rows):
    """Yield multi-row INSERTs, each under MAX_STATEMENT_BYTES, and report the row count at the end."""
    head = None
    values = []
    size = 0
    count = 0
    for row in rows:
        if head is None:
            head = f"INSERT INTO `{table}` ({','.join(f'`{c}`' for c in row)}) VALUES\n"
        value = "(" + ",".join(sql_value(v) for v in row.values()) + ")"
        value_size = len(value.encode()) + 2
        if values and len(head) + size + value_size > MAX_STATEMENT_BYTES:
            yield head + ",\n".join(values) + ";\n"
            values, size = [], 0
        values.append(value)
        size += value_size
        count += 1
    if values:
        yield head + ",\n".join(values) + ";\n"
    return count


class SqlFiles:
    """Splits generated statements across files of at most MAX_FILE_BYTES."""

    def __init__(self, directory):
        self.directory = Path(directory)
        self.paths = []
        self.file = None
        self.size = 0

    def write(self, statement):
        data = statement.encode()
        if self.file is None or self.size + len(data) > MAX_FILE_BYTES:
            self.close()
            self.paths.append(self.directory / f"{len(self.paths):04}.sql")
            self.file = open(self.paths[-1], "wb")
            self.size = 0
        self.file.write(data)
        self.size += len(data)

    def close(self):
        if self.file:
            self.file.close()
            self.file = None


def wrangler(target_args, *args):
    command = ["pnpm", "exec", "wrangler", "d1", "execute", "DB", *target_args, *args]
    done = subprocess.run(command, cwd=WEB_DIR, stdout=subprocess.PIPE, text=True)
    if done.returncode != 0:
        sys.exit(f"wrangler failed:\n{done.stdout}")
    return done.stdout


def main():
    global data_dir

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--local", action="store_true", help="load the local D1 database")
    target.add_argument("--remote", action="store_true", help="load the deployed D1 database")
    parser.add_argument("--limited", action="store_true", help="load the limited set instead of everything")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--persist-to", type=Path, help="local state directory, passed to wrangler")
    parser.add_argument("--skip", nargs="*", default=[], choices=TABLES, metavar="TABLE", help="tables to leave alone")
    args = parser.parse_args()

    data_dir = args.data_dir
    tables = {name: rows for name, rows in TABLES.items() if name not in args.skip}
    keep = subset_filter() if args.limited else None

    if args.remote:
        load = "the limited set" if args.limited else "ALL the data, which exceeds D1's free plan write limit,"
        answer = input(f"This empties {len(tables)} tables in the REMOTE database and loads {load}. Type 'yes': ")
        if answer != "yes":
            sys.exit("Aborted.")

    target_args = ["--remote" if args.remote else "--local", "--yes"]
    if args.persist_to:
        target_args += ["--persist-to", str(args.persist_to.resolve())]

    expected = {}
    with tempfile.TemporaryDirectory() as tmp:
        files = SqlFiles(tmp)
        for name in reversed(list(tables)):
            files.write(f"DELETE FROM `{name}`;\n")
        for name, rows in tables.items():
            source = rows() if keep is None else (row for row in rows() if keep(name, row))
            statements = insert_statements(name, source)
            while True:
                try:
                    files.write(next(statements))
                except StopIteration as done:
                    expected[name] = done.value
                    break
            print(f"prepared {name}: {expected[name]} rows", flush=True)
        files.close()

        for i, path in enumerate(files.paths, 1):
            print(f"executing file {i}/{len(files.paths)} ({path.stat().st_size // 1024} KB)", flush=True)
            wrangler(target_args, "--file", str(path))

    # One statement per table: D1 caps the number of terms in a compound SELECT.
    counts = ";".join(f"SELECT '{name}' AS name, COUNT(*) AS n FROM `{name}`" for name in tables)
    result = json.loads(wrangler(target_args, "--json", "--command", counts))
    actual = {r["results"][0]["name"]: r["results"][0]["n"] for r in result}
    wrong = {name: (actual.get(name), n) for name, n in expected.items() if actual.get(name) != n}
    if wrong:
        sys.exit(f"Row counts differ (actual, expected): {wrong}")
    print(f"Done: {sum(expected.values())} rows in {len(expected)} tables, counts match the source files.")


if __name__ == "__main__":
    main()
