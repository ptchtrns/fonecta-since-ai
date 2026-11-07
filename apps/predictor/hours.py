"""Opening hours as text, like "10:00-14:00,17:00-22:00" or "closed", and what Google shows."""

from datetime import date

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def hours_to_text(hours):
    """Turn the data's hours format ({"openIntervals": [...]} or {"isClosed": true}) into text."""
    if not hours or hours.get("isClosed") or not hours.get("openIntervals"):
        return "closed"

    parts = []
    for interval in hours["openIntervals"]:
        parts.append(interval["start"] + "-" + interval["end"])

    return ",".join(parts)


def is_one_interval(hours):
    """True for hours like "10:00-17:00": open, without a break in the middle."""
    return hours != "closed" and "," not in hours


def weekday_of(day):
    """The weekday name used in the data: "2026-12-24" -> "thursday"."""
    return WEEKDAYS[date.fromisoformat(day).weekday()]


def normal_hours(data, business, day, as_of=None):
    """The business's normal hours on the weekday of this day, as published on as_of (default: the snapshot)."""
    as_of = as_of or data["snapshot"]

    published = None
    for version in data["regular_hours_history"][business["meta"]["id"]]:
        if version["effective_from"] == "before-2024" or version["effective_from"] < as_of:
            published = version

    return hours_to_text(published["hours"].get(weekday_of(day)))


def published_breaks(versions):
    """[(start, end)] of the breaks in a business's published weekly hours: versions with every day closed.

    end is the day the next version took over, or "9999" if the break is still going on.
    """
    breaks = []
    for number, version in enumerate(versions):
        every_day_closed = all(hours_to_text(version["hours"].get(weekday)) == "closed" for weekday in WEEKDAYS)
        if every_day_closed and version["effective_from"] != "before-2024":
            is_last = number == len(versions) - 1
            end = "9999" if is_last else versions[number + 1]["effective_from"]
            breaks.append((version["effective_from"], end))
    return breaks


def shown_on_google_now(business, day):
    """What Google shows for this day, read from entities.json: the listings as they are on 6 Nov 2026."""
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
    """What Google showed for this day on the snapshot date, rebuilt from the history. For the 2025 back-test.

    The history has no closed-for-good or seasonal-break flags, so this is slightly less exact than
    shown_on_google_now.
    """
    entries = data["holiday_history_by_date"][(business["meta"]["id"], day)]
    if entries and not entries[-1]["holidayHours"].get("isRegularHours"):
        return hours_to_text(entries[-1]["holidayHours"])

    return normal_hours(data, business, day)
