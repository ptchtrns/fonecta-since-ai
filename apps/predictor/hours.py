"""Opening-hours helpers: converting the data's hours format and working out what Google shows."""

from datetime import date

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def hours_to_text(hours):
    """Convert one day's hours from the data's format to text, e.g. "10:00-14:00,17:00-22:00" or "closed"."""
    if not hours or hours.get("isClosed") or not hours.get("openIntervals"):
        return "closed"

    parts = []
    for interval in hours["openIntervals"]:
        parts.append(interval["start"] + "-" + interval["end"])

    return ",".join(parts)


def weekday_of(day):
    """Return the weekday name used in the data, e.g. "2026-12-24" -> "thursday"."""
    return WEEKDAYS[date.fromisoformat(day).weekday()]


def normal_hours(data, business, day, as_of=None):
    """Return the business's normal hours for the weekday of this day.

    Uses the weekly hours that were published on as_of, which defaults to the snapshot date.
    """
    as_of = as_of or data["snapshot"]

    published = None
    for version in data["regular_hours_history"][business["meta"]["id"]]:
        if version["effective_from"] == "before-2024" or version["effective_from"] < as_of:
            published = version

    return hours_to_text(published["hours"].get(weekday_of(day)))


def shown_on_google_now(business, day):
    """Return what Google shows for this day, according to entities.json.

    entities.json is a picture of the listings on 6 Nov 2026, so this only works for the 2026 season.
    """
    hours = business["hours"]
    closed_for_good = business.get("closed")
    on_seasonal_break = hours.get("reopenDate") and day < hours["reopenDate"]

    if closed_for_good or on_seasonal_break:
        return "closed"

    for special_day in hours.get("holidayHours", []):
        if special_day["date"] == day and not special_day.get("isRegularHours"):
            return hours_to_text(special_day)

    return hours_to_text(hours.get(weekday_of(day)))


def shown_on_google_back_then(data, business, day):
    """Return what Google showed for this day on the snapshot date, rebuilt from the history files.

    Used for the 2025 back-test. It can't see closed-for-good or seasonal-break flags, which only
    exist for today, so it is slightly less exact than shown_on_google_now.
    """
    entries_for_this_day = data["holiday_history_by_date"][(business["meta"]["id"], day)]

    special_hours = None
    for entry in entries_for_this_day:
        if entry["entered_at"] < data["snapshot"]:
            special_hours = entry["holidayHours"]

    if special_hours and not special_hours.get("isRegularHours"):
        return hours_to_text(special_hours)

    return normal_hours(data, business, day)
